import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, AUTH_REDIRECT_URL } from './supabase-config.js';

const entries = [
  {id:'demo-01',title:'Assistente de Operações',org:'Organização de demonstração',initials:'OD',category:'Empregos',place:'Luanda',date:'Exemplo',kind:'Publicação de exemplo',tone:'',status:'Demonstração',summary:'Cartão ilustrativo para demonstrar como uma oportunidade poderá ser apresentada quando houver uma fonte oficial validada.'},
  {id:'demo-02',title:'Bolsa de Estudos — Ciências e Tecnologia',org:'Programa de demonstração',initials:'PD',category:'Bolsas',place:'Angola · Internacional',date:'Exemplo',kind:'Programa ilustrativo',tone:'gold',status:'Demonstração',summary:'Exemplo visual de bolsa. Não representa uma candidatura aberta nem um programa actualmente disponível.'},
  {id:'demo-03',title:'Concurso Público — Perfil Administrativo',org:'Instituição de demonstração',initials:'ID',category:'Concursos',place:'Luanda',date:'Exemplo',kind:'Concurso ilustrativo',tone:'rose',status:'Demonstração',summary:'Exemplo de como um concurso público será identificado. Não há anúncio oficial associado a este cartão.'},
  {id:'demo-04',title:'Estágio Profissional em Contabilidade',org:'Entidade de demonstração',initials:'ED',category:'Estágios',place:'Benguela',date:'Exemplo',kind:'Estágio ilustrativo',tone:'green',status:'Demonstração',summary:'Cartão de demonstração. Os dados de localização e área são apenas ilustrativos.'},
  {id:'demo-05',title:'Formação introdutória em competências digitais',org:'Centro de demonstração',initials:'CD',category:'Formação',place:'Online',date:'Exemplo',kind:'Formação ilustrativa',tone:'',status:'Demonstração',summary:'Exemplo de apresentação de formação. Não é uma inscrição ou oferta real.'},
  {id:'demo-06',title:'Analista de Dados — Oportunidade ilustrativa',org:'Empresa de demonstração',initials:'EM',category:'Empregos',place:'Luanda',date:'Exemplo',kind:'Vaga ilustrativa',tone:'gold',status:'Demonstração',summary:'Vaga inteiramente demonstrativa, sem empresa, requisitos ou processo de candidatura reais.'}
];
const organizations = [
  {name:'Instituição de exemplo',type:'Sector público · demonstração',initials:'IE',tone:''},
  {name:'Empresa ilustrativa',type:'Tecnologia · demonstração',initials:'EI',tone:'c2'},
  {name:'Programa de exemplo',type:'Educação · demonstração',initials:'PE',tone:'c3'},
  {name:'Organização ilustrativa',type:'Serviços · demonstração',initials:'OI',tone:'c4'}
];
let selectedCategory='Todas';
let searchTerm='';
let showAll=false;
let toastTimer;
let supabaseClient=null;
let currentUser=null;
const $=(selector,root=document)=>root.querySelector(selector);
const $$=(selector,root=document)=>[...root.querySelectorAll(selector)];
const saved=()=>{try{return JSON.parse(localStorage.getItem('pulso-saved')||'[]')}catch{return []}};
function notify(message){const el=$('#toast');el.textContent=message;el.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.classList.remove('show'),3000)}
function esc(value){return String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
function formMessage(form,message,kind='info'){
  const box=$('.form-feedback',form);
  if(!box)return;
  box.textContent=message;
  box.dataset.kind=kind;
  box.hidden=!message;
}
function setFormBusy(form,busy,label='Aguarda…'){
  const button=$('button[type="submit"]',form);
  if(!button)return;
  if(busy){button.dataset.originalLabel=button.textContent;button.disabled=true;button.textContent=label}
  else{button.disabled=false;if(button.dataset.originalLabel)button.textContent=button.dataset.originalLabel;delete button.dataset.originalLabel}
}
function updateAuthControls(user){
  currentUser=user||null;
  $$('[data-auth-state="signed-out"]').forEach(el=>{el.hidden=Boolean(currentUser)});
  $$('[data-auth-state="signed-in"]').forEach(el=>{el.hidden=!currentUser});
}
function renderEntries(){
  const filtered=entries.filter(item=>{
    const byCategory=selectedCategory==='Todas'||item.category===selectedCategory;
    const haystack=[item.title,item.org,item.category,item.place,item.kind].join(' ').toLocaleLowerCase('pt');
    return byCategory&&haystack.includes(searchTerm.toLocaleLowerCase('pt'));
  });
  const shown=showAll?filtered:filtered.slice(0,4);
  $('#opportunityList').innerHTML=shown.length?shown.map(item=>{
    const isSaved=saved().includes(item.id);
    return `<article class="op-card"><div class="org-mark ${esc(item.tone)}" aria-hidden="true">${esc(item.initials)}</div><div class="op-copy"><h3>${esc(item.title)}</h3><span class="org-name">${esc(item.org)}</span><div class="op-meta"><span>⌖ ${esc(item.place)}</span><span>◷ ${esc(item.kind)}</span></div></div><span class="op-badge demo">${esc(item.status)}</span><button class="detail-btn" data-detail="${esc(item.id)}" aria-label="Ver detalhe de ${esc(item.title)}">↗</button><button class="save-btn ${isSaved?'saved':''}" data-save="${esc(item.id)}" aria-label="${isSaved?'Remover dos guardados':'Guardar'} ${esc(item.title)}">${isSaved?'♥':'♡'}</button></article>`;
  }).join(''):'<div class="empty-state"><b>Não encontrámos resultados.</b>Experimenta outra pesquisa ou categoria.</div>';
  $('#resultsNote').textContent=searchTerm?`${filtered.length} resultado(s) para “${searchTerm}” · exemplos demonstrativos`:'';
  $('#loadMore').hidden=filtered.length<=4||showAll;
}
function renderCompanies(){
  $('#companyGrid').innerHTML=organizations.map(org=>`<article class="company-card"><span class="company-logo ${org.tone}">${org.initials}</span><span><b>${org.name}</b><small>${org.type}</small></span><span class="company-arrow">↗</span></article>`).join('');
}
const modal=$('#appModal');
function openModal(type,id){
  const body=$('#modalBody');
  if(type==='detail'){
    const item=entries.find(x=>x.id===id);if(!item)return;
    body.innerHTML=`<div class="modal-inner"><div class="modal-brand"><img src="assets/pulso-mark-3d-small.png" alt=""> OPORTUNIDADE · EXEMPLO</div><h2 id="modalTitle">${esc(item.title)}</h2><p>${esc(item.org)} · ${esc(item.place)}</p><div class="modal-meta"><span class="modal-pill">${esc(item.category)}</span><span class="modal-pill">Demonstração</span></div><p>${esc(item.summary)}</p><div class="source-box"><b>Origem:</b> item fictício para demonstração visual. Não existe publicação original nem link de candidatura associado. O PULSO não o apresenta como confirmado.</div><button class="btn btn-outline-blue" data-modal-save="${esc(item.id)}">${saved().includes(item.id)?'Remover dos guardados':'Guardar exemplo'}</button></div>`;
  }else if(type==='login'){
    body.innerHTML=`<div class="modal-inner"><div class="modal-brand"><img src="assets/pulso-mark-3d-small.png" alt=""> PULSO</div><h2 id="modalTitle">Que bom ter-te de volta.</h2><p>Entra na tua conta PULSO com o e-mail e a palavra-passe.</p><form class="form-stack" id="authLoginForm"><label>E-mail<input type="email" name="email" autocomplete="email" placeholder="nome@exemplo.com" required></label><label>Palavra-passe<input type="password" name="password" autocomplete="current-password" placeholder="A tua palavra-passe" required></label><div class="form-feedback" role="status" aria-live="polite" hidden></div><button class="btn btn-yellow" type="submit">Entrar <span>→</span></button><button class="auth-link" type="button" data-open="recover">Esqueceste a palavra-passe?</button></form><div class="modal-note">O acesso usa autenticação Supabase. As oportunidades visíveis continuam a ser exemplos de demonstração.</div></div>`;
    $('#authLoginForm').addEventListener('submit',handleLogin);
  }else if(type==='register'){
    body.innerHTML=`<div class="modal-inner"><div class="modal-brand"><img src="assets/pulso-mark-3d-small.png" alt=""> PULSO</div><h2 id="modalTitle">Registo público em preparação</h2><p>Estamos a preparar a política de privacidade e os termos antes de começar a receber dados de novas contas.</p><div class="modal-note">Por enquanto, não introduzas aqui o teu e-mail nem a tua palavra-passe. O registo público será activado depois de os documentos de privacidade estarem definidos.</div><button class="btn btn-outline-blue" type="button" data-open="login">Já tenho conta</button></div>`;
  }else if(type==='recover'){
    body.innerHTML=`<div class="modal-inner"><div class="modal-brand"><img src="assets/pulso-mark-3d-small.png" alt=""> PULSO</div><h2 id="modalTitle">Recuperar palavra-passe</h2><p>Indica o e-mail da tua conta. Se estiver registado, enviaremos uma ligação para definires uma nova palavra-passe.</p><form class="form-stack" id="authRecoverForm"><label>E-mail<input type="email" name="email" autocomplete="email" placeholder="nome@exemplo.com" required></label><div class="form-feedback" role="status" aria-live="polite" hidden></div><button class="btn btn-yellow" type="submit">Enviar ligação <span>→</span></button><button class="auth-link" type="button" data-open="login">Voltar ao acesso</button></form></div>`;
    $('#authRecoverForm').addEventListener('submit',handleRecovery);
  }else if(type==='setPassword'){
    body.innerHTML=`<div class="modal-inner"><div class="modal-brand"><img src="assets/pulso-mark-3d-small.png" alt=""> PULSO</div><h2 id="modalTitle">Define uma nova palavra-passe</h2><p>Escolhe uma palavra-passe com pelo menos 8 caracteres.</p><form class="form-stack" id="authSetPasswordForm"><label>Nova palavra-passe<input type="password" name="password" autocomplete="new-password" minlength="8" required></label><label>Confirmar palavra-passe<input type="password" name="password_confirmation" autocomplete="new-password" minlength="8" required></label><div class="form-feedback" role="status" aria-live="polite" hidden></div><button class="btn btn-yellow" type="submit">Guardar palavra-passe</button></form></div>`;
    $('#authSetPasswordForm').addEventListener('submit',handlePasswordUpdate);
  }else if(type==='account'){
    const name=currentUser?.user_metadata?.full_name||'Conta PULSO';
    body.innerHTML=`<div class="modal-inner"><div class="modal-brand"><img src="assets/pulso-mark-3d-small.png" alt=""> A MINHA CONTA</div><h2 id="modalTitle">Olá, ${esc(name)}.</h2><p>${esc(currentUser?.email||'')}</p><div class="modal-note">A autenticação está ligada. Os favoritos e alertas ainda são demonstrações guardadas neste navegador.</div><button class="btn btn-outline-blue" type="button" data-auth-signout>Terminar sessão</button></div>`;
  }else if(type==='company'){
    body.innerHTML='<div class="modal-inner"><div class="modal-brand"><img src="assets/pulso-mark-3d-small.png" alt=""> PULSO PARA ORGANIZAÇÕES</div><h2 id="modalTitle">Cadastro empresarial em breve!</h2><p>Estamos a preparar um processo de verificação para garantir que apenas empresas e instituições legítimas possam publicar oportunidades no PULSO.</p><p>Em breve disponibilizaremos esta funcionalidade. Nesta fase não são criadas contas empresariais nem aceites publicações.</p><button class="btn btn-yellow" id="companyOk">Entendido</button></div>';
    $('#companyOk').addEventListener('click',()=>modal.close());
  }else if(type==='contact'){
    body.innerHTML='<div class="modal-inner"><div class="modal-brand"><img src="assets/pulso-mark-3d-small.png" alt=""> PULSO</div><h2 id="modalTitle">Contacto em preparação</h2><p>Os canais oficiais de contacto serão anunciados quando estiverem definidos. Não apresentamos um endereço de demonstração como se fosse real.</p></div>';
  }else if(type==='privacy'){
    body.innerHTML='<div class="modal-inner"><div class="modal-brand"><img src="assets/pulso-mark-3d-small.png" alt=""> PULSO</div><h2 id="modalTitle">Privacidade em preparação</h2><p>A política de privacidade do PULSO ainda está a ser preparada. Até ser publicada, o registo público permanece fechado. A autenticação é destinada apenas a contas criadas ou convidadas pelo proprietário.</p></div>';
  }else if(type==='terms'){
    body.innerHTML='<div class="modal-inner"><div class="modal-brand"><img src="assets/pulso-mark-3d-small.png" alt=""> PULSO</div><h2 id="modalTitle">Termos em preparação</h2><p>Os termos de utilização ainda não foram publicados. O PULSO continua em fase de preparação e as oportunidades visíveis são exemplos de demonstração.</p></div>';
  }else if(type==='notifications'){
    body.innerHTML='<div class="modal-inner"><div class="modal-brand"><img src="assets/pulso-mark-3d-small.png" alt=""> CENTRO DE NOTIFICAÇÕES</div><h2 id="modalTitle">Novidades do PULSO</h2><div class="modal-item"><b>Pesquisa e favoritos já disponíveis</b><small>As interacções desta versão ficam guardadas apenas no teu navegador.</small></div><div class="modal-item"><b>Radar PULSO AI em preparação</b><small>Esta demonstração não monitoriza fontes nem emite previsões reais.</small></div><div class="modal-note">Notificações por e-mail e alertas reais serão activados com o backend.</div></div>';
  }
  if(!modal.open)modal.showModal();
}
function authNotReady(form){formMessage(form,'O serviço de autenticação não carregou. Verifica a ligação à Internet e tenta novamente.','error')}
async function handleLogin(event){
  event.preventDefault();
  const form=event.currentTarget;formMessage(form,'');
  if(!supabaseClient){authNotReady(form);return}
  const values=new FormData(form);setFormBusy(form,true,'A entrar…');
  const {error}=await supabaseClient.auth.signInWithPassword({email:String(values.get('email')).trim(),password:String(values.get('password'))});
  setFormBusy(form,false);
  if(error){formMessage(form,'Não foi possível entrar. Confirma o e-mail e a palavra-passe e tenta novamente.','error');return}
  modal.close();notify('Sessão iniciada.');
}
async function handleRecovery(event){
  event.preventDefault();
  const form=event.currentTarget;formMessage(form,'');
  if(!supabaseClient){authNotReady(form);return}
  const values=new FormData(form);setFormBusy(form,true,'A enviar…');
  const {error}=await supabaseClient.auth.resetPasswordForEmail(String(values.get('email')).trim(),{redirectTo:AUTH_REDIRECT_URL});
  setFormBusy(form,false);
  if(error){formMessage(form,'Não foi possível enviar a ligação. Tenta novamente mais tarde.','error');return}
  formMessage(form,'Se a conta existir, receberás uma ligação de recuperação no e-mail indicado.','success');
}
async function handlePasswordUpdate(event){
  event.preventDefault();
  const form=event.currentTarget;formMessage(form,'');
  if(!supabaseClient){authNotReady(form);return}
  const values=new FormData(form);const password=String(values.get('password'));const confirmation=String(values.get('password_confirmation'));
  if(password.length<8){formMessage(form,'A palavra-passe deve ter pelo menos 8 caracteres.','error');return}
  if(password!==confirmation){formMessage(form,'As palavras-passe não coincidem.','error');return}
  setFormBusy(form,true,'A guardar…');
  const {error}=await supabaseClient.auth.updateUser({password});
  setFormBusy(form,false);
  if(error){formMessage(form,'Não foi possível actualizar a palavra-passe. Pede uma nova ligação de recuperação.','error');return}
  modal.close();notify('Palavra-passe actualizada.');
}
async function signOut(){
  if(!supabaseClient){notify('O serviço de autenticação não está disponível.');return}
  const {error}=await supabaseClient.auth.signOut();
  if(error){notify('Não foi possível terminar a sessão. Tenta novamente.');return}
  modal.close();notify('Sessão terminada.');
}
async function initializeAuth(){
  try{
    const {createClient}=await import('https://esm.sh/@supabase/supabase-js@2');
    supabaseClient=createClient(SUPABASE_URL,SUPABASE_PUBLISHABLE_KEY,{auth:{autoRefreshToken:true,persistSession:true,detectSessionInUrl:true,flowType:'pkce'}});
    supabaseClient.auth.onAuthStateChange((event,session)=>{
      updateAuthControls(session?.user||null);
      if(event==='PASSWORD_RECOVERY')openModal('setPassword');
    });
    const {data,error}=await supabaseClient.auth.getSession();
    if(error)throw error;
    updateAuthControls(data.session?.user||null);
  }catch(error){
    console.error('Supabase Auth could not be initialized.',error);
    updateAuthControls(null);
  }
}

$('#menuToggle').addEventListener('click',()=>{const open=$('#mainNav').classList.toggle('open');$('#menuToggle').setAttribute('aria-expanded',String(open));});
$$('.nav-link').forEach(link=>link.addEventListener('click',()=>{$('#mainNav').classList.remove('open');$('#menuToggle').setAttribute('aria-expanded','false');}));
$$('[data-filter]').forEach(button=>button.addEventListener('click',()=>{selectedCategory=button.dataset.filter;$$('[data-filter]').forEach(item=>{const active=item===button;item.classList.toggle('selected',active);item.setAttribute('aria-selected',String(active));});showAll=false;renderEntries();}));
$$('[data-category]').forEach(link=>link.addEventListener('click',()=>{selectedCategory=link.dataset.category;$$('[data-filter]').forEach(item=>{const active=item.dataset.filter===selectedCategory;item.classList.toggle('selected',active);item.setAttribute('aria-selected',String(active));});renderEntries();}));
$('#heroSearch').addEventListener('submit',event=>{event.preventDefault();searchTerm=$('#heroQuery').value.trim();selectedCategory='Todas';$$('[data-filter]').forEach(item=>{const active=item.dataset.filter==='Todas';item.classList.toggle('selected',active);item.setAttribute('aria-selected',String(active));});renderEntries();$('#oportunidades').scrollIntoView({behavior:'smooth'});});
$('#loadMore').addEventListener('click',()=>{showAll=true;renderEntries();});
$('#opportunityList').addEventListener('click',event=>{
  const detail=event.target.closest('[data-detail]');const save=event.target.closest('[data-save]');
  if(detail)openModal('detail',detail.dataset.detail);
  if(save){const items=saved();const id=save.dataset.save;const updated=items.includes(id)?items.filter(x=>x!==id):[...items,id];localStorage.setItem('pulso-saved',JSON.stringify(updated));renderEntries();notify(updated.includes(id)?'Exemplo guardado neste navegador.':'Exemplo removido dos guardados.');}
});
$('#modalBody').addEventListener('click',event=>{
  const open=event.target.closest('[data-open]');
  if(open){event.preventDefault();openModal(open.dataset.open);return}
  const button=event.target.closest('[data-modal-save]');if(!button)return;
  const id=button.dataset.modalSave;const items=saved();localStorage.setItem('pulso-saved',JSON.stringify(items.includes(id)?items.filter(x=>x!==id):[...items,id]));modal.close();renderEntries();notify('Guardados actualizados neste navegador.');
});
document.addEventListener('click',event=>{
  const open=event.target.closest('[data-open]');if(open&&!$('#modalBody').contains(open)){event.preventDefault();openModal(open.dataset.open);return}
  if(event.target.closest('[data-auth-signout]'))signOut();
});
$('#modalClose').addEventListener('click',()=>modal.close());
modal.addEventListener('click',event=>{if(event.target===modal)modal.close();});
$('#radarLink').addEventListener('click',event=>{event.preventDefault();$('#radar-detalhe').scrollIntoView({behavior:'smooth'});});
$('#year').textContent=new Date().getFullYear();
renderEntries();renderCompanies();updateAuthControls(null);initializeAuth();
