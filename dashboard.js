import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from './supabase-config.js';

const PAGE_SIZE = 20;
const CATEGORY_LABELS = {
  employment: 'Empregos',
  scholarship: 'Bolsas',
  public_competition: 'Concursos',
  internship: 'Estágios',
  training: 'Formação',
  recruitment_program: 'Programas',
};
const CATEGORY_ICONS = {
  employment: '▰',
  scholarship: '◇',
  public_competition: '✦',
  internship: '↗',
  training: '▤',
  recruitment_program: '✧',
};
const CATEGORY_ASSETS = {
  employment: 'assets/logos/employment-3d.png',
  scholarship: 'assets/logos/scholarship-3d.png',
  public_competition: 'assets/logos/checklist-3d.png',
  internship: 'assets/logos/checklist-3d.png',
  training: 'assets/logos/training-3d.png',
  recruitment_program: 'assets/logos/opportunities-3d.png',
};
const AVATAR_ASSETS = {
  male: 'assets/profile/avatar-male.jpg',
  female: 'assets/profile/avatar-female.jpg',
};
const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
let supabaseClient = null;
let currentUser = null;
let profile = {};
let opportunities = [];
let savedRows = [];
let savedIds = new Set();
let alerts = [];
let notifications = [];
let notificationIds = null;
let isAdmin = false;
let selectedAvatar = 'male';
let opportunitiesOffset = 0;
let opportunitiesHaveMore = false;
let toastTimer;

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[char]);
}

function safeUrl(value) {
  try {
    const url = new URL(value);
    return ['https:', 'http:'].includes(url.protocol) ? url.href : '';
  } catch {
    return '';
  }
}

function initials(value) {
  return String(value || 'P').trim().split(/\s+/).slice(0, 2)
    .map(part => part[0] || '').join('').toLocaleUpperCase('pt-AO') || 'P';
}

function userName() {
  return String(profile.full_name || currentUser?.user_metadata?.full_name || '').trim()
    || currentUser?.email?.split('@')[0] || 'Utilizador PULSO';
}

function avatarKey(value) {
  return value === 'female' ? 'female' : 'male';
}

function renderAvatarTargets() {
  const key = avatarKey(selectedAvatar);
  const src = AVATAR_ASSETS[key];
  $$('[data-avatar-target]').forEach(target => {
    target.innerHTML = `<img src="${src}" alt="Avatar ${key === 'female' ? 'feminino' : 'masculino'}">`;
  });
  $$('[data-avatar-choice]').forEach(input => {
    input.checked = input.value === key;
  });
}

function categoryLabel(category) {
  return CATEGORY_LABELS[category] || 'Oportunidade';
}

function categoryIcon(category) {
  return CATEGORY_ICONS[category] || '✦';
}

function categoryAsset(category) {
  return CATEGORY_ASSETS[category] || CATEGORY_ASSETS.recruitment_program;
}

function organizationName(item) {
  return item.organization?.name || item.source_name || 'Entidade anunciante';
}

function formatDate(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) return '';
  return new Intl.DateTimeFormat('pt-AO', { dateStyle: 'medium' }).format(date);
}

function formatDateTime(value) {
  if (!value) return 'Agora';
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) return '';
  return new Intl.DateTimeFormat('pt-AO', { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}

function notify(message) {
  const toast = $('#dashboardToast');
  toast.textContent = message;
  toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), 3400);
}

function setFeedback(element, message, kind = 'success') {
  element.textContent = message;
  element.dataset.kind = kind;
  element.hidden = !message;
}

function safeCount(value) {
  return new Intl.NumberFormat('pt-AO').format(Number(value || 0));
}

function activateView(view, { updateHash = true } = {}) {
  if (view === 'admin' && !isAdmin) view = 'overview';
  const panel = $(`[data-panel="${view}"]`);
  if (!panel) view = 'overview';
  $$('.dash-view').forEach(item => { item.hidden = item.dataset.panel !== view; });
  $$('.dash-nav-link').forEach(button => button.classList.toggle('active', button.dataset.view === view));
  $('#profileMenu').hidden = true;
  $('#profileMenuButton').setAttribute('aria-expanded', 'false');
  if (updateHash) history.replaceState(null, '', `#${view}`);
  if (view === 'notifications') void loadNotifications({ poll: true });
  if (view === 'saved') void loadSavedOpportunities();
  if (view === 'alerts') void loadAlerts();
  if (view === 'admin' && isAdmin) void loadAdminAssets();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function updateIdentity() {
  const name = userName();
  const email = currentUser?.email || '';
  $('#profileNameTop').textContent = name;
  $('#profileEmailTop').textContent = email || 'Conta PULSO';
  renderAvatarTargets();
  $('#sidebarName').textContent = name.split(/\s+/)[0] || name;
  $('#profileMenuName').textContent = name;
  $('#profileMenuEmail').textContent = email;
  $('#profileShowcaseName').textContent = name;
  $('#profileShowcaseEmail').textContent = email;
  $('#profileEmailField').value = email;
  const first = name.split(/\s+/)[0] || name;
  $('#welcomeHeading').textContent = `Olá, ${first}. O teu próximo passo começa aqui.`;
  $('#profileForm [name="full_name"]').value = profile.full_name || currentUser?.user_metadata?.full_name || '';
  $('#profileForm [name="province"]').value = profile.province || '';
  $('#profileForm [name="municipality"]').value = profile.municipality || '';
  $('#profileForm [name="professional_area"]').value = profile.professional_area || '';
  $('#profileForm [name="education_level"]').value = profile.education_level || '';
}

function renderOpportunityCard(item, { savedPage = false } = {}) {
  const id = escapeHtml(item.id);
  const org = organizationName(item);
  const logo = safeUrl(item.organization?.logo_url);
  const mark = logo
    ? `<img src="${escapeHtml(logo)}" alt="" loading="lazy">`
    : escapeHtml(initials(org));
  const image = safeUrl(item.image_url);
  const place = [item.municipality, item.province].filter(Boolean).map(escapeHtml).join(', ') || 'Localização não indicada';
  const deadline = formatDate(item.application_deadline);
  const published = formatDate(item.published_at);
  const meta = [
    `<span>⌖ ${place}</span>`,
    deadline ? `<span>◷ Até ${escapeHtml(deadline)}</span>` : '',
    published ? `<span>Publicado ${escapeHtml(published)}</span>` : '',
  ].filter(Boolean).join('');
  const saved = savedIds.has(item.id);
  const source = safeUrl(item.source_url);
  return `<article class="dash-op-card" data-opportunity="${id}">
    <span class="dash-op-visual" aria-hidden="true">${image ? `<img class="dash-op-image" src="${escapeHtml(image)}" alt="" loading="lazy">` : '<span class="dash-op-image dash-op-image-empty">P·</span>'}<span class="dash-op-mark">${mark}</span></span>
    <div class="dash-op-content">
      <h3>${escapeHtml(item.title)} <img class="verified-check-img" src="assets/logos/verified-3d.png" alt="Oportunidade verificada" title="Oportunidade verificada"></h3>
      <span class="dash-op-org">${escapeHtml(org)}</span>
      <div class="dash-op-meta"><span class="dash-op-category"><img class="category-3d-img" src="${categoryAsset(item.category)}" alt="" aria-hidden="true">${escapeHtml(categoryLabel(item.category))}</span>${meta}</div>
    </div>
    <div class="dash-op-actions">
      ${source ? `<button class="source-3d-btn dash-source-3d-btn" type="button" data-detail-opportunity="${id}">Fonte oficial <span>↗</span></button>` : ''}
      <button class="dash-op-save ${saved ? 'saved' : ''}" type="button" data-save-opportunity="${id}" aria-label="${saved ? 'Remover dos guardados' : 'Guardar'}: ${escapeHtml(item.title)}">${saved ? '♥' : '♡'}</button>
      ${savedPage ? '' : `<button class="dash-op-detail" type="button" data-detail-opportunity="${id}" aria-label="Ver detalhe: ${escapeHtml(item.title)}">↗</button>`}
    </div>
  </article>`;
}

function renderOpportunityLists() {
  const featured = $('#featuredOpportunityList');
  const all = $('#dashboardOpportunityList');
  const query = $('#opportunitySearch').value.trim().toLocaleLowerCase('pt-AO');
  const category = $('#opportunityCategory').value;
  const province = $('#opportunityProvince').value.trim().toLocaleLowerCase('pt-AO');
  const filtered = opportunities.filter(item => {
    const text = [item.title, organizationName(item), item.sector, item.category, item.province,
      item.municipality, item.description, item.requirements].filter(Boolean).join(' ').toLocaleLowerCase('pt-AO');
    return (!category || item.category === category)
      && (!province || String(item.province || '').toLocaleLowerCase('pt-AO').includes(province))
      && (!query || text.includes(query));
  });
  if (!opportunities.length) {
    const empty = '<div class="empty-state"><b>Ainda não há oportunidades publicadas.</b>As oportunidades aparecerão depois de serem verificadas e publicadas.</div>';
    featured.innerHTML = empty;
    all.innerHTML = empty;
    $('#opportunityResultsNote').textContent = '0 oportunidades disponíveis';
    $('#loadMoreOpportunities').hidden = true;
    return;
  }
  featured.innerHTML = opportunities.slice(0, 4).map(item => renderOpportunityCard(item)).join('');
  if (!filtered.length) {
    all.innerHTML = '<div class="empty-state"><b>Não encontrámos oportunidades com estes filtros.</b>Experimenta outra pesquisa, categoria ou província.</div>';
  } else {
    all.innerHTML = filtered.map(item => renderOpportunityCard(item)).join('');
  }
  $('#opportunityResultsNote').textContent = `${safeCount(filtered.length)} oportunidade(s) nesta página${opportunitiesHaveMore ? ' · existem mais resultados' : ''}`;
  $('#loadMoreOpportunities').hidden = !opportunitiesHaveMore;
  const provinces = [...new Set(opportunities.map(item => item.province).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'pt-AO'));
  $('#provinceOptions').innerHTML = provinces.map(value => `<option value="${escapeHtml(value)}"></option>`).join('');
}

async function loadProfile() {
  const { data, error } = await supabaseClient.from('profiles')
    .select('id,full_name,province,municipality,professional_area,education_level,preferences')
    .eq('id', currentUser.id).maybeSingle();
  if (error) throw error;
  profile = data || {};
  selectedAvatar = avatarKey(profile.preferences?.avatar);
  updateIdentity();
}

async function loadStats() {
  const base = () => supabaseClient.from('opportunities').select('id', { count: 'exact', head: true })
    .eq('status', 'published').eq('verification_status', 'verified');
  const [all, jobs, scholarships] = await Promise.all([
    base(), base().eq('category', 'employment'), base().eq('category', 'scholarship'),
  ]);
  for (const result of [all, jobs, scholarships]) if (result.error) throw result.error;
  $('#statTotal').textContent = safeCount(all.count);
  $('#statJobs').textContent = safeCount(jobs.count);
  $('#statScholarships').textContent = safeCount(scholarships.count);
}

async function loadAdminAccess() {
  const { data, error } = await supabaseClient.from('admin_users').select('user_id')
    .eq('user_id', currentUser.id).maybeSingle();
  if (error || !data) return;
  isAdmin = true;
  $('#adminNavLink').hidden = false;
  await loadAdminAssets();
}

async function loadAdminAssets() {
  if (!isAdmin) return;
  const target = $('#adminAssetList');
  target.innerHTML = '<div class="empty-state"><b>A verificar cartões…</b></div>';
  const { data, error } = await supabaseClient.from('opportunities')
    .select('id,title,category,image_url,organization_id,organization:organizations(id,name,logo_url)')
    .eq('status', 'published').eq('verification_status', 'verified')
    .order('published_at', { ascending: false, nullsFirst: false }).limit(150);
  if (error) {
    target.innerHTML = '<div class="empty-state" role="alert"><b>Não foi possível carregar a fila.</b>Confirma a migration inicial e as permissões de administrador.</div>';
    return;
  }
  const rows = (data || []).filter(item => !safeUrl(item.image_url) || !safeUrl(item.organization?.logo_url));
  $('#adminMissingCount').textContent = safeCount(rows.length);
  $('#adminMissingCount').hidden = !rows.length;
  $('#adminAssetAlert').hidden = !rows.length;
  $('#adminAssetAlertText').textContent = rows.length
    ? `${safeCount(rows.length)} oportunidade(s) sem fotografia do cartão e/ou logótipo oficial. Podes preencher só os links que faltam.`
    : 'Todos os cartões publicados têm imagem e logótipo definidos.';
  if (!rows.length) {
    target.innerHTML = '<div class="empty-state"><b>Sem cartões incompletos.</b>Quando faltar uma imagem ou um logótipo, aparecerá aqui.</div>';
    return;
  }
  target.innerHTML = rows.map(item => `<form class="admin-asset-row" data-admin-asset="${escapeHtml(item.id)}" data-organization-id="${escapeHtml(item.organization_id || '')}">
    <div class="admin-asset-heading"><b>${escapeHtml(item.title)}</b><small>${escapeHtml(item.organization?.name || 'Organização não associada')} · ${escapeHtml(categoryLabel(item.category))}</small></div>
    <label>Link da imagem<input name="image_url" type="url" placeholder="https://…" value="${escapeHtml(item.image_url || '')}"></label>
    <label>Link do logótipo<input name="logo_url" type="url" placeholder="https://…" value="${escapeHtml(item.organization?.logo_url || '')}"></label>
    <button class="btn btn-primary-soft" type="submit">Guardar links</button>
  </form>`).join('');
}

function httpsUrl(value, required = false) {
  if (!value && !required) return null;
  try { const url = new URL(value); return url.protocol === 'https:' ? url.href : null; }
  catch { return null; }
}

async function saveAdminAssets(event) {
  const form = event.target.closest('[data-admin-asset]');
  if (!form || !isAdmin) return;
  event.preventDefault();
  const submit = form.querySelector('button[type="submit"]');
  const imageInput = form.elements.image_url;
  const logoInput = form.elements.logo_url;
  const image = httpsUrl(imageInput.value);
  const logo = httpsUrl(logoInput.value);
  if ((imageInput.value && !image) || (logoInput.value && !logo)) { notify('Usa links HTTPS válidos para a imagem e o logótipo.'); return; }
  if (!image && !logo) { notify('Indica pelo menos um link para guardar. Os campos vazios não removem links existentes.'); return; }
  if (logo && !form.dataset.organizationId) { notify('Esta oportunidade não tem uma organização associada para guardar o logótipo.'); return; }
  submit.disabled = true;
  let imageSaved = false;
  let logoSaved = false;
  try {
    if (image) {
      const { error: opportunityError } = await supabaseClient.from('opportunities').update({ image_url: image }).eq('id', form.dataset.adminAsset);
      if (opportunityError) throw opportunityError;
      imageSaved = true;
    }
    if (logo) {
      const { error: organizationError } = await supabaseClient.from('organizations').update({ logo_url: logo }).eq('id', form.dataset.organizationId);
      if (organizationError) throw organizationError;
      logoSaved = true;
    }
    notify('Links do cartão guardados.');
    await loadAdminAssets();
  } catch (error) {
    console.error('PULSO admin asset update failed', error);
    if (imageSaved || logoSaved) {
      notify(`Alteração parcial: ${imageSaved ? 'imagem' : 'logótipo'} guardado; o outro link não foi guardado.`);
      await loadAdminAssets();
    } else notify(error.message || 'Não foi possível guardar os links.');
  } finally { submit.disabled = false; }
}

async function createManualOpportunity(event) {
  event.preventDefault();
  if (!isAdmin) return;
  const form = event.currentTarget;
  const values = new FormData(form);
  const feedback = $('#adminFormFeedback');
  const website = httpsUrl(String(values.get('official_website') || ''), true);
  const source = httpsUrl(String(values.get('source_url') || ''), true);
  const application = httpsUrl(String(values.get('application_url') || ''));
  const image = httpsUrl(String(values.get('image_url') || ''));
  const logo = httpsUrl(String(values.get('logo_url') || ''));
  if (!website || !source || (values.get('application_url') && !application)
      || (values.get('image_url') && !image) || (values.get('logo_url') && !logo)) {
    setFeedback(feedback, 'Os links devem ser HTTPS válidos e apontar para fontes oficiais.', 'error'); return;
  }
  const submit = $('button[type="submit"]', form);
  submit.disabled = true;
  let createdOrganizationId = null;
  let opportunityCreated = false;
  let existingOrganization = false;
  try {
    const organizationNameValue = String(values.get('organization')).trim();
    let { data: organization, error } = await supabaseClient.from('organizations')
      .select('id').eq('official_website', website).maybeSingle();
    if (error) throw error;
    if (!organization) {
      const inserted = await supabaseClient.from('organizations').insert({
        name: organizationNameValue, official_website: website, logo_url: logo,
        verification_status: 'verified',
      }).select('id').single();
      if (inserted.error) throw inserted.error;
      organization = inserted.data;
      createdOrganizationId = organization.id;
    } else existingOrganization = true;
    const payload = {
      organization_id: organization.id, title: String(values.get('title')).trim(),
      description: String(values.get('description')).trim(), category: String(values.get('category')),
      province: String(values.get('province') || '').trim() || null,
      municipality: String(values.get('municipality') || '').trim() || null,
      application_deadline: String(values.get('application_deadline') || '') || null,
      source_name: organizationNameValue, source_url: source, application_url: application || source,
      image_url: image, status: 'published', verification_status: 'verified', published_at: new Date().toISOString(),
    };
    const { error: opportunityError } = await supabaseClient.from('opportunities').insert(payload);
    if (opportunityError) throw opportunityError;
    opportunityCreated = true;
    form.reset();
    if (existingOrganization && logo) {
      const { error: organizationError } = await supabaseClient.from('organizations')
        .update({ logo_url: logo, verification_status: 'verified' }).eq('id', organization.id);
      if (organizationError) {
        setFeedback(feedback, 'A oportunidade foi publicada, mas o logótipo ficou pendente. Completa-o na fila de cartões do painel.', 'error');
        await Promise.all([loadAdminAssets(), loadOpportunities(), loadStats()]);
        return;
      }
    }
    setFeedback(feedback, 'Oportunidade guardada e publicada. Confirma sempre a fonte oficial e o prazo.', 'success');
    await Promise.all([loadAdminAssets(), loadOpportunities(), loadStats()]);
  } catch (error) {
    console.error('PULSO manual opportunity creation failed', error);
    let cleanupNote = '';
    if (createdOrganizationId && !opportunityCreated) {
      const { error: cleanupError } = await supabaseClient.from('organizations').delete().eq('id', createdOrganizationId);
      if (cleanupError) {
        console.error('PULSO could not clean up an unused organization', cleanupError);
        cleanupNote = ' A organização ficou criada sem oportunidade; remove-a ou tenta novamente no painel.';
      } else cleanupNote = ' A organização não utilizada foi removida.';
    }
    if (opportunityCreated) {
      form.reset();
      setFeedback(feedback, 'A oportunidade foi publicada, mas o logótipo não foi actualizado. Completa-o na fila de cartões do painel.', 'error');
      await Promise.all([loadAdminAssets(), loadOpportunities(), loadStats()]);
    } else {
      setFeedback(feedback, `${error.message || 'Não foi possível guardar a oportunidade. Verifica se a migration de permissões está activa.'}${cleanupNote}`, 'error');
    }
  } finally { submit.disabled = false; }
}

async function loadOpportunities({ append = false } = {}) {
  const target = $('#dashboardOpportunityList');
  if (!append) {
    opportunities = [];
    opportunitiesOffset = 0;
    opportunitiesHaveMore = false;
    renderOpportunityLists();
  }
  const from = append ? opportunitiesOffset : 0;
  const to = from + PAGE_SIZE - 1;
  const { data, error } = await supabaseClient.from('opportunities')
    .select('id,title,description,category,sector,province,municipality,vacancies,requirements,education_level,experience,application_deadline,published_at,source_name,source_url,application_url,image_url,organization:organizations(name,logo_url)')
    .eq('status', 'published').eq('verification_status', 'verified')
    .order('published_at', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false }).range(from, to);
  if (error) {
    console.error('PULSO dashboard catalogue failed', error);
    if (!append) {
      target.innerHTML = '<div class="empty-state" role="alert"><b>Não foi possível carregar as oportunidades.</b>Verifica a ligação e tenta novamente.<button class="btn-primary" type="button" data-retry-opportunities>Tentar novamente</button></div>';
    }
    $('#featuredOpportunityList').innerHTML = '<div class="empty-state"><b>Catálogo temporariamente indisponível.</b></div>';
    return;
  }
  const rows = data || [];
  opportunities = append ? [...opportunities, ...rows] : rows;
  opportunitiesOffset = opportunities.length;
  opportunitiesHaveMore = rows.length === PAGE_SIZE;
  renderOpportunityLists();
}

async function loadSavedOpportunities() {
  const target = $('#savedOpportunityList');
  target.innerHTML = '<div class="empty-state"><b>A carregar oportunidades guardadas…</b></div>';
  const { data, error } = await supabaseClient.from('saved_opportunities')
    .select('opportunity_id,created_at,opportunity:opportunities!inner(id,title,description,category,sector,province,municipality,application_deadline,published_at,source_name,source_url,application_url,image_url,organization:organizations(name,logo_url))')
    .eq('user_id', currentUser.id).order('created_at', { ascending: false });
  if (error) {
    console.error('PULSO dashboard saved items failed', error);
    target.innerHTML = '<div class="empty-state" role="alert"><b>Não foi possível carregar os guardados.</b>Verifica a ligação e tenta novamente.</div>';
    return;
  }
  savedRows = (data || []).filter(row => row.opportunity).map(row => row.opportunity);
  savedIds = new Set((data || []).map(row => row.opportunity_id));
  $('#savedNavCount').textContent = safeCount(savedIds.size);
  $('#statSaved').textContent = safeCount(savedIds.size);
  if (!savedRows.length) {
    target.innerHTML = '<div class="empty-state"><b>Ainda não guardaste oportunidades.</b>Explora as publicações verificadas e usa o coração para criar a tua lista pessoal.</div>';
  } else {
    target.innerHTML = savedRows.map(item => renderOpportunityCard(item, { savedPage: true })).join('');
  }
  renderOpportunityLists();
}

async function toggleSavedOpportunity(id) {
  if (!currentUser || !supabaseClient) return;
  const exists = savedIds.has(id);
  const result = exists
    ? await supabaseClient.from('saved_opportunities').delete().eq('user_id', currentUser.id).eq('opportunity_id', id)
    : await supabaseClient.from('saved_opportunities').insert({ user_id: currentUser.id, opportunity_id: id });
  if (result.error) {
    console.error('PULSO save opportunity failed', result.error);
    notify('Não foi possível actualizar os guardados. Tenta novamente.');
    return;
  }
  if (exists) savedIds.delete(id); else savedIds.add(id);
  await loadSavedOpportunities();
  notify(exists ? 'Oportunidade removida dos guardados.' : 'Oportunidade guardada na tua conta.');
}

function splitList(value) {
  return [...new Set(String(value || '').split(',').map(item => item.trim()).filter(Boolean))];
}

async function loadAlerts() {
  const target = $('#alertList');
  const { data, error } = await supabaseClient.from('user_alerts')
    .select('id,name,categories,provinces,keywords,active,created_at')
    .eq('user_id', currentUser.id).order('created_at', { ascending: false });
  if (error) {
    console.error('PULSO alerts failed', error);
    target.innerHTML = '<div class="empty-state" role="alert"><b>Não foi possível carregar os alertas.</b>Confirma a ligação à base de dados.</div>';
    return;
  }
  alerts = data || [];
  $('#alertTotal').textContent = safeCount(alerts.length);
  if (!alerts.length) {
    target.innerHTML = '<div class="empty-state"><b>Ainda não criaste alertas.</b>Escolhe uma categoria, província ou palavra-chave no formulário.</div>';
    return;
  }
  target.innerHTML = alerts.map(alert => {
    const criteria = [
      ...(alert.categories || []).map(categoryLabel),
      ...(alert.provinces || []),
      ...(alert.keywords || []).map(word => `“${word}”`),
    ];
    return `<article class="alert-item"><div><h3>${escapeHtml(alert.name)}</h3><p>${criteria.length ? criteria.map(escapeHtml).join(' · ') : 'Todas as oportunidades'}${alert.active ? '' : ' · Pausado'}</p></div><div class="alert-item-actions"><button class="alert-toggle" type="button" role="switch" aria-checked="${Boolean(alert.active)}" data-toggle-alert="${escapeHtml(alert.id)}" aria-label="${alert.active ? 'Pausar' : 'Activar'} alerta ${escapeHtml(alert.name)}"></button><button class="alert-delete" type="button" data-delete-alert="${escapeHtml(alert.id)}" aria-label="Remover alerta ${escapeHtml(alert.name)}">×</button></div></article>`;
  }).join('');
}

async function createAlert(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const feedback = $('#alertFeedback');
  const values = new FormData(form);
  const categories = values.getAll('category').map(String);
  const provinces = splitList(values.get('province'));
  const keywords = splitList(values.get('keywords'));
  const name = String(values.get('name') || '').trim();
  if (!categories.length && !provinces.length && !keywords.length) {
    setFeedback(feedback, 'Escolhe pelo menos uma categoria, uma província ou uma palavra-chave.', 'error');
    return;
  }
  const submit = $('button[type="submit"]', form);
  submit.disabled = true;
  try {
    const { error } = await supabaseClient.from('user_alerts').insert({
      user_id: currentUser.id,
      name,
      categories,
      provinces,
      keywords,
      active: true,
    });
    if (error) throw error;
    form.reset();
    setFeedback(feedback, 'Alerta guardado na tua conta. A geração automática de notificações depende de o serviço de alertas estar activo no Supabase.', 'success');
    await loadAlerts();
    notify('O teu alerta ficou guardado.');
  } catch (error) {
    console.error('PULSO alert create failed', error);
    setFeedback(feedback, 'Não foi possível guardar o alerta. Verifica a ligação e tenta novamente.', 'error');
  } finally {
    submit.disabled = false;
  }
}

async function updateAlert(id, patch) {
  const { error } = await supabaseClient.from('user_alerts').update(patch)
    .eq('id', id).eq('user_id', currentUser.id);
  if (error) {
    console.error('PULSO alert update failed', error);
    notify('Não foi possível actualizar este alerta.');
    return;
  }
  await loadAlerts();
  notify(patch.active ? 'Alerta activado.' : 'Alerta pausado.');
}

async function deleteAlert(id) {
  const { error } = await supabaseClient.from('user_alerts').delete()
    .eq('id', id).eq('user_id', currentUser.id);
  if (error) {
    console.error('PULSO alert delete failed', error);
    notify('Não foi possível remover este alerta.');
    return;
  }
  await loadAlerts();
  notify('Alerta removido.');
}

function renderNotifications() {
  const target = $('#notificationList');
  const unread = notifications.filter(item => !item.read_at).length;
  $('#unreadInlineCount').textContent = safeCount(unread);
  $('#notificationNavCount').textContent = safeCount(unread);
  $('#notificationNavCount').hidden = unread === 0;
  $('#notificationCount').textContent = unread > 9 ? '9+' : String(unread);
  $('#notificationCount').hidden = unread === 0;
  $('#notificationBell').setAttribute('aria-label', unread ? `${unread} notificações por ler` : 'Abrir notificações');
  if (!notifications.length) {
    target.innerHTML = '<div class="empty-state"><b>Ainda não tens notificações.</b>As notificações associadas à tua conta aparecem aqui quando estão disponíveis.</div>';
    return;
  }
  target.innerHTML = notifications.map(item => `<article class="notification-item ${item.read_at ? '' : 'unread'}">
    <span class="notification-icon" aria-hidden="true">${item.opportunity_id ? '▤' : '✦'}</span>
    <div class="notification-copy"><b>${escapeHtml(item.title)}</b><p>${escapeHtml(item.message)}</p><small>${escapeHtml(formatDateTime(item.created_at))}</small></div>
    <div class="notification-item-actions">${item.opportunity_id ? `<button class="notification-open" type="button" data-notification-opportunity="${escapeHtml(item.opportunity_id)}">Ver oportunidade</button>` : ''}${item.read_at ? '' : `<button class="notification-read" type="button" data-read-notification="${escapeHtml(item.id)}">Marcar como lida</button>`}</div>
  </article>`).join('');
}

async function loadNotifications({ poll = false } = {}) {
  if (!supabaseClient || !currentUser) return;
  const { data, error } = await supabaseClient.from('notifications')
    .select('id,title,message,opportunity_id,read_at,created_at')
    .eq('user_id', currentUser.id).order('created_at', { ascending: false }).limit(50);
  if (error) {
    console.error('PULSO notifications failed', error);
    $('#notificationList').innerHTML = '<div class="empty-state" role="alert"><b>Não foi possível carregar as notificações.</b>Verifica a ligação e tenta novamente.</div>';
    return;
  }
  notifications = data || [];
  const newItems = notificationIds === null ? [] : notifications.filter(item => !notificationIds.has(item.id));
  notificationIds = new Set(notifications.map(item => item.id));
  renderNotifications();
  if (poll && newItems.length) {
    notify(newItems.length === 1 ? 'Tens uma nova notificação de oportunidade.' : `Tens ${newItems.length} novas notificações.`);
    if (window.Notification?.permission === 'granted' && localStorage.getItem(`pulso-browser-alerts-${currentUser.id}`) === 'on') {
      newItems.forEach(item => {
        const browserNotice = new Notification(item.title, {
          body: item.message,
          icon: './assets/pulso-mark-3d-small.png',
          tag: `pulso-${item.id}`,
        });
        browserNotice.onclick = () => {
          window.focus();
          if (item.opportunity_id) void openOpportunity(item.opportunity_id);
          else activateView('notifications');
          browserNotice.close();
        };
      });
    }
  }
}

async function markNotificationRead(id) {
  const { error } = await supabaseClient.from('notifications').update({ read_at: new Date().toISOString() })
    .eq('id', id).eq('user_id', currentUser.id);
  if (error) {
    console.error('PULSO notification update failed', error);
    notify('Não foi possível actualizar a notificação.');
    return;
  }
  await loadNotifications();
}

async function openOpportunity(id) {
  let item = opportunities.find(row => row.id === id) || savedRows.find(row => row.id === id);
  if (!item) {
    const { data, error } = await supabaseClient.from('opportunities')
      .select('id,title,description,category,sector,province,municipality,requirements,education_level,experience,application_deadline,published_at,source_name,source_url,application_url,image_url,organization:organizations(name,logo_url)')
      .eq('id', id).eq('status', 'published').eq('verification_status', 'verified').maybeSingle();
    if (error || !data) {
      notify('Esta oportunidade já não está disponível.');
      return;
    }
    item = data;
  }
  renderOpportunityDetail(item);
}

function renderOpportunityDetail(item) {
  const source = safeUrl(item.source_url);
  const apply = safeUrl(item.application_url) || source;
  const image = safeUrl(item.image_url);
  const details = [item.description, item.requirements ? `Requisitos: ${item.requirements}` : '',
    item.education_level ? `Escolaridade: ${item.education_level}` : '', item.experience ? `Experiência: ${item.experience}` : ''].filter(Boolean);
  const place = [item.municipality, item.province].filter(Boolean).join(', ') || 'Localização não indicada';
  $('#opportunityDetail').innerHTML = `<div class="opportunity-detail-inner">
    ${image ? `<img class="detail-image" src="${escapeHtml(image)}" alt="Imagem de ${escapeHtml(item.title)}" loading="lazy">` : ''}
    <div class="detail-brand"><img src="assets/pulso-mark-3d-small.png" alt=""> OPORTUNIDADE VERIFICADA</div>
    <h2 id="detailTitle">${escapeHtml(item.title)}</h2>
    <p>${escapeHtml(organizationName(item))} · ${escapeHtml(place)}</p>
    <div class="detail-meta"><span class="detail-pill">${escapeHtml(categoryLabel(item.category))}</span>${item.application_deadline ? `<span class="detail-pill">Candidaturas até ${escapeHtml(formatDate(item.application_deadline))}</span>` : ''}</div>
    ${details.length ? `<div class="detail-description">${details.map(escapeHtml).join('\n\n')}</div>` : ''}
    <div class="detail-source"><b>Fonte:</b> ${escapeHtml(item.source_name || organizationName(item))}${source ? ` · <a href="${escapeHtml(source)}" target="_blank" rel="noopener noreferrer">Abrir publicação original ↗</a>` : ''}</div>
    <div class="detail-links">${apply ? `<a href="${escapeHtml(apply)}" target="_blank" rel="noopener noreferrer">Aceder à candidatura <span>↗</span></a>` : ''}${source ? `<a class="secondary-link" href="${escapeHtml(source)}" target="_blank" rel="noopener noreferrer">Ver fonte original</a>` : ''}<button class="dash-op-save ${savedIds.has(item.id) ? 'saved' : ''}" type="button" data-save-opportunity="${escapeHtml(item.id)}">${savedIds.has(item.id) ? '♥ Remover dos guardados' : '♡ Guardar oportunidade'}</button></div>
  </div>`;
  const dialog = $('#opportunityDialog');
  if (!dialog.open) dialog.showModal();
}

async function saveProfile(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const feedback = $('#profileFeedback');
  const submit = $('button[type="submit"]', form);
  const values = new FormData(form);
  const fullName = String(values.get('full_name') || '').trim();
  if (!fullName) {
    setFeedback(feedback, 'Indica o teu nome completo.', 'error');
    return;
  }
  submit.disabled = true;
  try {
    const changes = {
      full_name: fullName,
      province: String(values.get('province') || '').trim() || null,
      municipality: String(values.get('municipality') || '').trim() || null,
      professional_area: String(values.get('professional_area') || '').trim() || null,
      education_level: String(values.get('education_level') || '').trim() || null,
      preferences: { ...(profile.preferences || {}), avatar: avatarKey(values.get('avatar')) },
    };
    const { data, error } = await supabaseClient.from('profiles').update(changes)
      .eq('id', currentUser.id).select('id,full_name,province,municipality,professional_area,education_level,preferences').single();
    if (error) throw error;
    profile = data || { ...profile, ...changes };
    try {
      const { data: authData, error: authError } = await supabaseClient.auth.updateUser({ data: { full_name: fullName } });
      if (authError) console.warn('Profile saved; Auth metadata refresh was not available.', authError);
      if (authData?.user) currentUser = authData.user;
    } catch (authError) {
      console.warn('Profile saved; Auth metadata refresh was not available.', authError);
    }
    updateIdentity();
    setFeedback(feedback, 'Perfil actualizado. As tuas alterações ficaram guardadas na tua conta.', 'success');
    notify('Perfil actualizado.');
  } catch (error) {
    console.error('PULSO profile update failed', error);
    setFeedback(feedback, 'Não foi possível guardar o perfil. Confirma a ligação e tenta novamente.', 'error');
  } finally {
    submit.disabled = false;
  }
}

async function enableBrowserAlerts() {
  if (!('Notification' in window)) {
    notify('Este navegador não suporta avisos do PULSO. As notificações continuam disponíveis no dashboard.');
    return;
  }
  if (window.Notification.permission === 'denied') {
    notify('Os avisos foram bloqueados neste navegador. Altera a permissão nas definições do site.');
    return;
  }
  const permission = window.Notification.permission === 'granted'
    ? 'granted'
    : await window.Notification.requestPermission();
  if (permission !== 'granted') {
    notify('Os avisos do navegador não foram activados. Podes continuar a consultar o sino no dashboard.');
    return;
  }
  localStorage.setItem(`pulso-browser-alerts-${currentUser.id}`, 'on');
  $('#browserAlertLabel').textContent = 'Avisos activos';
  $('#browserAlertInline').textContent = 'Activo';
  notify('Avisos activados neste navegador enquanto o dashboard estiver aberto.');
}

function updateBrowserAlertButtons() {
  const active = window.Notification?.permission === 'granted'
    && localStorage.getItem(`pulso-browser-alerts-${currentUser.id}`) === 'on';
  $('#browserAlertLabel').textContent = active ? 'Avisos activos' : 'Activar avisos';
  $('#browserAlertInline').textContent = active ? 'Activo' : 'Activar';
}

async function signOut() {
  const { error } = await supabaseClient.auth.signOut();
  if (error) {
    notify('Não foi possível terminar a sessão. Tenta novamente.');
    return;
  }
  window.location.replace('./index.html');
}

function showConnectionError(message) {
  $('#dashboardLoading').innerHTML = `<span class="loading-orbit"></span><b>${escapeHtml(message)}</b><small>Não foi possível confirmar a tua sessão com o Supabase.</small><a class="back-home-link" href="./index.html">Voltar à página inicial</a>`;
}

function bindEvents() {
  $$('[data-view]').forEach(button => button.addEventListener('click', () => activateView(button.dataset.view)));
  $('#profileMenuButton').addEventListener('click', () => {
    const menu = $('#profileMenu');
    menu.hidden = !menu.hidden;
    $('#profileMenuButton').setAttribute('aria-expanded', String(!menu.hidden));
  });
  document.addEventListener('click', event => {
    if (!event.target.closest('.profile-anchor')) {
      $('#profileMenu').hidden = true;
      $('#profileMenuButton').setAttribute('aria-expanded', 'false');
    }
  });
  $('#notificationBell').addEventListener('click', () => activateView('notifications'));
  $('#signOutButton').addEventListener('click', () => void signOut());
  $('#alertForm').addEventListener('submit', createAlert);
  $('#profileForm').addEventListener('submit', saveProfile);
  $$('[data-avatar-choice]').forEach(input => input.addEventListener('change', () => {
    selectedAvatar = avatarKey(input.value);
    renderAvatarTargets();
  }));
  $('#manualOpportunityForm').addEventListener('submit', createManualOpportunity);
  $('#adminAssetList').addEventListener('submit', saveAdminAssets);
  $('#refreshAdminAssets').addEventListener('click', () => void loadAdminAssets());
  $('#browserAlertButton').addEventListener('click', () => void enableBrowserAlerts());
  $('#browserAlertInline').addEventListener('click', () => void enableBrowserAlerts());
  $('#refreshNotifications').addEventListener('click', () => void loadNotifications());
  $('#loadMoreOpportunities').addEventListener('click', () => void loadOpportunities({ append: true }));
  $('#clearOpportunityFilters').addEventListener('click', () => {
    $('#opportunitySearch').value = '';
    $('#opportunityCategory').value = '';
    $('#opportunityProvince').value = '';
    renderOpportunityLists();
  });
  ['#opportunitySearch', '#opportunityCategory', '#opportunityProvince'].forEach(selector => {
    $(selector).addEventListener('input', renderOpportunityLists);
    $(selector).addEventListener('change', renderOpportunityLists);
  });
  $('#alertList').addEventListener('click', event => {
    const toggle = event.target.closest('[data-toggle-alert]');
    const remove = event.target.closest('[data-delete-alert]');
    if (toggle) {
      const alert = alerts.find(item => item.id === toggle.dataset.toggleAlert);
      if (alert) void updateAlert(alert.id, { active: !alert.active });
    }
    if (remove) void deleteAlert(remove.dataset.deleteAlert);
  });
  document.addEventListener('click', event => {
    const save = event.target.closest('[data-save-opportunity]');
    const detail = event.target.closest('[data-detail-opportunity]');
    const read = event.target.closest('[data-read-notification]');
    const notificationOpportunity = event.target.closest('[data-notification-opportunity]');
    const retry = event.target.closest('[data-retry-opportunities]');
    const card = event.target.closest('[data-opportunity]');
    if (save) void toggleSavedOpportunity(save.dataset.saveOpportunity);
    if (detail) void openOpportunity(detail.dataset.detailOpportunity);
    if (!save && !detail && card) void openOpportunity(card.dataset.opportunity);
    if (read) void markNotificationRead(read.dataset.readNotification);
    if (notificationOpportunity) void openOpportunity(notificationOpportunity.dataset.notificationOpportunity);
    if (retry) void loadOpportunities();
  });
  $('#detailClose').addEventListener('click', () => $('#opportunityDialog').close());
  $('#opportunityDialog').addEventListener('click', event => {
    if (event.target === $('#opportunityDialog')) $('#opportunityDialog').close();
  });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void loadNotifications({ poll: true });
  });
  window.addEventListener('hashchange', () => {
    const view = location.hash.slice(1);
    if ($(`[data-panel="${view}"]`)) activateView(view, { updateHash: false });
  });
}

async function initializeDashboard() {
  try {
    const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2');
    supabaseClient = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
      auth: { autoRefreshToken: true, persistSession: true, detectSessionInUrl: true, flowType: 'pkce' },
    });
    const { data, error } = await supabaseClient.auth.getSession();
    if (error) throw error;
    if (!data.session?.user) {
      window.location.replace('./index.html?from=dashboard');
      return;
    }
    currentUser = data.session.user;
    supabaseClient.auth.onAuthStateChange((_event, session) => {
      if (!session?.user) window.location.replace('./index.html');
      else {
        currentUser = session.user;
        if (profile.full_name) updateIdentity();
      }
    });
    const hashView = location.hash.slice(1);
    const firstView = $(`[data-panel="${hashView}"]`) ? hashView : 'overview';
    await Promise.allSettled([loadProfile(), loadStats(), loadOpportunities(), loadSavedOpportunities(), loadAlerts(), loadNotifications(), loadAdminAccess()]);
    updateIdentity();
    updateBrowserAlertButtons();
    $('#dashboardLoading').hidden = true;
    activateView(firstView, { updateHash: false });
    window.setInterval(() => {
      if (document.visibilityState === 'visible') void loadNotifications({ poll: true });
    }, 45000);
  } catch (error) {
    console.error('PULSO dashboard could not be initialized', error);
    showConnectionError('Não foi possível ligar o teu painel.');
  }
}

bindEvents();
void initializeDashboard();
