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
const $=(selector,root=document)=>root.querySelector(selector);
const $$=(selector,root=document)=>[...root.querySelectorAll(selector)];
const saved=()=>{try{return JSON.parse(localStorage.getItem('pulso-saved')||'[]')}catch{return []}};
function notify(message){const el=$('#toast');el.textContent=message;el.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.classList.remove('show'),2600)}
function esc(value){return String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
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
function renderCompanies(){ $('#companyGrid').innerHTML=organizations.map(org=>`<article class="company-card"><span class="company-logo ${org.tone}">${org.initials}</span><span><b>${org.name}</b><small>${org.type}</small></span><span class="company-arrow">↗</span></article>`).join('') }
const modal=$('#appModal');
function openModal(type,id){
  const body=$('#modalBody');
  if(type==='detail'){
    const item=entries.find(x=>x.id===id);if(!item)return;
    body.innerHTML=`<div class="modal-inner"><div class="modal-brand"><img src="assets/pulso-mark.svg" alt=""> OPORTUNIDADE · EXEMPLO</div><h2 id="modalTitle">${esc(item.title)}</h2><p>${esc(item.org)} · ${esc(item.place)}</p><div class="modal-meta"><span class="modal-pill">${esc(item.category)}</span><span class="modal-pill">Demonstração</span></div><p>${esc(item.summary)}</p><div class="source-box"><b>Origem:</b> item fictício para demonstração visual. Não existe publicação original nem link de candidatura associado. O PULSO não o apresenta como confirmado.</div><button class="btn btn-outline-blue" data-modal-save="${esc(item.id)}">${saved().includes(item.id)?'Remover dos guardados':'Guardar exemplo'}</button></div>`;
  }else if(type==='login'||type==='register'){
    const registering=type==='register';
    body.innerHTML=`<div class="modal-inner"><div class="modal-brand"><img src="assets/pulso-mark.svg" alt=""> PULSO</div><h2 id="modalTitle">${registering?'Cria a tua conta':'Que bom ter-te de volta.'}</h2><p>${registering?'Um espaço para acompanhares oportunidades — formulário de demonstração.':'Aceder à tua área PULSO — autenticação ainda não ligada nesta versão.'}</p><form class="form-stack" id="demoForm">${registering?'<label>Nome completo<input name="name" autocomplete="name" placeholder="O teu nome" required></label>':''}<label>E-mail<input type="email" name="email" autocomplete="email" placeholder="nome@exemplo.com" required></label><label>Palavra-passe<input type="password" name="password" autocomplete="${registering?'new-password':'current-password'}" placeholder="Mínimo 8 caracteres" minlength="8" required></label><button class="btn btn-yellow" type="submit">${registering?'Criar conta de demonstração':'Entrar' } <span>→</span></button></form><div class="modal-note">Demonstração: os dados não são enviados nem guardados. A autenticação real exige backend seguro, ainda não configurado.</div></div>`;
    $('#demoForm').addEventListener('submit',event=>{event.preventDefault();modal.close();notify('Demonstração: ainda não existe autenticação real.');});
  }else if(type==='company'){
    body.innerHTML='<div class="modal-inner"><div class="modal-brand"><img src="assets/pulso-mark.svg" alt=""> PULSO PARA ORGANIZAÇÕES</div><h2 id="modalTitle">Cadastro empresarial em breve!</h2><p>Estamos a preparar um processo de verificação para garantir que apenas empresas e instituições legítimas possam publicar oportunidades no PULSO.</p><p>Em breve disponibilizaremos esta funcionalidade. Nesta fase não são criadas contas empresariais nem aceites publicações.</p><button class="btn btn-yellow" id="companyOk">Entendido</button></div>';
    $('#companyOk').addEventListener('click',()=>modal.close());
  }else if(type==='notifications'){
    body.innerHTML='<div class="modal-inner"><div class="modal-brand"><img src="assets/pulso-mark.svg" alt=""> CENTRO DE NOTIFICAÇÕES</div><h2 id="modalTitle">Novidades do PULSO</h2><div class="modal-item"><b>Pesquisa e favoritos já disponíveis</b><small>As interacções desta versão ficam guardadas apenas no teu navegador.</small></div><div class="modal-item"><b>Radar PULSO AI em preparação</b><small>Esta demonstração não monitoriza fontes nem emite previsões reais.</small></div><div class="modal-note">Notificações por e-mail e alertas reais serão activados com o backend.</div></div>';
  }
  if(!modal.open)modal.showModal();
}
$('#menuToggle').addEventListener('click',()=>{const open=$('#mainNav').classList.toggle('open');$('#menuToggle').setAttribute('aria-expanded',String(open));});
$$('.nav-link').forEach(link=>link.addEventListener('click',()=>{$('#mainNav').classList.remove('open');$('#menuToggle').setAttribute('aria-expanded','false');}));
$$('[data-filter]').forEach(button=>button.addEventListener('click',()=>{selectedCategory=button.dataset.filter;$$('[data-filter]').forEach(item=>{const active=item===button;item.classList.toggle('selected',active);item.setAttribute('aria-selected',String(active));});showAll=false;renderEntries();}));
$$('[data-category]').forEach(link=>link.addEventListener('click',()=>{selectedCategory=link.dataset.category;$$('[data-filter]').forEach(item=>{const active=item.dataset.filter===selectedCategory;item.classList.toggle('selected',active);item.setAttribute('aria-selected',String(active));});renderEntries();}));
$('#heroSearch').addEventListener('submit',event=>{event.preventDefault();searchTerm=$('#heroQuery').value.trim();selectedCategory='Todas';$$('[data-filter]').forEach(item=>{const active=item.dataset.filter==='Todas';item.classList.toggle('selected',active);item.setAttribute('aria-selected',String(active));});renderEntries();$('#oportunidades').scrollIntoView({behavior:'smooth'});});
$('#loadMore').addEventListener('click',()=>{showAll=true;renderEntries();});
$('#opportunityList').addEventListener('click',event=>{const detail=event.target.closest('[data-detail]');const save=event.target.closest('[data-save]');if(detail)openModal('detail',detail.dataset.detail);if(save){const items=saved();const id=save.dataset.save;const updated=items.includes(id)?items.filter(x=>x!==id):[...items,id];localStorage.setItem('pulso-saved',JSON.stringify(updated));renderEntries();notify(updated.includes(id)?'Exemplo guardado neste navegador.':'Exemplo removido dos guardados.');}});
$('#modalBody').addEventListener('click',event=>{const button=event.target.closest('[data-modal-save]');if(!button)return;const id=button.dataset.modalSave;const items=saved();localStorage.setItem('pulso-saved',JSON.stringify(items.includes(id)?items.filter(x=>x!==id):[...items,id]));modal.close();renderEntries();notify('Guardados actualizados neste navegador.');});
$$('[data-open]').forEach(button=>button.addEventListener('click',()=>openModal(button.dataset.open)));
$('#modalClose').addEventListener('click',()=>modal.close());
modal.addEventListener('click',event=>{if(event.target===modal)modal.close();});
$('#radarLink').addEventListener('click',event=>{event.preventDefault();$('#radar-detalhe').scrollIntoView({behavior:'smooth'});});
$('#year').textContent=new Date().getFullYear();
renderEntries();renderCompanies();
