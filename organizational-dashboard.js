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
const OPPORTUNITY_IMAGE_BUCKET = 'pulso-opportunity-submissions';
const PROFILE_PHOTO_BUCKET = 'pulso-organizational-profile-photos';
const MIN_PROFILE_PHOTO_SIZE = 2 * 1024 * 1024;
const MAX_PROFILE_PHOTO_SIZE = 900 * 1024;
const MAX_OPPORTUNITY_IMAGE_SIZE = 3 * 1024 * 1024;
const OPPORTUNITY_IMAGE_TYPES = new Map([['image/jpeg','jpg'],['image/png','png'],['image/webp','webp']]);
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
function safeHttpsUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' ? url.href : '';
  } catch {
    return '';
  }
}
function entityInitials(value) {
  return String(value || 'PULSO').trim().split(/\s+/).slice(0, 2)
    .map(part => part[0] || '').join('').toLocaleUpperCase('pt-AO') || 'P';
}
function profilePhotoEditorMarkup() {
  return `<form class="org-profile-photo-form" id="orgProfilePhotoForm">
    <div class="org-profile-photo-copy"><span class="org-kicker">FOTOGRAFIA DE PERFIL</span><b>Actualiza a imagem apresentada no teu espaço.</b><small>Escolhe uma imagem JPG, PNG ou WEBP com pelo menos 2 MB. O PULSO comprime-a antes de a guardar.</small></div>
    <label class="org-profile-photo-input">Escolher fotografia<input type="file" name="profile_photo" accept="image/jpeg,image/png,image/webp" required><small>Mínimo: 2 MB · será convertida para WEBP optimizado.</small></label>
    <button class="org-button org-button-secondary" type="submit">Guardar fotografia</button>
    <p class="org-profile-photo-feedback" id="orgProfilePhotoFeedback" role="status" aria-live="polite" hidden></p>
  </form>`;
}
function entityAvatarMarkup(name, logoUrl) {
  const logo = safeHttpsUrl(logoUrl);
  return `<span class="org-avatar" aria-hidden="true">${logo ? `<img src="${esc(logo)}" alt="">` : `<span>${esc(entityInitials(name))}</span>`}</span>`;
}
function submissionFormMarkup(canSubmit, entityName, request) {
  if (!canSubmit) {
    return '<div class="org-card"><h2>Submissão ainda não autorizada</h2><p>O estatuto de parceiro não concede automaticamente permissão para publicar. Contacta a equipa PULSO ou aguarda a autorização do administrador.</p></div>';
  }
  return `<form class="org-card" id="orgSubmissionForm">
    <div class="org-field-grid">
      <label class="org-field">Título<input name="title" maxlength="180" required></label>
      <label class="org-field">Categoria<select name="category" required>${Object.entries(CATEGORY_LABELS).map(([value,label])=>`<option value="${value}">${label}</option>`).join('')}</select></label>
      <label class="org-field">Entidade responsável<input name="source_name" maxlength="180" value="${entityName}" required></label>
      <label class="org-field">Ligação oficial da publicação<input name="source_url" type="url" inputmode="url" placeholder="https://…" required></label>
      <label class="org-field org-field-wide">Descrição<textarea name="description" maxlength="5000" rows="4" required></textarea></label>
      <details class="org-optional-fields org-field-wide"><summary>Mais detalhes (opcional)</summary><div class="org-field-grid">
        <label class="org-field">Ligação oficial de candidatura<input name="application_url" type="url" inputmode="url" placeholder="https://…"></label>
        <label class="org-field">Província<input name="province" maxlength="100" value="${esc(request.province || '')}"></label>
        <label class="org-field">Município<input name="municipality" maxlength="100" value="${esc(request.municipality || '')}"></label>
        <label class="org-field">Prazo de candidatura<input name="application_deadline" type="date"></label>
        <label class="org-field org-field-wide">Requisitos<textarea name="requirements" maxlength="4000" rows="3"></textarea></label>
      </div></details>
      <fieldset class="org-image-section org-field-wide"><legend>Imagem da publicação <small>opcional</small></legend>
        <div class="org-image-choices" role="radiogroup" aria-label="Como adicionar uma imagem">
          <label><input type="radio" name="image_mode" value="none" checked><span>Sem imagem</span></label>
          <label><input type="radio" name="image_mode" value="link"><span>Colar um link</span></label>
          <label><input type="radio" name="image_mode" value="upload"><span>Carregar fotografia</span></label>
        </div>
        <label class="org-field" data-image-link-panel hidden>Link HTTPS da imagem<input name="image_url" type="url" inputmode="url" placeholder="https://…"></label>
        <label class="org-field" data-image-file-panel hidden>Fotografia do dispositivo<input name="image_file" type="file" accept="image/jpeg,image/png,image/webp" capture="environment"><small>JPG, PNG ou WEBP · máximo de 3 MB.</small></label>
        <div class="org-image-rights" data-image-rights hidden>
          <label class="org-field">Origem/licença da imagem<input name="image_source_url" type="url" inputmode="url" placeholder="https://…"></label>
          <label class="org-check"><input type="checkbox" name="image_rights_confirmed"><span>Confirmo que a entidade tem autorização para usar esta imagem.</span></label>
        </div>
      </fieldset>
    </div>
    <p id="orgSubmissionFeedback" class="org-feedback" role="status" aria-live="polite" hidden></p>
    <div class="org-actions"><button class="org-button" type="submit" data-submit-mode="pending_review">Submeter para revisão</button><button class="org-button org-button-secondary" type="submit" data-submit-mode="draft">Guardar rascunho</button></div>
  </form>`;
}
function syncImageFields(form) {
  if (!form) return;
  const mode = form.querySelector('[name="image_mode"]:checked')?.value || 'none';
  const linkPanel = form.querySelector('[data-image-link-panel]');
  const filePanel = form.querySelector('[data-image-file-panel]');
  const rightsPanel = form.querySelector('[data-image-rights]');
  const linkInput = form.elements.image_url;
  const fileInput = form.elements.image_file;
  const imageUrl = mode === 'link' ? String(linkInput.value || '').trim() : '';
  const imageFile = mode === 'upload' ? fileInput.files?.[0] || null : null;
  const hasImage = Boolean(imageUrl || imageFile);
  linkPanel.hidden = mode !== 'link';
  linkInput.disabled = mode !== 'link';
  filePanel.hidden = mode !== 'upload';
  fileInput.disabled = mode !== 'upload';
  rightsPanel.hidden = !hasImage;
  form.elements.image_source_url.disabled = !hasImage;
  form.elements.image_source_url.required = hasImage;
  form.elements.image_rights_confirmed.disabled = !hasImage;
  form.elements.image_rights_confirmed.required = hasImage;
  if (!hasImage) {
    form.elements.image_source_url.value = '';
    form.elements.image_rights_confirmed.checked = false;
  }
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
  const entityNameRaw = isBusiness ? (organization?.name || name) : name;
  const entityName = esc(entityNameRaw);
  const logoUrl = isBusiness && organization?.logo_rights_confirmed === true
    && safeHttpsUrl(organization.logo_source_url) ? safeHttpsUrl(organization.logo_url) : '';
  const avatarMarkup = entityAvatarMarkup(entityNameRaw, safeHttpsUrl(request.profile_photo_url) || logoUrl);

  workspace.innerHTML = `
    <header class="org-topbar"><a class="org-brand" href="./index.html"><img src="assets/pulso-mark-3d-small.png" alt=""><span><strong>PULSO</strong><small>${isBusiness ? 'ESPAÇO EMPRESARIAL' : 'PARCEIRO PULSO'}</small></span></a><div class="org-top-entity">${avatarMarkup}<span><small>${identity}</small><b>${entityName}</b></span></div><div class="org-top-actions"><a href="./dashboard.html">Dashboard normal</a><button type="button" class="org-signout" id="orgSignOut">Terminar sessão</button></div></header>
    <div class="org-layout"><aside class="org-sidebar"><div class="org-identity">${avatarMarkup}<span><small>${identity}</small><b>${entityName}</b></span></div><nav class="org-nav" aria-label="Navegação organizacional">${[['overview','⌂','Visão geral'],['profile','◉',isBusiness?'Perfil da empresa':'Perfil do parceiro'],['status','✓',isBusiness?'Verificação':'Estado da parceria'],['opportunities','▤','Oportunidades'],['submit','＋','Submeter oportunidade'],['history','◷','Histórico'],['notifications','♧','Notificações'],['settings','⚙','Definições']].map(([view,icon,label])=>`<button type="button" data-org-view="${view}" aria-current="${view==='overview'?'true':'false'}"><span>${icon}</span>${label}</button>`).join('')}</nav></aside>
      <main class="org-main">
        <section class="org-page" data-org-page="overview">
          <div class="org-hero">
            <div class="org-hero-glow"></div><div class="org-hero-orbit org-hero-orbit-a"></div><div class="org-hero-orbit org-hero-orbit-b"></div>
            <video class="pulso-device-video org-device-video" src="assets/video/pulso-laptop.webm?v=20261120-17" autoplay muted loop playsinline preload="metadata" aria-hidden="true"></video>
            <div class="org-hero-copy"><span class="org-hero-overline"><i></i> ESPAÇO ORGANIZACIONAL PULSO</span><h1>${isBusiness ? 'A tua empresa, em movimento.' : 'A tua parceria, em movimento.'}</h1><p>${isBusiness ? 'Acompanha as oportunidades que submetes, o estado da revisão e os próximos passos da tua entidade.' : 'Acompanha a colaboração com o PULSO, as submissões autorizadas e os próximos passos.'}</p><div class="org-hero-actions"><button type="button" class="org-hero-button" data-org-view="${canSubmit?'submit':'status'}">${canSubmit?'Submeter oportunidade':'Consultar permissões'} <span>→</span></button><button type="button" class="org-hero-button org-hero-button-secondary" data-org-view="history">Ver histórico <span>→</span></button></div></div>
            <article class="org-hero-profile"><div class="org-hero-profile-identity">${avatarMarkup}<span><small>${identity}</small><b>${entityName}</b></span></div><span class="org-hero-status" data-kind="${isBusiness?'business':'partner'}"><i></i>${isBusiness?'Verificada':'Aprovada'}</span><div class="org-hero-profile-copy"><b>${statusTitle}</b><p>${statusDescription}</p></div></article>
          </div>
          <div class="org-stat-row"><article class="org-stat"><span class="org-stat-icon" aria-hidden="true">▤</span><small>Oportunidades acompanhadas</small><b id="orgStatTotal">0</b></article><article class="org-stat"><span class="org-stat-icon org-stat-icon-gold" aria-hidden="true">◷</span><small>Em análise</small><b id="orgStatPending">0</b></article><article class="org-stat"><span class="org-stat-icon org-stat-icon-green" aria-hidden="true">✓</span><small>Publicadas</small><b id="orgStatPublished">0</b></article></div>
          <div class="org-grid"><section class="org-card org-card-wide"><h2>Publicações recentes</h2><div class="org-list" id="orgOpportunityList"><div class="org-empty">A carregar…</div></div></section><section class="org-card"><h2>${isBusiness?'Verificação empresarial':'Estado da parceria'}</h2><p>${esc(BUSINESS_LABELS[request.status] || PARTNER_LABELS[request.status])} · Pedido recebido ${esc(dateLabel(request.submitted_at || request.created_at))}</p>${request.status_note?`<p><strong>Nota do PULSO:</strong> ${esc(request.status_note)}</p>`:''}</section><section class="org-card"><h2>Próximo passo</h2><p>${canSubmit?'Submete uma oportunidade com os dados da fonte oficial. O envio será revisto e não fica público automaticamente.':'A permissão de submissão deve ser concedida por um administrador PULSO.'}</p><button type="button" class="org-button org-button-secondary" data-org-view="${canSubmit?'submit':'status'}">${canSubmit?'Preparar submissão':'Consultar permissão'}</button></section></div>
        </section>
        <section class="org-page" data-org-page="profile" hidden><div class="org-page-intro"><span class="org-kicker">IDENTIFICAÇÃO</span><h1>${isBusiness?'Perfil da empresa.':'Perfil do parceiro.'}</h1><p>Dados apresentados a partir do pedido original. Para corrigir informação, contacta a equipa PULSO.</p></div><div class="org-profile-identity">${avatarMarkup}<span><small>${identity} · ${esc(BUSINESS_LABELS[request.status] || PARTNER_LABELS[request.status])}</small><b>${entityName}</b></span></div>${profilePhotoEditorMarkup()}<div class="org-card"><div class="org-field-grid">${(isBusiness?[["Entidade",name],["Nome legal",request.legal_name],["NIF",request.tax_id],["Sector",request.sector],["Província",request.province],["Município",request.municipality],["Website",request.website],["E-mail institucional",request.institutional_email],["Representante",request.representative_full_name],["Cargo",request.representative_role]]:[["Organização",request.organization_name],["Tipo de colaboração",request.collaboration_type],["Actividade",request.activity_description],["Província",request.province],["Município",request.municipality],["Website/redes sociais",request.website_or_social_links],["Responsável",request.representative_name],["E-mail",request.representative_email],["Telefone",request.representative_phone]]).map(([label,value])=>`<div><small class="org-kicker">${esc(label)}</small><p>${esc(value || '—')}</p></div>`).join('')}</div></div></section>
        <section class="org-page" data-org-page="status" hidden><div class="org-page-intro"><span class="org-kicker">ESTADO DA CONTA</span><h1>${isBusiness?'Verificação empresarial.':'Parceria PULSO.'}</h1><p>${esc(statusDescription)}</p></div><div class="org-card"><h2>${esc(BUSINESS_LABELS[request.status] || PARTNER_LABELS[request.status])}</h2><p>Submetido em ${esc(dateLabel(request.submitted_at || request.created_at))}</p>${request.status_note?`<p><strong>Última nota:</strong> ${esc(request.status_note)}</p>`:''}${!isBusiness?`<p>Permissão para submeter oportunidades: <strong>${canSubmit?'Concedida':'Ainda não concedida'}</strong>.</p>`:''}<h2>Histórico do processo</h2><div id="orgAccountHistory"></div></div></section>
        <section class="org-page" data-org-page="opportunities" hidden><div class="org-page-intro"><span class="org-kicker">ACOMPANHAMENTO</span><h1>As tuas oportunidades.</h1><p>Consulta estado, notas de revisão e histórico das publicações desta conta.</p></div><section class="org-card"><div class="org-list" id="orgOpportunityListAll"></div></section></section>
        <section class="org-page" data-org-page="submit" hidden><div class="org-page-intro"><span class="org-kicker">SUBMISSÃO MODERADA</span><h1>Submeter oportunidade.</h1><p>A verificação da empresa ou a aprovação da parceria não publica automaticamente. A equipa PULSO revê cada proposta e confirma a entidade, a fonte e os direitos das imagens.</p></div>${submissionFormMarkup(canSubmit, entityName, request)}</section>
        <section class="org-page" data-org-page="history" hidden><div class="org-page-intro"><span class="org-kicker">REGISTO DE ALTERAÇÕES</span><h1>Histórico.</h1><p>Alterações de estado do pedido e das oportunidades submetidas.</p></div><div class="org-grid"><section class="org-card"><h2>Conta</h2><div id="orgAccountHistoryFull"></div></section><section class="org-card"><h2>Oportunidades</h2><div id="orgOpportunityHistoryFull"></div></section></div></section>
        <section class="org-page" data-org-page="notifications" hidden><div class="org-page-intro"><span class="org-kicker">ACTUALIZAÇÕES</span><h1>Notificações.</h1><p>Actualizações do pedido e das publicações, apresentadas a partir do histórico seguro da conta.</p></div><section class="org-card"><div id="orgNotifications"></div></section></section>
        <section class="org-page" data-org-page="settings" hidden><div class="org-page-intro"><span class="org-kicker">SESSÃO</span><h1>Definições da conta.</h1><p>O acesso usa a conta PULSO existente.</p></div><section class="org-card"><h2>Conta autenticada</h2><p>${esc(user.email || 'Conta PULSO')}</p><button type="button" class="org-button org-signout" id="orgSignOutSettings">Terminar sessão</button></section></section>
        <footer class="org-footer"><div class="pulso-social-footer"><span>PULSO · Oportunidades em movimento.</span><div class="pulso-social-links pulso-social-links--compact pulso-social-links--org" aria-label="Redes sociais do PULSO"><a class="pulso-social-link social-youtube" href="https://www.youtube.com/@PULSOAO" target="_blank" rel="noopener noreferrer" aria-label="PULSO no YouTube, abre num novo separador"><img src="assets/social/youtube.svg" alt=""><span>YouTube</span></a><a class="pulso-social-link social-instagram" href="https://www.instagram.com/pulso.ao_?jplx=MWhxdjhzZG0xbnR0cw==" target="_blank" rel="noopener noreferrer" aria-label="PULSO no Instagram, abre num novo separador"><img src="assets/social/instagram.svg" alt=""><span>Instagram</span></a></div></div></footer>
      </main></div>`;
  syncImageFields($('#orgSubmissionForm'));
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
  const imageMode = String(values.get('image_mode') || 'none');
  const linkedImage = imageMode === 'link' ? String(values.get('image_url') || '').trim() : '';
  const imageFile = imageMode === 'upload' ? form.elements.image_file.files?.[0] || null : null;
  const imageSource = String(values.get('image_source_url') || '').trim();
  const source = String(values.get('source_url') || '').trim();
  const application = String(values.get('application_url') || '').trim();
  const hasImage = Boolean(linkedImage || imageFile);
  if (![source, application, linkedImage, imageSource].every(httpsOrEmpty)) {
    setFeedback('As ligações oficiais, de candidatura e de imagem devem usar HTTPS.', 'error');
    return;
  }
  if (hasImage && (!imageSource || values.get('image_rights_confirmed') !== 'on')) {
    setFeedback('Para usar uma imagem, indica a origem HTTPS e confirma os direitos de utilização.', 'error');
    return;
  }
  if (imageFile && !OPPORTUNITY_IMAGE_TYPES.has(imageFile.type)) {
    setFeedback('Carrega uma fotografia JPG, PNG ou WEBP.', 'error');
    return;
  }
  if (imageFile && imageFile.size > MAX_OPPORTUNITY_IMAGE_SIZE) {
    setFeedback('A fotografia excede o limite de 3 MB.', 'error');
    return;
  }

  const submitter = form.querySelector(`[data-submit-mode="${status}"]`);
  form.querySelectorAll('button[type="submit"]').forEach(button => { button.disabled = true; });
  setFeedback(imageFile ? 'A carregar a fotografia e a submeter…' : status === 'draft' ? 'A guardar rascunho…' : 'A submeter para revisão…');
  let uploadedPath = null;
  let imageUrl = linkedImage || null;
  try {
    if (imageFile) {
      const extension = OPPORTUNITY_IMAGE_TYPES.get(imageFile.type);
      uploadedPath = `${user.id}/${crypto.randomUUID()}.${extension}`;
      const { error: uploadError } = await supabase.storage.from(OPPORTUNITY_IMAGE_BUCKET).upload(uploadedPath, imageFile, {
        cacheControl: '31536000',
        contentType: imageFile.type,
        upsert: false,
      });
      if (uploadError) throw uploadError;
      imageUrl = safeHttpsUrl(supabase.storage.from(OPPORTUNITY_IMAGE_BUCKET).getPublicUrl(uploadedPath).data?.publicUrl);
      if (!imageUrl) throw new Error('Não foi possível obter a ligação pública da fotografia carregada.');
    }

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
      image_url: imageUrl,
      image_source_url: hasImage ? imageSource : null,
      image_rights_confirmed: Boolean(hasImage && values.get('image_rights_confirmed') === 'on'),
      source_id: null,
      collection_method: 'manual',
      status,
      verification_status: 'unverified',
      review_note: null,
    };
    const { error } = await supabase.from('opportunities').insert(payload);
    if (error) throw error;
  } catch (error) {
    if (uploadedPath) {
      try {
        const { error: cleanupError } = await supabase.storage.from(OPPORTUNITY_IMAGE_BUCKET).remove([uploadedPath]);
        if (cleanupError) console.warn('PULSO could not clean up an unreferenced submission image', cleanupError.message);
      } catch (cleanupError) {
        console.warn('PULSO could not clean up an unreferenced submission image', cleanupError.message);
      }
    }
    console.error('PULSO organizational opportunity submission failed', error);
    setFeedback('Não foi possível guardar a oportunidade. Confirma as permissões da conta e tenta novamente.', 'error');
    if (submitter) submitter.disabled = false;
    form.querySelectorAll('button[type="submit"]').forEach(button => { button.disabled = false; });
    return;
  }

  form.reset();
  syncImageFields(form);
  setFeedback(status === 'draft' ? 'Rascunho guardado. Podes submetê-lo para revisão quando estiver pronto.' : 'Oportunidade recebida e enviada para revisão. Ainda não está publicada.', 'success');
  try {
    await loadWorkspaceData();
    showToast(status === 'draft' ? 'Rascunho guardado.' : 'Submissão recebida para revisão.');
  } catch (error) {
    console.error('PULSO opportunity was saved but the dashboard could not refresh', error);
    showToast('A submissão foi guardada. Actualiza a página para ver o estado.');
  }
  if (submitter) submitter.disabled = false;
}
async function submitDraft(id) {
  const { error } = await supabase.from('opportunities')
    .update({ status:'pending_review', verification_status:'unverified' })
    .eq('id', id).eq('submitted_by_user_id', user.id).eq('status','draft');
  if (error) { console.error('PULSO draft submission failed', error); showToast('Não foi possível submeter o rascunho.'); return; }
  showToast('Rascunho submetido para revisão.');
  await loadWorkspaceData();
}
async function compressProfilePhoto(file) {
  const image = await createImageBitmap(file, { imageOrientation: 'from-image' });
  const scale = Math.min(1, 640 / Math.max(image.width, image.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(image.width * scale));
  canvas.height = Math.max(1, Math.round(image.height * scale));
  canvas.getContext('2d', { alpha: false }).drawImage(image, 0, 0, canvas.width, canvas.height);
  image.close();
  for (const quality of [0.84, 0.72, 0.6, 0.48]) {
    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/webp', quality));
    if (blob && blob.size <= MAX_PROFILE_PHOTO_SIZE) return blob;
  }
  const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/webp', 0.35));
  if (!blob) throw new Error('Não foi possível preparar a fotografia.');
  return blob;
}
async function handleProfilePhotoUpload(form) {
  const file = form.elements.profile_photo.files?.[0];
  const feedback = $('#orgProfilePhotoFeedback');
  const submit = form.querySelector('button[type="submit"]');
  const showFeedback = (message, kind='info') => { feedback.hidden = false; feedback.dataset.kind = kind; feedback.textContent = message; };
  if (!file) { showFeedback('Escolhe uma fotografia primeiro.', 'error'); return; }
  if (file.size < MIN_PROFILE_PHOTO_SIZE) { showFeedback('A fotografia original deve ter pelo menos 2 MB.', 'error'); return; }
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) { showFeedback('Usa uma fotografia JPG, PNG ou WEBP.', 'error'); return; }
  submit.disabled = true;
  try {
    showFeedback('A comprimir a fotografia antes de guardar…');
    const compressed = await compressProfilePhoto(file);
    const path = `${user.id}/${crypto.randomUUID()}.webp`;
    const { error: uploadError } = await supabase.storage.from(PROFILE_PHOTO_BUCKET).upload(path, compressed, { contentType: 'image/webp', cacheControl: '31536000', upsert: false });
    if (uploadError) throw uploadError;
    const url = safeHttpsUrl(supabase.storage.from(PROFILE_PHOTO_BUCKET).getPublicUrl(path).data?.publicUrl);
    if (!url) throw new Error('O Storage não devolveu um endereço público válido.');
    const { error: saveError } = await supabase.rpc('save_organizational_profile_photo', { p_request_id: request.id, p_profile_photo_url: url, p_profile_photo_path: path });
    if (saveError) { await supabase.storage.from(PROFILE_PHOTO_BUCKET).remove([path]); throw saveError; }
    if (request.profile_photo_path && request.profile_photo_path !== path) await supabase.storage.from(PROFILE_PHOTO_BUCKET).remove([request.profile_photo_path]);
    request.profile_photo_url = url;
    request.profile_photo_path = path;
    showToast('Fotografia de perfil guardada.');
    renderWorkspace();
  } catch (error) {
    console.error('PULSO profile photo upload failed', error);
    showFeedback(error.message || 'Não foi possível guardar a fotografia.', 'error');
    submit.disabled = false;
  }
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
  workspace.addEventListener('submit', event => {
    const photoForm = event.target.closest('#orgProfilePhotoForm');
    if (photoForm) { event.preventDefault(); void handleProfilePhotoUpload(photoForm); return; }
    const form = event.target.closest('#orgSubmissionForm');
    if (!form) return;
    event.preventDefault();
    const mode = event.submitter?.dataset.submitMode || 'pending_review';
    void createSubmission(form, mode);
  });
  workspace.addEventListener('input', event => {
    const form = event.target.closest('#orgSubmissionForm');
    if (form) syncImageFields(form);
  });
  workspace.addEventListener('change', event => {
    const form = event.target.closest('#orgSubmissionForm');
    if (form) syncImageFields(form);
  });
}
async function loadWorkspaceData() {
  const table = isBusiness ? 'business_verification_requests' : 'partnership_requests';
  const select = isBusiness
    ? 'id,user_id,legal_name,trade_name,tax_id,sector,province,municipality,website,institutional_email,representative_full_name,representative_role,status,status_note,organization_id,profile_photo_url,profile_photo_path,submitted_at,created_at'
    : 'id,user_id,organization_name,activity_description,representative_name,representative_email,representative_phone,province,municipality,website_or_social_links,collaboration_type,collaboration_reason,status,status_note,allow_opportunity_submissions,profile_photo_url,profile_photo_path,submitted_at,created_at';
  const { data: rows, error } = await supabase.from(table).select(select).eq('user_id', user.id).order('created_at',{ascending:false}).order('id',{ascending:false}).limit(10);
  if (error) throw error;
  request = rows?.[0];
  if (!request) throw new Error('O pedido organizacional aprovado deixou de estar disponível.');
  if (isBusiness) {
    const result = await supabase.from('organizations').select('id,name,sector,province,municipality,official_website,logo_url,logo_source_url,logo_rights_confirmed').eq('id', request.organization_id).maybeSingle();
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
    const destination = await resolvePULSODestination(supabase, user, isBusiness ? 'business' : 'partner');
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
