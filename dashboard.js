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
const SOURCE_CLASS_LABELS = {
  official_institution: 'Instituição pública',
  employer: 'Empresa / recrutamento',
  news_media: 'Notícias / imprensa',
  international_organization: 'Organização internacional',
  scholarship_provider: 'Bolsas de estudo',
  data_source: 'Fonte de dados',
  training_provider: 'Formação / cursos',
  other: 'Outra fonte',
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
let automationSources = [];
let smartImportRows = [];
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

function organizationRecord(item) {
  const value = item?.organization;
  return Array.isArray(value) ? (value[0] || {}) : (value || {});
}

function organizationName(item) {
  return organizationRecord(item).name || item.source_name || 'Entidade anunciante';
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
  if (view === 'admin' && isAdmin) {
    void loadAdminAssets();
    void loadAutomationAdmin();
  }
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
  const organization = organizationRecord(item);
  const logo = safeUrl(organization.logo_url || organization.logo_source_url);
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
      ${isAdmin ? `<button class="dash-op-delete" type="button" data-delete-opportunity="${id}">Eliminar</button>` : ''}
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
  renderOpportunityLists();
  await loadAdminAssets();
  await loadAutomationAdmin();
}

function importKey(value) {
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

const IMPORT_FIELD_ALIASES = {
  title: ['title', 'titulo', 'nome', 'name', 'oportunidade', 'cargo'], category: ['category', 'categoria', 'tipo'], organization: ['organization', 'organizacao', 'entidade', 'empresa', 'organizationname'], official_website: ['officialwebsite', 'siteoficial', 'website', 'site'], source_url: ['sourceurl', 'linkdafonte', 'fonte', 'link', 'url', 'publicationurl'], application_url: ['applicationurl', 'candidatura', 'linkdacandidatura', 'applyurl'], province: ['province', 'provincia'], municipality: ['municipality', 'municipio'], application_deadline: ['applicationdeadline', 'prazo', 'deadline', 'datalimite'], description: ['description', 'descricao', 'detalhes', 'summary', 'resumo'], image_url: ['imageurl', 'imagem', 'fotografia', 'photo', 'image'], logo_url: ['logourl', 'logotipo', 'logo'], source_name: ['sourcename', 'nomedafonte'],
};
const IMPORT_CATEGORY_ALIASES = { emprego: 'employment', empregos: 'employment', job: 'employment', bolsa: 'scholarship', bolsas: 'scholarship', concurso: 'public_competition', concursos: 'public_competition', estagio: 'internship', estagios: 'internship', formacao: 'training', cursos: 'training', programa: 'recruitment_program', programas: 'recruitment_program' };

function normalizeImportRecord(record) {
  const normalized = {}; const source = record && typeof record === 'object' ? record : {};
  Object.entries(IMPORT_FIELD_ALIASES).forEach(([field, aliases]) => { const found = Object.entries(source).find(([key]) => aliases.includes(importKey(key))); normalized[field] = String(found?.[1] ?? '').trim(); });
  const categoryKey = importKey(normalized.category); normalized.category = IMPORT_CATEGORY_ALIASES[categoryKey] || (Object.keys(CATEGORY_LABELS).includes(normalized.category) ? normalized.category : 'employment');
  normalized.source_name ||= normalized.organization; normalized.application_url ||= normalized.source_url;
  normalized.valid = Boolean(normalized.title && normalized.organization && /^https:\/\//i.test(normalized.source_url)); normalized.issue = normalized.valid ? '' : 'Falta título, organização ou link HTTPS da fonte.';
  return normalized;
}

function parseCsv(text) {
  const rows = []; let row = []; let cell = ''; let quoted = false;
  for (let index = 0; index < text.length; index += 1) { const char = text[index]; if (char === '"' && text[index + 1] === '"' && quoted) { cell += '"'; index += 1; } else if (char === '"') quoted = !quoted; else if (char === ',' && !quoted) { row.push(cell.trim()); cell = ''; } else if ((char === '\n' || char === '\r') && !quoted) { if (char === '\r' && text[index + 1] === '\n') index += 1; row.push(cell.trim()); if (row.some(Boolean)) rows.push(row); row = []; cell = ''; } else cell += char; }
  row.push(cell.trim()); if (row.some(Boolean)) rows.push(row); const headers = rows.shift() || [];
  return rows.map(values => Object.fromEntries(headers.map((header, index) => [header, values[index] || ''])));
}

function parseTextRecords(text, filename = '') {
  const clean = String(text || '').replace(/^\uFEFF/, '').trim(); if (!clean) return [];
  if (/\.json$/i.test(filename) || /^[\[{]/.test(clean)) { const parsed = JSON.parse(clean); const values = Array.isArray(parsed) ? parsed : (parsed.opportunities || parsed.items || parsed.cards || parsed.data || [parsed]); return values.map(normalizeImportRecord); }
  if (/\.csv$/i.test(filename) || (clean.includes(',') && clean.split('\n')[0].includes(','))) return parseCsv(clean).map(normalizeImportRecord);
  return clean.split(/\n\s*\n/).map(block => { const record = {}; block.split('\n').forEach(line => { const match = line.match(/^\s*([^:;=]+?)\s*[:;=]\s*(.*?)\s*$/); if (match) record[match[1]] = match[2]; }); return normalizeImportRecord(record); }).filter(row => row.title || row.description);
}

async function readZipEntries(file) {
  const bytes = new Uint8Array(await file.arrayBuffer()); const view = new DataView(bytes.buffer); const decoder = new TextDecoder(); const entries = [];
  const findSignature = (signature, from) => { for (let index = from; index <= bytes.length - 4; index += 1) if (view.getUint32(index, true) === signature) return index; return -1; };
  let offset = 0;
  while ((offset = findSignature(0x04034b50, offset)) >= 0) { const method = view.getUint16(offset + 8, true); const compressedSize = view.getUint32(offset + 18, true); const nameLength = view.getUint16(offset + 26, true); const extraLength = view.getUint16(offset + 28, true); const name = decoder.decode(bytes.slice(offset + 30, offset + 30 + nameLength)); const start = offset + 30 + nameLength + extraLength; const payload = bytes.slice(start, start + compressedSize); offset = start + compressedSize; if (!/\.(txt|md|csv|json)$/i.test(name)) continue; let content; if (method === 0) content = decoder.decode(payload); else if (method === 8 && 'DecompressionStream' in window) content = decoder.decode(await new Response(new Blob([payload]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).arrayBuffer()); else throw new Error('Este ZIP usa uma compressão não suportada neste navegador.'); entries.push({ name, content }); }
  return entries;
}

function renderSmartImportPreview() {
  const preview = $('#smartImportPreview'); const valid = smartImportRows.filter(row => row.valid).length; $('#smartImportToolbar').hidden = !smartImportRows.length; $('#smartImportActions').hidden = !smartImportRows.length; $('#smartImportSummary').textContent = `${smartImportRows.length} cartão(ões) · ${valid} pronto(s) · ${smartImportRows.length - valid} com avisos`; preview.hidden = !smartImportRows.length; preview.innerHTML = smartImportRows.map((row, index) => `<article class="smart-import-row ${row.valid ? '' : 'has-issue'}"><span class="smart-import-index">${index + 1}</span><div><b>${escapeHtml(row.title || 'Sem título')}</b><small>${escapeHtml(row.organization || 'Sem organização')} · ${escapeHtml(categoryLabel(row.category))}</small><p>${escapeHtml(row.description || row.source_url || 'Sem descrição')}</p></div><span class="smart-import-state">${row.valid ? 'Pronto' : escapeHtml(row.issue)}</span></article>`).join('');
}

async function handleSmartImportFile(file) {
  if (!file) return; if (file.size > 10 * 1024 * 1024) { setFeedback($('#smartImportFeedback'), 'O ficheiro excede o limite de 10 MB.', 'error'); return; }
  try { let records = []; if (/\.zip$/i.test(file.name) || file.type === 'application/zip') { const entries = await readZipEntries(file); records = entries.flatMap(entry => parseTextRecords(entry.content, entry.name)); } else records = parseTextRecords(await file.text(), file.name); smartImportRows = records.slice(0, 200); $('#smartImportFileName').textContent = file.name; renderSmartImportPreview(); setFeedback($('#smartImportFeedback'), smartImportRows.length ? 'Pré-visualização pronta. Revê os avisos antes de importar.' : 'Não encontrei cartões com campos reconhecíveis.', smartImportRows.length ? 'success' : 'error'); } catch (error) { smartImportRows = []; renderSmartImportPreview(); setFeedback($('#smartImportFeedback'), `Não foi possível ler o ficheiro: ${error.message}`, 'error'); }
}

async function ensureSmartImportOrganization(row) {
  const website = httpsUrl(row.official_website) || null;
  const logo = httpsUrl(row.logo_url);
  const result = website
    ? await supabaseClient.from('organizations').select('id').eq('official_website', website).maybeSingle()
    : await supabaseClient.from('organizations').select('id').eq('name', row.organization).maybeSingle();
  if (result.error) throw result.error;
  if (result.data) {
    if (logo) {
      const { error } = await supabaseClient.from('organizations').update({
        logo_url: logo,
        logo_source_url: row.official_website || row.source_url,
        logo_rights_confirmed: true,
        verification_status: 'verified',
      }).eq('id', result.data.id);
      if (error) throw error;
    }
    return result.data.id;
  }
  const created = await supabaseClient.from('organizations').insert({
    name: row.organization,
    official_website: website,
    logo_url: logo,
    logo_source_url: logo ? (row.official_website || row.source_url) : null,
    logo_rights_confirmed: Boolean(logo),
    verification_status: 'verified',
  }).select('id').single();
  if (created.error) throw created.error;
  return created.data.id;
}

async function ensureSmartImportSource(row) {
  const existing = await supabaseClient.from('sources').select('id').eq('source_url', row.source_url).maybeSingle(); if (existing.error) throw existing.error; if (existing.data) return existing.data.id;
  const created = await supabaseClient.from('sources').insert({ name: row.source_name || row.organization, source_url: row.source_url, source_type: 'manual', access_status: 'authorized', active: true, visible_publicly: true }).select('id').single(); if (created.error) throw created.error; return created.data.id;
}

async function importSmartRows({ publish }) {
  const rows = smartImportRows.filter(row => row.valid); if (!rows.length) { setFeedback($('#smartImportFeedback'), 'Não há cartões válidos para importar.', 'error'); return; } const button = publish ? $('#smartImportPublishButton') : $('#smartImportReviewButton'); button.disabled = true; let created = 0; const errors = [];
  try { for (const row of rows) { try { const organizationId = await ensureSmartImportOrganization(row); const sourceId = await ensureSmartImportSource(row); const image = httpsUrl(row.image_url); const imageSource = image ? row.source_url : null; const payload = { organization_id: organizationId, source_id: sourceId, title: row.title, description: row.description || null, public_summary: row.description || null, category: row.category, province: row.province || null, municipality: row.municipality || null, application_deadline: row.application_deadline || null, source_name: row.source_name || row.organization, source_url: row.source_url, application_url: httpsUrl(row.application_url), candidate_image_url: image, candidate_image_source_url: imageSource, image_url: image, image_source_url: imageSource, image_rights_confirmed: Boolean(image), collection_method: 'manual', status: 'pending_review', verification_status: 'unverified' }; const inserted = await supabaseClient.from('opportunities').insert(payload).select('id').single(); if (inserted.error) throw inserted.error; if (publish) { const promoted = await supabaseClient.from('opportunities').update({ status: 'published', verification_status: 'verified', published_at: new Date().toISOString() }).eq('id', inserted.data.id); if (promoted.error) throw promoted.error; } created += 1; } catch (error) { errors.push(`${row.title}: ${error.message}`); } }
    setFeedback($('#smartImportFeedback'), `${created} cartão(ões) ${publish ? 'importado(s) e publicado(s)' : 'importado(s) para revisão'}.${errors.length ? ` ${errors.length} com erro: ${errors[0]}` : ''}`, errors.length ? 'error' : 'success'); if (created) { smartImportRows = []; renderSmartImportPreview(); $('#smartImportFile').value = ''; await Promise.all([loadOpportunities(), loadStats(), loadAdminAssets()]); }
  } finally { button.disabled = false; }
}

function bindSmartImport() {
  const input = $('#smartImportFile'); const dropzone = $('#smartImportDropzone'); input.addEventListener('change', () => void handleSmartImportFile(input.files[0])); ['dragenter', 'dragover'].forEach(type => dropzone.addEventListener(type, event => { event.preventDefault(); dropzone.classList.add('is-dragging'); })); ['dragleave', 'drop'].forEach(type => dropzone.addEventListener(type, event => { event.preventDefault(); dropzone.classList.remove('is-dragging'); })); dropzone.addEventListener('drop', event => void handleSmartImportFile(event.dataTransfer.files[0])); $('#clearSmartImport').addEventListener('click', () => { smartImportRows = []; input.value = ''; renderSmartImportPreview(); $('#smartImportFileName').textContent = ''; $('#smartImportSummary').textContent = ''; $('#smartImportFeedback').hidden = true; }); $('#smartImportReviewButton').addEventListener('click', () => void importSmartRows({ publish: false })); $('#smartImportPublishButton').addEventListener('click', () => { if (window.confirm('Confirmas os dados e queres publicar os cartões válidos agora?')) void importSmartRows({ publish: true }); });
}

async function loadAdminAssets() {
  if (!isAdmin) return;
  const target = $('#adminAssetList');
  target.innerHTML = '<div class="empty-state"><b>A verificar cartões…</b></div>';
  const { data, error } = await supabaseClient.from('opportunities')
    .select('id,title,category,image_url,image_source_url,image_rights_confirmed,candidate_image_url,candidate_image_source_url,source_url,organization_id,organization:organizations(id,name,logo_url,logo_source_url)')
    .eq('status', 'published').eq('verification_status', 'verified')
    .order('published_at', { ascending: false, nullsFirst: false }).limit(150);
  if (error) {
    target.innerHTML = '<div class="empty-state" role="alert"><b>Não foi possível carregar a fila.</b>Confirma a migration inicial e as permissões de administrador.</div>';
    return;
  }
  const rows = (data || []).filter(item => {
    const organization = organizationRecord(item);
    return !safeUrl(item.image_url) || !safeUrl(organization.logo_url || organization.logo_source_url);
  });
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
  target.innerHTML = rows.map(item => { const organization = organizationRecord(item); return `<form class="admin-asset-row" data-admin-asset="${escapeHtml(item.id)}" data-organization-id="${escapeHtml(item.organization_id || '')}" data-image-source="${escapeHtml(item.image_source_url || item.candidate_image_source_url || item.source_url || '')}">
    <div class="admin-asset-heading"><b>${escapeHtml(item.title)}</b><small>${escapeHtml(organization.name || 'Organização não associada')} · ${escapeHtml(categoryLabel(item.category))}</small></div>
    <label>Link da imagem<input name="image_url" type="url" placeholder="https://…" value="${escapeHtml(item.image_url || item.candidate_image_url || '')}"></label>
    <label>Link do logótipo<input name="logo_url" type="url" placeholder="https://…" value="${escapeHtml(organization.logo_url || organization.logo_source_url || '')}"></label>
    <button class="btn btn-primary-soft" type="submit">Guardar links</button>
    <button class="automation-remove admin-delete-btn" type="button" data-delete-opportunity="${escapeHtml(item.id)}">Eliminar publicação</button>
  </form>`; }).join('');
}

function renderAutomationSources() {
  const target = $('#automationSourceList');
  if (!automationSources.length) {
    target.innerHTML = '<div class="empty-state"><b>Não há fontes registadas.</b>Aplica a migration automática no Supabase para carregar as 67 fontes do ficheiro enviado.</div>';
    $('#automationSourceCount').textContent = '0 fontes';
    return;
  }
  const activeCount = automationSources.filter(source => source.active && source.collection_enabled).length;
  $('#automationSourceCount').textContent = `${safeCount(activeCount)} activas · ${safeCount(automationSources.length)} no catálogo`;
  target.innerHTML = automationSources.map(source => {
    const active = source.active && source.collection_enabled && source.access_status === 'authorized';
    const canActivate = Boolean(source.collection_endpoint && source.collection_format);
    const endpoint = safeUrl(source.collection_endpoint);
    const terms = safeUrl(source.terms_url);
    const hosts = Array.isArray(source.collection_allowed_hosts) ? source.collection_allowed_hosts.join(', ') : '';
    return `<details class="automation-source-card" data-source-card="${escapeHtml(source.id)}">
      <summary><span><b>${escapeHtml(source.name)}</b><small>${escapeHtml(source.source_group || SOURCE_CLASS_LABELS[source.source_class] || 'Fonte PULSO')}</small></span><span class="automation-state ${active ? 'is-active' : ''}">${active ? 'Activa' : 'Desactivada'}</span></summary>
      <div class="automation-source-info"><a href="${escapeHtml(safeUrl(source.source_url))}" target="_blank" rel="noopener noreferrer">Abrir fonte fornecida ↗</a><span>${escapeHtml(SOURCE_CLASS_LABELS[source.source_class] || 'Fonte PULSO')}</span></div>
      ${source.last_scanned_at ? `<p class="automation-last-scan">Última recolha: ${escapeHtml(formatDateTime(source.last_scanned_at))}${source.last_scan_status ? ` · ${escapeHtml(source.last_scan_status)}` : ''}${source.last_scan_error ? ` · ${escapeHtml(source.last_scan_error)}` : ''}</p>` : ''}
      <form class="automation-source-form" data-automation-source="${escapeHtml(source.id)}">
        <label>Endpoint exacto RSS / Atom / JSON Feed<input name="collection_endpoint" type="url" inputmode="url" placeholder="https://…" value="${escapeHtml(endpoint)}" required></label>
        <label>Formato<select name="collection_format" required><option value="">Escolher formato</option><option value="rss" ${source.collection_format === 'rss' ? 'selected' : ''}>RSS</option><option value="atom" ${source.collection_format === 'atom' ? 'selected' : ''}>Atom</option><option value="json_feed" ${source.collection_format === 'json_feed' ? 'selected' : ''}>JSON Feed</option></select></label>
        <label class="automation-wide">Domínios adicionais autorizados<input name="collection_allowed_hosts" placeholder="exemplo.org, empregos.exemplo.org" value="${escapeHtml(hosts)}"><small>Opcional. O domínio da fonte fornecida já é permitido. Usa apenas domínios que aprovaste.</small></label>
        <label class="automation-wide">Página de termos / utilização<input name="terms_url" type="url" inputmode="url" placeholder="https://…" value="${escapeHtml(terms)}"></label>
        <div class="automation-source-actions"><button class="btn btn-primary-soft" type="submit">Guardar feed</button>${active ? `<button class="filter-reset" type="button" data-source-action="suspend" data-source-id="${escapeHtml(source.id)}">Suspender</button>` : `<button class="btn btn-primary-soft" type="button" data-source-action="activate" data-source-id="${escapeHtml(source.id)}" ${canActivate ? '' : 'disabled'}>Aprovar e activar</button>`}<button class="automation-remove" type="button" data-source-action="remove" data-source-id="${escapeHtml(source.id)}">Remover fonte</button></div>
      </form>
    </details>`;
  }).join('');
}

function renderAutomaticReviews(rows) {
  const target = $('#automationReviewList');
  $('#automationReviewCount').textContent = `${safeCount(rows.length)} publicação(ões)`;
  if (!rows.length) {
    target.innerHTML = '<div class="empty-state"><b>Ainda não há publicações automáticas.</b>Activa uma fonte com feed e usa “Recolher agora”; os novos resultados aparecerão aqui para revisão posterior.</div>';
    return;
  }
  target.innerHTML = rows.map(item => {
    const source = safeUrl(item.source_url);
    const application = safeUrl(item.application_url);
    const image = safeUrl(item.candidate_image_url || item.image_url);
    const org = Array.isArray(item.organization) ? item.organization[0] || {} : item.organization || {};
    const pending = item.auto_review_status === 'pending';
    const state = item.auto_review_status === 'reviewed' ? 'Revista' : item.auto_review_status === 'dismissed' ? 'Retirada' : 'Publicada · a rever';
    const description = String(item.public_summary || item.description || '').slice(0, 600);
    return `<article class="automation-review-card"><div class="automation-review-copy"><span class="automation-state ${pending ? '' : 'is-active'}">${state}${item.status !== 'published' ? ' · fora do catálogo' : ''}</span><h4>${escapeHtml(item.title)}</h4><p>${escapeHtml(org.name || 'Organização por confirmar')} · ${escapeHtml(item.source_name || 'Fonte PULSO')} · ${escapeHtml(categoryLabel(item.category))}${item.application_deadline ? ` · prazo ${escapeHtml(formatDate(item.application_deadline))}` : ' · sem prazo indicado'}</p><div class="automation-review-details">${description ? `<span>${escapeHtml(description)}</span>` : ''}${source ? `<a href="${escapeHtml(source)}" target="_blank" rel="noopener noreferrer">Abrir fonte original ↗</a>` : ''}${application ? `<a href="${escapeHtml(application)}" target="_blank" rel="noopener noreferrer">Abrir candidatura ↗</a>` : ''}${image ? `<a href="${escapeHtml(image)}" target="_blank" rel="noopener noreferrer">Ver imagem usada no cartão ↗</a>` : '<span>Sem imagem; podes completar o cartão mais tarde.</span>'}</div>${pending ? `<label>Site oficial da organização (opcional)<input class="automation-org-url" type="url" name="organization_website" value="${escapeHtml(org.official_website || '')}" placeholder="https://…"></label>${image ? '<span class="automation-image-note">O URL da imagem está no cartão; o ficheiro não foi descarregado.</span>' : ''}</div><div class="automation-review-actions"><button class="btn btn-primary-soft" type="button" data-auto-review="approve" data-opportunity-id="${escapeHtml(item.id)}">Marcar como revista</button><button class="automation-remove" type="button" data-auto-review="dismiss" data-opportunity-id="${escapeHtml(item.id)}">Retirar publicação</button></div>` : `<small class="automation-reviewed-date">${item.auto_reviewed_at ? `Revista ${escapeHtml(formatDateTime(item.auto_reviewed_at))}` : 'Histórico automático'}</small></div>`}</article>`;
  }).join('');
}

async function loadAutomationAdmin() {
  if (!isAdmin) return;
  const sourceTarget = $('#automationSourceList');
  const reviewTarget = $('#automationReviewList');
  sourceTarget.innerHTML = '<div class="empty-state"><b>A carregar as fontes…</b></div>';
  reviewTarget.innerHTML = '<div class="empty-state"><b>A carregar publicações automáticas…</b></div>';
  const [sourceResult, reviewResult] = await Promise.all([
    supabaseClient.from('sources').select('id,name,source_url,source_type,source_group,source_class,terms_url,access_status,active,collection_enabled,collection_endpoint,collection_format,collection_allowed_hosts,last_scanned_at,last_scan_status,last_scan_error').order('source_group').order('name'),
    supabaseClient.from('opportunities').select('id,title,description,public_summary,category,application_deadline,published_at,source_name,source_url,application_url,image_url,candidate_image_url,candidate_image_source_url,organization_id,status,auto_review_status,auto_reviewed_at,organization:organizations(id,name,official_website,verification_status)').eq('collection_method', 'automatic').order('published_at', { ascending: false, nullsFirst: false }).limit(100),
  ]);
  if (sourceResult.error) {
    sourceTarget.innerHTML = '<div class="empty-state" role="alert"><b>Configuração automática ainda não aplicada.</b>Aplica a migration <code>20261120180000_pulso_ai_automation.sql</code> no Supabase. O registo manual continua disponível.</div>';
    $('#automationSourceCount').textContent = 'A configurar';
  } else {
    automationSources = sourceResult.data || [];
    renderAutomationSources();
  }
  if (reviewResult.error) {
    reviewTarget.innerHTML = '<div class="empty-state" role="alert"><b>Revisão automática ainda não disponível.</b>Aplica a migration de automação no Supabase. O formulário manual não depende desta opção.</div>';
    $('#automationReviewCount').textContent = 'A configurar';
  } else renderAutomaticReviews(reviewResult.data || []);
}

function sourceHostAllowed(host, baseUrl, additionalHosts) {
  const matches = (domain) => {
    const normalized = String(domain || '').trim().toLowerCase().replace(/^\.+|\.+$/g, '');
    return normalized && (host === normalized || host.endsWith(`.${normalized}`));
  };
  let baseHost = '';
  try { baseHost = new URL(baseUrl).hostname.toLowerCase(); } catch { return false; }
  return matches(baseHost) || additionalHosts.some(matches);
}

async function saveAutomationSource(event) {
  const form = event.target.closest('[data-automation-source]');
  if (!form || !isAdmin) return;
  event.preventDefault();
  const source = automationSources.find(item => item.id === form.dataset.automationSource);
  if (!source) return;
  const endpointInput = form.elements.collection_endpoint;
  const endpoint = httpsUrl(endpointInput.value, true);
  const format = String(form.elements.collection_format.value || '');
  const hosts = splitList(form.elements.collection_allowed_hosts.value).map(value => value.toLowerCase());
  const termsValue = String(form.elements.terms_url.value || '').trim();
  const terms = httpsUrl(termsValue);
  if (!endpoint || !['rss', 'atom', 'json_feed'].includes(format) || (termsValue && !terms)) {
    notify('Indica um endpoint e um formato suportados, usando links HTTPS.');
    return;
  }
  let endpointHost = '';
  try { endpointHost = new URL(endpoint).hostname.toLowerCase(); } catch { /* validation above */ }
  if (!sourceHostAllowed(endpointHost, source.source_url, hosts)) {
    notify('O domínio do feed tem de corresponder à fonte ou constar na lista de domínios autorizados.');
    return;
  }
  const submit = form.querySelector('button[type="submit"]');
  submit.disabled = true;
  try {
    const { error } = await supabaseClient.from('sources').update({
      collection_endpoint: endpoint,
      collection_format: format,
      source_type: format === 'json_feed' ? 'api' : 'rss',
      collection_allowed_hosts: hosts,
      terms_url: terms,
    }).eq('id', source.id);
    if (error) throw error;
    notify('Configuração do feed guardada; a fonte continua com o estado de activação actual.');
    await loadAutomationAdmin();
  } catch (error) {
    console.error('PULSO source configuration failed', error);
    notify('Não foi possível guardar o feed. Confirma a migration e as permissões de administrador.');
  } finally { submit.disabled = false; }
}

async function setAutomationSource(id, action) {
  if (!isAdmin) return;
  const source = automationSources.find(item => item.id === id);
  if (!source) return;
  if (action === 'remove' && !window.confirm(`Remover “${source.name}” do catálogo de fontes? As publicações já guardadas mantêm o título e a origem textual.`)) return;
  if (action === 'activate' && (!source.collection_endpoint || !source.collection_format)) {
    notify('Guarda primeiro um endpoint e o formato do feed.');
    return;
  }
  try {
    if (action === 'remove') {
      const { error } = await supabaseClient.from('sources').delete().eq('id', id);
      if (error) throw error;
      notify('Fonte removida; as oportunidades já publicadas não foram apagadas.');
    } else {
      const patch = action === 'activate'
        ? { active: true, collection_enabled: true, access_status: 'authorized', visible_publicly: true }
        : { active: false, collection_enabled: false };
      const { error } = await supabaseClient.from('sources').update(patch).eq('id', id);
      if (error) throw error;
      notify(action === 'activate' ? 'Fonte aprovada e activada.' : 'Recolha desta fonte suspensa.');
    }
    await loadAutomationAdmin();
  } catch (error) {
    console.error('PULSO source state change failed', error);
    notify('Não foi possível alterar a fonte. Verifica a configuração e as permissões de administrador.');
  }
}

async function runPulsoCollection() {
  if (!isAdmin || !supabaseClient) return;
  const button = $('#runPulsoCollection');
  const status = $('#automationRunStatus');
  button.disabled = true;
  status.hidden = false;
  status.textContent = 'A recolher uma fonte activa. A IA irá criar rascunhos privados para revisão.';
  try {
    const { data, error } = await supabaseClient.functions.invoke('pulso-ingest', { body: {} });
    if (error) throw error;
    const queued = Number(data?.items_published || 0);
    status.textContent = data?.processed_sources
      ? `Concluído: ${data.processed_sources} fonte(s), ${Number(data.items_seen || 0)} item(ns) analisado(s), ${queued} publicação(ões) criada(s).`
      : (data?.message || 'Não há fontes activas com feed configurado.');
    await loadAutomationAdmin();
  } catch (error) {
    console.error('PULSO collection run failed', error);
    status.textContent = `A recolha falhou: ${error?.message || 'confirma a Edge Function e as chaves server-side.'}`;
  } finally { button.disabled = false; }
}

async function reviewAutomaticPublication(id, action, button) {
  if (!isAdmin) return;
  const approving = action === 'approve';
  const card = button.closest('.automation-review-card');
  const websiteText = String(card?.querySelector('[name="organization_website"]')?.value || '').trim();
  const website = approving && websiteText ? httpsUrl(websiteText, true) : null;
  if (approving && websiteText && !website) {
    notify('O site oficial deve usar HTTPS.');
    return;
  }
  const imageRights = Boolean(approving && card?.querySelector('[data-auto-image-rights]')?.checked);
  if (approving && !window.confirm('Confirmas que reveste a fonte e os dados desta publicação? A oportunidade já está online.')) return;
  const { error } = await supabaseClient.rpc('pulso_review_automatic_opportunity', {
    p_opportunity_id: id,
    p_action: approving ? 'approve' : 'dismiss',
    p_organization_website: website,
    p_image_rights_confirmed: imageRights,
  });
  if (error) {
    console.error('PULSO automatic opportunity review failed', error);
    notify(error.message || 'Não foi possível guardar a revisão. Aplica a migration da fila de revisão.');
    return;
  }
  notify(approving ? 'Aprovada e publicada.' : 'Oportunidade rejeitada e mantida fora do catálogo.');
  await Promise.all([loadAutomationAdmin(), loadOpportunities(), loadStats()]);
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
      const candidateSource = form.dataset.imageSource || '';
      const { error: opportunityError } = await supabaseClient.from('opportunities').update({
        image_url: image,
        image_source_url: httpsUrl(candidateSource) || image,
        image_rights_confirmed: true,
        candidate_image_url: image,
        candidate_image_source_url: httpsUrl(candidateSource) || image,
      }).eq('id', form.dataset.adminAsset);
      if (opportunityError) throw opportunityError;
      imageSaved = true;
    }
    if (logo) {
      const { error: organizationError } = await supabaseClient.from('organizations').update({
        logo_url: logo,
        logo_source_url: logo,
        logo_rights_confirmed: true,
      }).eq('id', form.dataset.organizationId);
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

async function deleteAdminOpportunity(id) {
  if (!isAdmin || !id) return;
  if (!window.confirm('Eliminar esta publicação definitivamente? A organização e a fonte serão mantidas.')) return;
  try {
    const { error } = await supabaseClient.from('opportunities').delete().eq('id', id);
    if (error) throw error;
    notify('Publicação eliminada.');
    if ($('#opportunityDialog').open) $('#opportunityDialog').close();
    await Promise.all([loadAdminAssets(), loadOpportunities(), loadSavedOpportunities(), loadStats()]);
  } catch (error) {
    console.error('PULSO admin opportunity deletion failed', error);
    notify(error.message || 'Não foi possível eliminar a publicação.');
  }
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
        logo_source_url: logo ? website : null, logo_rights_confirmed: Boolean(logo),
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
        .update({ logo_url: logo, logo_source_url: website, logo_rights_confirmed: true, verification_status: 'verified' }).eq('id', organization.id);
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
    .select('id,title,description,category,sector,province,municipality,vacancies,requirements,education_level,experience,application_deadline,published_at,source_name,source_url,application_url,image_url,organization:organizations(id,name,logo_url,logo_source_url)')
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
    .select('opportunity_id,created_at,opportunity:opportunities!inner(id,title,description,category,sector,province,municipality,application_deadline,published_at,source_name,source_url,application_url,image_url,organization:organizations(id,name,logo_url,logo_source_url))')
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
      .select('id,title,description,category,sector,province,municipality,requirements,education_level,experience,application_deadline,published_at,source_name,source_url,application_url,image_url,organization:organizations(id,name,logo_url,logo_source_url)')
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
  $('#adminAssetList').addEventListener('click', event => {
    const remove = event.target.closest('[data-delete-opportunity]');
    if (remove) void deleteAdminOpportunity(remove.dataset.deleteOpportunity);
  });
  $('#refreshAdminAssets').addEventListener('click', () => void loadAdminAssets());
  $('#refreshAutomationAdmin').addEventListener('click', () => void loadAutomationAdmin());
  $('#runPulsoCollection').addEventListener('click', () => void runPulsoCollection());
  $('#automationSourceList').addEventListener('submit', saveAutomationSource);
  $('#automationSourceList').addEventListener('click', event => {
    const action = event.target.closest('[data-source-action]');
    if (action) void setAutomationSource(action.dataset.sourceId, action.dataset.sourceAction);
  });
  $('#automationReviewList').addEventListener('click', event => {
    const action = event.target.closest('[data-auto-review]');
    if (action) void reviewAutomaticPublication(action.dataset.opportunityId, action.dataset.autoReview, action);
  });
  bindSmartImport();
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
    const remove = event.target.closest('[data-delete-opportunity]');
    const detail = event.target.closest('[data-detail-opportunity]');
    const read = event.target.closest('[data-read-notification]');
    const notificationOpportunity = event.target.closest('[data-notification-opportunity]');
    const retry = event.target.closest('[data-retry-opportunities]');
    const card = event.target.closest('[data-opportunity]');
    if (save) void toggleSavedOpportunity(save.dataset.saveOpportunity);
    if (remove) void deleteAdminOpportunity(remove.dataset.deleteOpportunity);
    if (detail) void openOpportunity(detail.dataset.detailOpportunity);
    if (!save && !remove && !detail && card) void openOpportunity(card.dataset.opportunity);
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
