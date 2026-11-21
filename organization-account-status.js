import { createPULSOClient, resolvePULSODestination } from './account-routing.js';

const $ = (selector, root=document) => root.querySelector(selector);
const esc = value => String(value ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const dateLabel = value => { if(!value)return '—'; const date=new Date(value); return Number.isNaN(date.valueOf())?'—':new Intl.DateTimeFormat('pt-AO',{dateStyle:'medium',timeStyle:'short'}).format(date); };
const type = new URLSearchParams(location.search).get('type') === 'partnership' ? 'partnership' : 'business';
const loading = $('#statusLoading');
const page = $('#accountStatusPage');
const states = { business:{suspended:'Conta empresarial suspensa',rejected:'Pedido empresarial rejeitado'}, partnership:{suspended:'Parceria suspensa',rejected:'Pedido de parceria rejeitado'} };

async function init(){
  try{
    const supabase=await createPULSOClient();
    const {data,error}=await supabase.auth.getSession();
    if(error)throw error;
    const user=data.session?.user;
    if(!user){location.replace(`./empresas-parceiros.html?flow=${type==='business'?'business':'partnership'}&view=requests`);return;}
    supabase.auth.onAuthStateChange((_event,session)=>{
      if(!session?.user){location.replace('./index.html');return;}
      if(session.user.id!==user.id)location.reload();
    });
    const destination=await resolvePULSODestination(supabase,user);
    if(!destination.includes('organization-account-status.html')){location.replace(destination);return;}
    const table=type==='business'?'business_verification_requests':'partnership_requests';
    const select=type==='business'?'id,status,status_note,submitted_at,created_at':'id,status,status_note,submitted_at,created_at';
    const {data:rows,error:requestError}=await supabase.from(table).select(select).eq('user_id',user.id).order('created_at',{ascending:false}).limit(10);
    if(requestError)throw requestError;
    const request=rows?.[0];
    if(!request||!['suspended','rejected'].includes(request.status)){location.replace(destination);return;}
    const {data:history,error:historyError}=await supabase.from('organizational_account_status_history')
      .select('previous_status,new_status,status_note,changed_at').eq('user_id',user.id)
      .eq('request_type',type).eq('request_id',request.id).order('changed_at',{ascending:false}).limit(100);
    if(historyError)throw historyError;
    const stateLabel=states[type][request.status]||'Estado da conta';
    page.innerHTML=`<header class="org-topbar"><a class="org-brand" href="./index.html"><img src="assets/pulso-mark-3d-small.png" alt=""><span><strong>PULSO</strong><small>ESTADO DA CONTA</small></span></a><div class="org-top-actions"><a href="./index.html">Página inicial</a></div></header><section class="org-card" style="width:min(100% - 28px,760px);margin:44px auto"><span class="org-kicker">${type==='business'?'CONTA EMPRESARIAL':'PARCERIA PULSO'}</span><h1 style="font:800 clamp(28px,5vw,42px)/1.1 Manrope,sans-serif;color:#071a50">${esc(stateLabel)}</h1><p>Submetido em ${esc(dateLabel(request.submitted_at||request.created_at))}</p>${request.status_note?`<div class="org-feedback">${esc(request.status_note)}</div>`:''}<p>Esta decisão restringe as funcionalidades reservadas ao tipo de conta. Para esclarecimentos ou para pedir uma revisão, contacta a equipa PULSO.</p><h2>Histórico do processo</h2>${history?.length?`<div class="org-history">${history.map(item=>`<article class="org-history-item"><b>${esc(item.previous_status||'Pedido recebido')} → ${esc(item.new_status)}</b><small>${esc(dateLabel(item.changed_at))}</small>${item.status_note?`<p>${esc(item.status_note)}</p>`:''}</article>`).join('')}</div>`:'<div class="org-empty">Não há alterações anteriores registadas.</div>'}<div class="org-actions"><a class="org-button org-button-secondary" href="./empresas-parceiros.html?flow=${type==='business'?'business':'partnership'}&view=requests">Consultar pedidos</a><a class="org-button" href="mailto:pulsobussines@gmail.com">Contactar o PULSO</a></div></section>`;
    page.hidden=false;loading.hidden=true;
  }catch(error){
    console.error('PULSO account status could not be loaded',error);
    loading.innerHTML='<div class="org-empty"><b>Não foi possível consultar o estado.</b><br>Regressa ao portal de empresas e parceiros e tenta novamente.<p><a href="./empresas-parceiros.html">Abrir portal</a></p></div>';
  }
}
void init();
