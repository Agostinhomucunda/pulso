import { createPULSOClient, resolvePULSODestination } from './account-routing.js';

const kind = document.body.dataset.orgWorkspace;
const isBusiness = kind === 'business';
const params = new URLSearchParams(location.search);
const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
const dateLabel = value => {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? '—' : new Intl.DateTimeFormat('pt-AO', { dateStyle:'medium', timeStyle: value.includes?.('T') ? 'short' : undefined }).format(date);
};
const BUSINESS_LABELS = { under_review:'Em análise', additional_documents_requested:'Documentação adicional solicitada', verified:'Verificada', rejected:'Rejeitada', suspended:'Suspensa' };
const PARTNER_LABELS = { received:'Recebido', under_review:'Em análise', additional_information_requested:'Informação adicional solicitada', approved:'Parceria aprovada', rejected:'Rejeitada', suspended:'Suspensa' };
const OPPORTUNITY_LABELS = { draft:'Rascunho', pending_review:'Em análise', rejected:'Rejeitada', published:'Publicada', expired:'Expirada' };
const CATEGORY_LABELS = { employment:'Empregos', scholarship:'Bolsas', public_competition:'Concursos', internship:'Estágios', training:'Formações', recruitment_program:'Programas', other:'Outras oportunidades' };
const loading = $('#orgLoading');
const workspace = $('#orgWorkspace');
const toast = $('#orgToast');
let supabase;
let user;
let request;
let organization = null;
let opportunities = [];
let statusHistory = [];
let opportunityHistory = [];
let toastTimer;

function showToast(message) {
  toast.textContent = message;
  toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), 3600);
}
function statusLabel(row) {
  if (row.status === 'pending_review' && row.verification_status === 'verified') return 'Aprovada · aguarda publicação';
  return OPPORTUNITY_LABELS[row.status] || row.status || '—';
}
function opportunityHistoryFor(id) { return opportunityHistory.filter(item => item.opportunity_id === id); }
function historyMarkup(items, formatter) {
  if (!items.length) return '<div class="org-empty">O histórico aparecerá aqui após a primeira actualização.</div>';
  return `<div class="org-history">${items.map(item => `<article class="org-history-item"><b>${esc(formatter(item))}</b><small>${esc(dateLabel(item.changed_at))}</small>${item.note ? `<p>${esc(item.note)}</p>` : ''}</article>`).join('')}</div>`;
}
function renderOpportunityRows() {
  const rows = opportunities.length ? opportunities.map(item => {
    const status = statusLabel(item);
    const history = opportunityHistoryFor(item.id);
    return `<article class="org-row"><div><b>${esc(item.title)}</b><small>${esc(CATEGORY_LABELS[item.category] || 'Oportunidade')} · ${esc([item.municipality,item.province].filter(Boolean).join(', ') || 'Localização não indicada')} · ${esc(dateLabel(item.created_at))}</small>${item.review_note ? `<p><strong>Nota da revisão:</strong> ${esc(item.review_note)}</p>` : ''}${history.length ? `<details><summary>Ver histórico (${history.length})</summary>${historyMarkup(history, h => `${OPPORTUNITY_LABELS[h.previous_status] || (h.previous_status ? h.previous_status : 'Pedido criado')} → ${statusLabel({ status:h.new_status, verification_status:h.new_verification_status })}`)}</details>` : ''}</div><span class="org-status-pill" data-kind="${item.status === 'rejected' ? 'error' : item.status === 'published' ? 'success' : 'pending'}">${esc(status)}</span>${item.status === 'draft' ? `<button class="org-button org-button-secondary" type="button" data-submit-draft="${esc(item.id)}">Submeter rascunho</button>` : ''}</article>`;
  }).join('') : '<div class="org-empty">Ainda não submeteu oportunidades. As publicações ficam sujeitas à revisão do PULSO.</div>';
  $('#orgOpportunityList').innerHTML = rows;
}
function renderWorkspace() {
  const name = isBusiness ? (request.trade_name || request.legal_name) : request.organization_name;
  const title = isBusiness ? 'Dashboard empresarial.' : 'Espaço Parceiro PULSO.';
  const identity = isBusiness ? 'EMPRESA VERIFICADA' : 'PARCEIRO PULSO';
  const statusTitle = isBusiness ? 'Conta empresarial verificada' : 'Parceria aprovada';
  const statusDescription = isBusiness
    ? 'A conta foi verificada por revisão humana. Cada oportunidade continua a ser moderada antes de ser publicada.'
    : request.allow_opportunity_submissions
      ? 'A parceria foi aprovada. Este estatuto não equivale a verificação legal empresarial; as submissões permitidas passam por moderação.'
      : 'A parceria foi aprovada, mas ainda não foi concedida permissão para submeter oportunidades. Este estatuto não equivale a verificação legal empresarial.';
  const canSubmit = isBusiness || request.allow_opportunity_submissions === true;
  const entityName = esc(isBusiness ? (organization?.name || name) : name);

  workspace.innerHTML = `
    <header class="org-topbar"><a class="org-brand" href="./index.html"><img src="assets/pulso-mark-3d-small.png" alt=""><span><strong>PULSO</strong><small>${isBusiness ? 'ESPAÇO EMPRESARIAL' : 'PARCEIRO PULSO'}</small></span></a><div class="org-top-actions"><a href="./dashboard.html">Dashboard normal</a><button type="button" class="org-signout" id="orgSignOut">Terminar sessão</button></div></header>
    <div class="org-layout"><aside class="org-sidebar"><div class="org-identity"><small>${identity}</small><b>${esc(name)}</b></div><nav class="org-nav" aria-label="Navegação organizacional">${[['overview','⌂','Visão geral'],['profile','◉',isBusiness?'Perfil da empresa':'Perfil do parceiro'],['status','✓',isBusiness?'Verificação':'Estado da parceria'],['opportunities','▤','Oportunidades'],['submit','＋','Submeter oportunidade'],['history','◷','Histórico'],['notifications','♧','Notificações'],['settings','⚙','Definições']].map(([view,icon,label])=>`<button type="button" data-org-view="${view}" aria-current="${view==='overview'?'true':'false'}"><span>${icon}</span>${label}</button>`).join('')}</nav></aside>
      <main class="org-main">
        <section class="org-page" data-org-page="overview"><div class="org-page-intro"><span class="org-kicker">${identity}</span><h1>${title}</h1><p>${isBusiness ? 'Acompanha o perfil da entidade, as oportunidades submetidas e os resultados da revisão.' : 'Acompanha a colaboração e as submissões autorizadas, num espaço separado do dashboard empresarial.'}</p></div>
          <div class="org-status-banner" data-kind="${isBusiness?'business':'partner'}"><div><b>${statusTitle}</b><p>${statusDescription}</p></div><span class="org-status-pill">${isBusiness?'Verificada':'Aprovada'}</span></div>
          <div class="org-stat-row"><article class="org-stat"><small>Oportunidades acompanhadas</small><b id="orgStatTotal">0</b></article><article class="org-stat"><small>Em análise</small><b id="orgStatPending">0</b></article><article class="org-stat"><small>Publicadas</small><b id="orgStatPublished">0</b></article></div>
          <div class="org-grid"><section class="org-card org-card-wide"><h2>Publicações recentes</h2><div class="org-list" id="orgOpportunityList"><div class="org-empty">A carregar…</div></div></section><section class="org-card"><h2>${isBusiness?'Verificação empresarial':'Estado da parceria'}</h2><p>${esc(BUSINESS_LABELS[request.status] || PARTNER_LABELS[request.status])} · Pedido recebido ${esc(dateLabel(request.submitted_at || request.created_at))}</p>${request.status_note?`<p><strong>Nota do PULSO:</strong> ${esc(request.status_note)}</p>`:''}</section><section class="org-card"><h2>Próximo passo</h2><p>${canSubmit?'Submete uma oportunidade com os dados da fonte oficial. O envio será revisto e não fica público automaticamente.':'A permissão de submissão deve ser concedida por um administrador PULSO.'}</p><button type="button" class="org-button org-button-secondary" data-org-view="${canSubmit?'submit':'status'}">${canSubmit?'Preparar submissão':'Consultar permissão'}</button></section></div>
        </section>
        <section class="org-page" data-org-page="profile" hidden><div class="org-page-intro"><span class="org-kicker">IDENTIFICAÇÃO</span><h1>${isBusiness?'Perfil da empresa.':'Perfil do parceiro.'}</h1><p>Dados apresentados a partir do pedido original. Para corrigir informação, contacta a equipa PULSO.</p></div><div class="org-card"><div class="org-field-grid">${(isBusiness?[["Entidade",name],["Nome legal",request.legal_name],["NIF",request.tax_id],["Sector",request.sector],["Província",request.province],["Município",request.municipality],["Website",request.website],["E-mail institucional",request.institutional_email],["Representante",request.representative_full_name],["Cargo",request.representative_role]]:[["Organização",request.organization_name],["Tipo de colaboração",request.collaboration_type],["Actividade",request.activity_description],["Província",request.province],["Município",request.municipality],["Website/redes sociais",request.website_or_social_links],["Responsável",request.representative_name],["E-mail",request.representative_email],["Telefone",request.representative_phone]]).map(([label,value])=>`<div><small class="org-kicker">${esc(label)}</small><p>${esc(value || '—')}</p></div>`).join('')}</div></div></section>
        <section class="org-page" data-org-page="status" hidden><div class="org-page-intro"><span class="org-kicker">ESTADO DA CONTA</span><h1>${isBusiness?'Verificação empresarial.':'Parceria PULSO.'}</h1><p>${esc(statusDescription)}</p></div><div class="org-card"><h2>${esc(BUSINESS_LABELS[request.status] || PARTNER_LABELS[request.status])}</h2><p>Submetido em ${esc(dateLabel(request.submitted_at || request.created_at))}</p>${request.status_note?`<p><strong>Última nota:</strong> ${esc(request.status_note)}</p>`:''}${!isBusiness?`<p>Permissão para submeter oportunidades: <strong>${canSubmit?'Concedida':'Ainda não concedida'}</strong>.</p>`:''}<h2>Histórico do processo</h2><div id="orgAccountHistory"></div></div></section>
        <section class="org-page" data-org-page="opportunities" hidden><div class="org-page-intro"><span class="org-kicker">ACOMPANHAMENTO</span><h1>As tuas oportunidades.</h1><p>Consulta estado, notas de revisão e histórico das publicações desta conta.</p></div><section class="org-card"><div class="org-list" id="orgOpportunityListAll"></div></section></section>
        <section class="org-page" data-org-page="submit" hidden><div class="org-page-intro"><span class="org-kicker">SUBMISSÃO MODERADA</span><h1>Submeter oportunidade.</h1><p>A verificação da empresa ou a aprovação da parceria não publica automaticamente. A equipa PULSO revê cada proposta e confirma a entidade, a fonte e os direitos das imagens.</p></div>${canSubmit?`<form class="org-card" id="orgSubmissionForm"><div class="org-field-grid"><label class="org-field">Título<input name="title" maxlength="180" required></label><label class="org-field">Categoria<select name="category" required>${Object.entries(CATEGORY_LABELS).map(([value,label])=>`<option value="${value}">${label}</option>`).join('')}</select></label><label class="org-field">Entidade responsável<input name="source_name" maxlength="180" value="${entityName}" required></label><label class="org-field">Ligação oficial da publicação<input name="source_url" type="url" placeholder="https://…" required></label><label class="org-field">Ligação oficial de candidatura<input name="application_url" type="url" placeholder="https://…"></label><label class="org-field">Província<input name="province" maxlength="100" value="${esc(request.province || '')}"></label><label class="org-field">Município<input name="municipality" maxlength="100" value="${esc(request.municipality || '')}"></label><label class="org-field">Prazo de candidatura<input name="application_deadline" type="date"></label><label class="org-field org-field-wide">Descrição<textarea name="description" maxlength="5000" rows="5" required></textarea></label><label class="org-field">Requisitos<textarea name="requirements" maxlength="4000" rows="3"></textarea></label><label class="org-field">URL da imagem do cartão (opcional)<input name="image_url" type="url" placeholder="https://…"></label><label class="org-field org-field-wide">Origem/licença da imagem (obrigatório quando há imagem)<input name="image_source_url" type="url" placeholder="https://…"></label><label class="org-check org-field-wide"><input type="checkbox" name="image_rights_confirmed"><span>Confirmo que a entidade tem autorização para usar esta imagem.</span></label></div><p id="orgSubmissionFeedback" class="org-feedback" role="status" aria-live="polite" hidden></p><div class="org-actions"><button class="org-button" type="submit" data-submit-mode="pending_review">Submeter para revisão</button><button class="org-button org-button-secondary" type="submit" data-submit-mode="draft">Guardar rascunho</button></div></form>`:`<div class="org-card"><h2>Submissão ainda não autorizada</h2><p>O estatuto de parceiro não concede automaticamente permissão para publicar. Contacta a equipa PULSO ou aguarda a autorização do administrador.</p></div>`}</section>
        <section class="org-page" data-org-page="history" hidden><div class="org-page-intro"><span class="org-kicker">REGISTO DE ALTERAÇÕES</span><h1>Histórico.</h1><p>Alterações de estado do pedido e das oportunidades submetidas.</p></div><div class="org-grid"><section class="org-card"><h2>Conta</h2><div id="orgAccountHistoryFull"></div></section><section class="org-card"><h2>Oportunidades</h2><div id="orgOpportunityHistoryFull"></div></section></div></section>
        <section class="org-page" data-org-page="notifications" hidden><div class="org-page-intro"><span class="org-kicker">ACTUALIZAÇÕES</span><h1>Notificações.</h1><p>Actualizações do pedido e das publicações, apresentadas a partir do histórico seguro da conta.</p></div><section class="org-card"><div id="orgNotifications"></div></section></section>
        <section class="org-page" data-org-page="settings" hidden><div class="org-page-intro"><span class="org-kicker">SESSÃO</span><h1>Definições da conta.</h1><p>O acesso usa a conta PULSO existente.</p></div><section class="org-card"><h2>Conta autenticada</h2><p>${esc(user.email || 'Conta PULSO')}</p><button type="button" class="org-button org-signout" id="orgSignOutSettings">Terminar sessão</button></section></section>
        <footer class="org-footer"><a href="./index.html">PULSO · Oportunidades em movimento.</a></footer>
      </main></div>`;
  workspace.hidden = false;
  loading.hidden = true;
  renderOpportunityRows();
  $('#orgOpportunityListAll').innerHTML = opportunities.length ? opportunities.map(item => {
    const history = opportunityHistoryFor(item.id);
    return `<article class="org-row"><div><b>${esc(item.title)}</b><small>${esc(CATEGORY_LABELS[item.category] || 'Oportunidade')} · ${esc(dateLabel(item.created_at))}</small>${item.review_note?`<p><strong>Nota:</strong> ${esc(item.review_note)}</p>`:''}${history.length?`<details><summary>Histórico</summary>${historyMarkup(history,h=>`${esc(OPPORTUNITY_LABELS[h.previous_status]||h.previous_status||'Submetida')} → ${esc(statusLabel({status:h.new_status,verification_status:h.new_verification_status}))}`)}</details>`:''}</div><span class="org-status-pill">${esc(statusLabel(item))}</span>${item.status==='draft'?`<button class="org-button org-button-secondary" type="button" data-submit-draft="${esc(item.id)}">Submeter rascunho</button>`:''}</article>`;
  }).join('') : '<div class="org-empty">Ainda não existem publicações nesta conta.</div>';
  const accountFormat = item => `${item.previous_status ? `${isBusiness?BUSINESS_LABELS[item.previous_status]||item.previous_status:PARTNER_LABELS[item.previous_status]||item.previous_status} → ` : 'Pedido recebido · '}${isBusiness?BUSINESS_LABELS[item.new_status]||item.new_status:PARTNER_LABELS[item.new_status]||item.new_status}`;
  const accountMarkup = historyMarkup(statusHistory, accountFormat);
  $('#orgAccountHistory').innerHTML = accountMarkup;
  $('#orgAccountHistoryFull').innerHTML = accountMarkup;
  const allOpportunityHistory = [...opportunityHistory].sort((a,b)=>new Date(b.changed_at)-new Date(a.changed_at));
  $('#orgOpportunityHistoryFull').innerHTML = historyMarkup(allOpportunityHistory, item => {
    const opportunity = opportunities.find(row => row.id === item.opportunity_id);
    return `${opportunity?.title || 'Oportunidade'} · ${item.previous_status ? OPPORTUNITY_LABELS[item.previous_status]||item.previous_status : 'Submetida'} → ${statusLabel({status:item.new_status,verification_status:item.new_verification_status})}`;
  });
  const notifications = [
    ...statusHistory.map(item=>({...item,kind:'account'})),
    ...opportunityHistory.map(item=>({...item,kind:'opportunity'})),
  ].sort((a,b)=>new Date(b.changed_at)-new Date(a.changed_at));
  $('#orgNotifications').innerHTML = notifications.length ? historyMarkup(notifications, item => item.kind==='account' ? `Conta: ${accountFormat(item)}` : `Oportunidade: ${statusLabel({status:item.new_status,verification_status:item.new_verification_status})}`) : '<div class="org-empty">Ainda não há actualizações. O histórico será actualizado após uma decisão ou alteração de estado.</div>';
  const pending = opportunities.filter(item => item.status === 'pending_review').length;
  $('#orgStatTotal').textContent = String(opportunities.length);
  $('#orgStatPending').textContent = String(pending);
  $('#orgStatPublished').textContent = String(opportunities.filter(item => item.status === 'published').length);
  bindWorkspaceEvents();
}

function setActiveView(view) {
  $$('[data-org-page]').forEach(panel => { panel.hidden = panel.dataset.orgPage !== view; });
  $$('[data-org-view]').forEach(button => button.setAttribute('aria-current', String(button.dataset.orgView === view)));
  history.replaceState(null, '', `#${view}`);
  window.scrollTo({ top:0, behavior:'smooth' });
}
function setFeedback(message, kind='info') {
  const target = $('#orgSubmissionFeedback');
  if (!target) return;
  target.textContent = message;
  target.dataset.kind = kind;
  target.hidden = !message;
}
function httpsOrEmpty(value) {
  if (!value) return true;
  try { return new URL(value).protocol === 'https:'; } catch { return false; }
}
async function createSubmission(form, status) {
  if (!form.reportValidity()) return;
  const values = new FormData(form);
  const image = String(values.get('image_url') || '').trim();
  const imageSource = String(values.get('image_source_url') || '').trim();
  const source = String(values.get('source_url') || '').trim();
  const application = String(values.get('application_url') || '').trim();
  if (![source, application, image, imageSource].every(httpsOrEmpty)) return setFeedback('As ligações oficiais, de candidatura e de imagem devem usar HTTPS.', 'error');
  if (image && (!imageSource || values.get('image_rights_confirmed') !== 'on')) return setFeedback('Para usar uma imagem, indica a origem HTTPS e confirma os direitos de utilização.', 'error');

  const submitter = form.querySelector(`[data-submit-mode="${status}"]`);
  form.querySelectorAll('button[type="submit"]').forEach(button=>button.disabled=true);
  setFeedback(status === 'draft' ? 'A guardar rascunho…' : 'A submeter para revisão…');
  const payload = {
    organization_id: isBusiness ? request.organization_id : null,
    submitted_by_user_id: user.id,
    submission_kind: isBusiness ? 'business' : 'partner',
    title: String(values.get('title')).trim(),
    category: String(values.get('category')),
    description: String(values.get('description')).trim(),
    requirements: String(values.get('requirements') || '').trim() || null,
    province: String(values.get('province') || '').trim() || null,
    municipality: String(values.get('municipality') || '').trim() || null,
    application_deadline: String(values.get('application_deadline') || '') || null,
    source_name: String(values.get('source_name')).trim(),
    source_url: source,
    application_url: application || null,
    image_url: image || null,
    image_source_url: imageSource || null,
    image_rights_confirmed: Boolean(image && values.get('image_rights_confirmed') === 'on'),
    source_id: null,
    collection_method: 'manual',
    status,
    verification_status: 'unverified',
    review_note: null,
  };
  try {
    const { error } = await supabase.from('opportunities').insert(payload);
    if (error) throw error;
    form.reset();
    form.elements.source_name.value = isBusiness ? (organization?.name || request.trade_name || request.legal_name) : request.organization_name;
    form.elements.province.value = request.province || '';
    form.elements.municipality.value = request.municipality || '';
    setFeedback(status === 'draft' ? 'Rascunho guardado. Podes submetê-lo para revisão quando estiver pronto.' : 'Oportunidade recebida e enviada para revisão. Ainda não está publicada.', 'success');
    await loadWorkspaceData();
    showToast(status === 'draft' ? 'Rascunho guardado.' : 'Submissão recebida para revisão.');
  } catch (error) {
    console.error('PULSO organizational opportunity submission failed', error);
    setFeedback('Não foi possível guardar a oportunidade. Confirma se a migration de permissões está activa e tenta novamente.', 'error');
  } finally {
    if (submitter) submitter.disabled = false;
    form.querySelectorAll('button[type="submit"]').forEach(button=>button.disabled=false);
  }
}
async function submitDraft(id) {
  const { error } = await supabase.from('opportunities')
    .update({ status:'pending_review', verification_status:'unverified' })
    .eq('id', id).eq('submitted_by_user_id', user.id).eq('status','draft');
  if (error) { console.error('PULSO draft submission failed', error); showToast('Não foi possível submeter o rascunho.'); return; }
  showToast('Rascunho submetido para revisão.');
  await loadWorkspaceData();
}
function bindWorkspaceEvents() {
  if (workspace.dataset.eventsBound === 'true') return;
  workspace.dataset.eventsBound = 'true';
  workspace.addEventListener('click', event => {
    const view = event.target.closest('[data-org-view]');
    if (view) { setActiveView(view.dataset.orgView); return; }
    const draft = event.target.closest('[data-submit-draft]');
    if (draft) void submitDraft(draft.dataset.submitDraft);
    if (event.target.closest('#orgSignOut') || event.target.closest('#orgSignOutSettings')) void supabase.auth.signOut().then(()=>location.replace('./index.html'));
  });
  const form = $('#orgSubmissionForm');
  if (form) form.addEventListener('submit', event => {
    event.preventDefault();
    const mode = event.submitter?.dataset.submitMode || 'pending_review';
    void createSubmission(form, mode);
  });
}
async function loadWorkspaceData() {
  const table = isBusiness ? 'business_verification_requests' : 'partnership_requests';
  const select = isBusiness
    ? 'id,user_id,legal_name,trade_name,tax_id,sector,province,municipality,website,institutional_email,representative_full_name,representative_role,status,status_note,organization_id,submitted_at,created_at'
    : 'id,user_id,organization_name,activity_description,representative_name,representative_email,representative_phone,province,municipality,website_or_social_links,collaboration_type,collaboration_reason,status,status_note,allow_opportunity_submissions,submitted_at,created_at';
  const { data: rows, error } = await supabase.from(table).select(select).eq('user_id', user.id).order('created_at',{ascending:false}).order('id',{ascending:false}).limit(10);
  if (error) throw error;
  request = rows?.[0];
  if (!request) throw new Error('O pedido organizacional aprovado deixou de estar disponível.');
  if (isBusiness) {
    const result = await supabase.from('organizations').select('id,name,sector,province,municipality,official_website').eq('id', request.organization_id).maybeSingle();
    if (result.error) throw result.error;
    organization = result.data;
  }
  const [opportunityResult, accountHistoryResult] = await Promise.all([
    supabase.from('opportunities').select('id,title,category,province,municipality,status,verification_status,review_note,created_at,application_deadline')
      .eq('submitted_by_user_id',user.id).order('created_at',{ascending:false}).limit(100),
    supabase.from('organizational_account_status_history').select('id,request_type,request_id,previous_status,new_status,status_note,changed_at')
      .eq('user_id',user.id).eq('request_type',isBusiness?'business':'partnership').eq('request_id',request.id)
      .order('changed_at',{ascending:false}).limit(100),
  ]);
  if (opportunityResult.error) throw opportunityResult.error;
  if (accountHistoryResult.error) throw accountHistoryResult.error;
  opportunities = opportunityResult.data || [];
  statusHistory = (accountHistoryResult.data || []).map(item=>({...item,note:item.status_note}));
  if (opportunities.length) {
    const ids = opportunities.map(item=>item.id);
    const { data, error: historyError } = await supabase.from('opportunity_submission_history')
      .select('id,opportunity_id,previous_status,new_status,previous_verification_status,new_verification_status,note,changed_at')
      .eq('owner_user_id',user.id).in('opportunity_id',ids).order('changed_at',{ascending:false}).limit(300);
    if (historyError) throw historyError;
    opportunityHistory = data || [];
  } else opportunityHistory = [];
  renderWorkspace();
}

async function initialize() {
  try {
    supabase = await createPULSOClient();
    const { data, error } = await supabase.auth.getSession();
    if (error) throw error;
    user = data.session?.user;
    if (!user) { location.replace('./empresas-parceiros.html?flow='+(isBusiness?'business':'partnership')+'&view=requests'); return; }
    const destination = await resolvePULSODestination(supabase, user);
    const expected = isBusiness ? './empresa-dashboard.html' : './parceiro-dashboard.html';
    if (new URL(destination,location.href).pathname !== new URL(expected,location.href).pathname) {
      location.replace(destination);
      return;
    }
    const table = isBusiness ? 'business_verification_requests' : 'partnership_requests';
    const { data: requests, error: requestError } = await supabase.from(table).select('id,status,created_at,submitted_at')
      .eq('user_id',user.id).order('created_at',{ascending:false}).order('id',{ascending:false}).limit(10);
    if (requestError) throw requestError;
    const eligible = requests?.[0]?.status===(isBusiness?'verified':'approved') ? requests[0] : null;
    if (!eligible) { location.replace(destination); return; }
    await loadWorkspaceData();
    supabase.auth.onAuthStateChange((_event,session)=>{
      if(!session?.user){location.replace('./index.html');return;}
      if(session.user.id!==user.id){
        workspace.replaceChildren();
        workspace.hidden=true;
        loading.hidden=false;
        loading.querySelector('b').textContent='A confirmar a nova sessão…';
        void resolvePULSODestination(supabase,session.user).then(destination=>location.replace(destination));
      }
    });
    const hash = location.hash.slice(1);
    if (hash && $(`[data-org-page="${hash}"]`)) setActiveView(hash);
  } catch (error) {
    console.error('PULSO organizational dashboard could not initialize',error);
    loading.innerHTML = `<div class="org-empty"><b>Não foi possível confirmar o acesso.</b><br>${esc(error.message || 'Actualiza a página ou regressa ao portal empresarial.')}</div><p><a href="./empresas-parceiros.html">Voltar ao portal de empresas e parceiros</a></p>`;
  }
}

void initialize();
