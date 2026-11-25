import { showPulsoAlert, showPulsoConfirm } from './pulso-dialogs.js';

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const CATEGORY_LABELS = {
  employment: 'Emprego', scholarship: 'Bolsa', public_competition: 'Concurso',
  internship: 'Estágio', training: 'Formação', recruitment_program: 'Programa',
};
let supabase = null;
let currentUser = null;
let isAdmin = false;
let adminLoading = false;
let subscriptions = [];
let dispatches = [];
let opportunitiesById = new Map();

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[char]);
}

function setFeedback(element, message, kind = 'success') {
  if (!element) return;
  element.textContent = message;
  element.dataset.kind = kind;
  element.hidden = !message;
}

function splitList(value) {
  return [...new Set(String(value || '').split(/[;,\n]/).map(item => item.trim()).filter(Boolean))].slice(0, 20);
}

function listText(value) {
  return Array.isArray(value) ? value.join(', ') : '';
}

function normalizeWhatsapp(value) {
  let digits = String(value || '').trim().replace(/[^\d]/g, '');
  if (digits.startsWith('00')) digits = digits.slice(2);
  if (digits.length === 9 && digits.startsWith('9')) digits = `244${digits}`;
  if (digits.length < 8 || digits.length > 15 || digits.startsWith('0')) return '';
  return `+${digits}`;
}

function openDetails(event) {
  const form = $('#whatsappAlertForm');
  const selectedCategories = $$('input[name="wa_category"]:checked', form).map(input => input.value);
  const values = new FormData(form);
  const criteria = [
    selectedCategories.length,
    splitList(values.get('sectors')).length,
    splitList(values.get('provinces')).length,
    splitList(values.get('keywords')).length,
  ].some(Boolean);
  if (!criteria) {
    event.preventDefault();
    setFeedback($('#whatsappAlertFeedback'), 'Indica pelo menos um critério: categoria, sector, província ou palavra-chave.', 'error');
    return false;
  }
  return true;
}

function renderSubscription(data) {
  const form = $('#whatsappAlertForm');
  if (!form) return;
  form.reset();
  if (!data) {
    $('#whatsappAlertDelete').hidden = true;
    $('#whatsappAlertState').textContent = 'Ainda não configuraste alertas WhatsApp.';
    return;
  }
  $$('input[name="wa_category"]', form).forEach(input => {
    input.checked = (data.categories || []).includes(input.value);
  });
  form.elements.sectors.value = listText(data.sectors);
  form.elements.provinces.value = listText(data.provinces);
  form.elements.keywords.value = listText(data.keywords);
  form.elements.whatsapp_number.value = data.whatsapp_number || '';
  form.elements.active.checked = Boolean(data.active);
  form.elements.consent.checked = Boolean(data.consent_given);
  $('#whatsappAlertDelete').hidden = false;
  $('#whatsappAlertState').textContent = data.active
    ? 'Alertas activos. As mensagens serão preparadas para envio manual.'
    : 'Alertas pausados. O número fica guardado até apagares este pedido.';
}

async function loadSubscription() {
  if (!supabase || !currentUser) return;
  const feedback = $('#whatsappAlertFeedback');
  setFeedback(feedback, 'A carregar as tuas preferências…');
  const { data, error } = await supabase.from('whatsapp_alert_subscriptions')
    .select('id,categories,sectors,provinces,keywords,whatsapp_number,consent_given,consented_at,active')
    .eq('user_id', currentUser.id).maybeSingle();
  if (error) {
    renderSubscription(null);
    setFeedback(feedback, 'Não foi possível carregar. A migração SQL desta função pode ainda não estar aplicada.', 'error');
    return;
  }
  renderSubscription(data);
  setFeedback(feedback, '');
}

async function saveSubscription(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const feedback = $('#whatsappAlertFeedback');
  setFeedback(feedback, '');
  if (!openDetails(event)) return;
  if (!form.elements.consent.checked) {
    setFeedback(feedback, 'É necessário dar consentimento explícito para guardar e usar este número nos alertas.', 'error');
    return;
  }
  const phone = normalizeWhatsapp(form.elements.whatsapp_number.value);
  if (!phone) {
    setFeedback(feedback, 'Indica um número válido com indicativo do país. Ex.: +244 9XX XXX XXX.', 'error');
    form.elements.whatsapp_number.focus();
    return;
  }
  const payload = {
    user_id: currentUser.id,
    categories: $$('input[name="wa_category"]:checked', form).map(input => input.value),
    sectors: splitList(form.elements.sectors.value),
    provinces: splitList(form.elements.provinces.value),
    keywords: splitList(form.elements.keywords.value),
    whatsapp_number: phone,
    consent_given: true,
    consented_at: new Date().toISOString(),
    consent_text_version: 'pulso-whatsapp-v1',
    active: form.elements.active.checked,
    updated_at: new Date().toISOString(),
  };
  const submit = form.querySelector('button[type="submit"]');
  submit.disabled = true;
  submit.dataset.label = submit.textContent;
  submit.textContent = 'A guardar…';
  const { data, error } = await supabase.from('whatsapp_alert_subscriptions')
    .upsert(payload, { onConflict: 'user_id' })
    .select('id,categories,sectors,provinces,keywords,whatsapp_number,consent_given,consented_at,active')
    .single();
  submit.disabled = false;
  submit.textContent = submit.dataset.label || 'Guardar preferências';
  delete submit.dataset.label;
  if (error) {
    console.error('PULSO WhatsApp preference save failed', error);
    setFeedback(feedback, 'Não foi possível guardar. Confirma o consentimento e se a migração SQL já foi aplicada.', 'error');
    return;
  }
  renderSubscription(data);
  setFeedback(feedback, 'Preferências guardadas. O PULSO irá mostrar as correspondências; o envio pelo WhatsApp continua manual.');
  if (isAdmin) void loadAdminQueue();
}

async function deleteSubscription() {
  if (!supabase || !currentUser) return;
  if (!await showPulsoConfirm({ title: 'Apagar alertas WhatsApp?', message: 'O teu número e todas as preferências guardadas serão removidos desta conta.', confirmLabel: 'Apagar alertas', variant: 'danger' })) return;
  const { error } = await supabase.from('whatsapp_alert_subscriptions').delete().eq('user_id', currentUser.id);
  if (error) {
    setFeedback($('#whatsappAlertFeedback'), 'Não foi possível apagar o pedido. Tenta novamente.', 'error');
    return;
  }
  renderSubscription(null);
  setFeedback($('#whatsappAlertFeedback'), 'Pedido apagado. O número e as correspondências associadas foram removidos.');
  if (isAdmin) void loadAdminQueue();
}

function formatDate(value) {
  if (!value) return '';
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? '' : new Intl.DateTimeFormat('pt-AO', { dateStyle: 'medium' }).format(date);
}

function buildWhatsAppUrl(subscription, opportunity) {
  const number = String(subscription.whatsapp_number || '').replace(/\D/g, '');
  const category = CATEGORY_LABELS[opportunity.category] || 'Oportunidade';
  const lines = [
    'Olá! O PULSO encontrou uma oportunidade que pode corresponder ao teu alerta:',
    '',
    `${category}: ${opportunity.title}`,
    opportunity.sector ? `Sector: ${opportunity.sector}` : '',
    opportunity.province ? `Província: ${opportunity.province}` : '',
    opportunity.application_deadline ? `Prazo: ${opportunity.application_deadline}` : '',
    opportunity.source_name ? `Fonte: ${opportunity.source_name}` : '',
    opportunity.source_url ? `Publicação oficial: ${opportunity.source_url}` : '',
    opportunity.application_url ? `Candidatura: ${opportunity.application_url}` : '',
    '',
    'Confirma os requisitos e o prazo directamente na fonte oficial. Esta mensagem foi preparada pelo PULSO e será enviada manualmente pela equipa.',
  ].filter(Boolean);
  return `https://wa.me/${number}?text=${encodeURIComponent(lines.join('\n'))}`;
}

function renderAdminQueue() {
  const target = $('#whatsappAdminQueue');
  if (!target) return;
  if (!subscriptions.length) {
    target.innerHTML = '<div class="empty-state"><b>Não há pedidos WhatsApp activos.</b>Quando alguém configurar alertas, os pedidos aparecerão aqui.</div>';
    $('#whatsappAdminSummary').textContent = '0 pedidos';
    return;
  }
  const pendingCount = dispatches.filter(item => item.status === 'pending').length;
  const noMatchCount = subscriptions.filter(subscription =>
    !dispatches.some(item => item.subscription_id === subscription.id && item.status === 'pending'),
  ).length;
  $('#whatsappAdminSummary').textContent = `${subscriptions.length} pedido(s) · ${pendingCount} correspondência(s) por enviar · ${noMatchCount} sem novas correspondências`;
  target.innerHTML = subscriptions.map(subscription => {
    const rows = dispatches.filter(item => item.subscription_id === subscription.id);
    const pending = rows.filter(item => item.status === 'pending');
    const sent = rows.filter(item => item.status === 'sent');
    const hasNewMatch = pending.length > 0;
    const matchMarkup = pending.length ? pending.map(dispatch => {
      const opportunity = opportunitiesById.get(dispatch.opportunity_id);
      if (!opportunity) return '';
      const waUrl = buildWhatsAppUrl(subscription, opportunity);
      const place = [opportunity.municipality, opportunity.province].filter(Boolean).join(', ');
      return `<article class="wa-match-row"><div class="wa-match-copy"><b>${escapeHtml(opportunity.title)}</b><small>${escapeHtml(CATEGORY_LABELS[opportunity.category] || 'Oportunidade')}${opportunity.sector ? ` · ${escapeHtml(opportunity.sector)}` : ''}${place ? ` · ${escapeHtml(place)}` : ''}</small><small>Correspondência criada ${escapeHtml(formatDate(dispatch.created_at))}</small></div><div class="wa-match-actions"><a class="wa-open-link" href="${escapeHtml(waUrl)}" target="_blank" rel="noopener noreferrer">Abrir WhatsApp com mensagem <span>↗</span></a><button class="wa-state-button" type="button" data-dispatch-status="sent" data-dispatch-id="${escapeHtml(dispatch.id)}">Marcar como enviado</button><button class="wa-dismiss-button" type="button" data-dispatch-status="dismissed" data-dispatch-id="${escapeHtml(dispatch.id)}">Ignorar</button></div></article>`;
    }).join('') : '<p class="wa-no-match">Sem novas correspondências por agora.</p>';
    const sentMarkup = sent.length ? `<details class="wa-sent-history"><summary>${sent.length} mensagem(ns) marcada(s) como enviada(s)</summary><ul>${sent.map(item => {
      const opportunity = opportunitiesById.get(item.opportunity_id);
      return `<li>${escapeHtml(opportunity?.title || 'Oportunidade')} · ${escapeHtml(formatDate(item.sent_at))}</li>`;
    }).join('')}</ul></details>` : '';
    const criteria = [
      (subscription.categories || []).map(value => CATEGORY_LABELS[value] || value).join(', '),
      (subscription.sectors || []).join(', '),
      (subscription.provinces || []).join(', '),
      (subscription.keywords || []).join(', '),
    ].filter(Boolean).join(' · ') || 'Sem filtros (todas as oportunidades verificadas)';
    return `<article class="wa-admin-request ${hasNewMatch ? 'has-match' : 'no-match'}"><header class="wa-request-heading"><div><span class="wa-status-pill">${hasNewMatch ? 'COM CORRESPONDÊNCIA' : 'SEM NOVA CORRESPONDÊNCIA'}</span><h3>Pedido ${escapeHtml(subscription.id.slice(0, 8))}</h3><p>${escapeHtml(subscription.whatsapp_number)} · actualizado ${escapeHtml(formatDate(subscription.updated_at))}</p></div><span class="wa-match-count">${pending.length} nova(s)</span></header><p class="wa-request-criteria"><b>Critérios:</b> ${escapeHtml(criteria)}</p><div class="wa-request-matches">${matchMarkup}</div>${sentMarkup}</article>`;
  }).join('');
}

async function loadAllPages(queryFactory, pageSize = 500) {
  const rows = [];
  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await queryFactory().range(offset, offset + pageSize - 1);
    if (error) return { data: null, error };
    rows.push(...(data || []));
    if (!data || data.length < pageSize) return { data: rows, error: null };
  }
}

async function loadRowsForIds(table, columns, field, ids, orderColumn) {
  const rows = [];
  for (let offset = 0; offset < ids.length; offset += 100) {
    const group = ids.slice(offset, offset + 100);
    const result = await loadAllPages(() => supabase.from(table).select(columns)
      .in(field, group).order(orderColumn, { ascending: false }));
    if (result.error) return result;
    rows.push(...result.data);
  }
  return { data: rows, error: null };
}

async function loadAdminQueue() {
  const target = $('#whatsappAdminQueue');
  if (!target || !supabase || !isAdmin || adminLoading) return;
  adminLoading = true;
  target.innerHTML = '<div class="empty-state"><b>A carregar pedidos e correspondências…</b></div>';
  const { data: subRows, error: subscriptionsError } = await loadAllPages(() => supabase.from('whatsapp_alert_subscriptions')
    .select('id,user_id,whatsapp_number,categories,sectors,provinces,keywords,active,updated_at')
    .eq('active', true).order('updated_at', { ascending: false }));
  if (subscriptionsError) {
    target.innerHTML = '<div class="empty-state" role="alert"><b>Não foi possível abrir a fila.</b>Confirma se a migração SQL de alertas WhatsApp foi aplicada e se tens acesso de administrador.</div>';
    adminLoading = false;
    return;
  }
  subscriptions = subRows || [];
  dispatches = [];
  opportunitiesById = new Map();
  if (subscriptions.length) {
    const ids = subscriptions.map(item => item.id);
    const { data: deliveryRows, error: dispatchError } = await loadRowsForIds(
      'whatsapp_alert_dispatches', 'id,subscription_id,opportunity_id,status,created_at,sent_at',
      'subscription_id', ids, 'created_at',
    );
    if (dispatchError) {
      target.innerHTML = '<div class="empty-state" role="alert"><b>Não foi possível consultar a fila de correspondências.</b>Confirma se a migração SQL está instalada.</div>';
      adminLoading = false;
      return;
    }
    dispatches = deliveryRows || [];
    const opportunityIds = [...new Set(dispatches.map(item => item.opportunity_id))];
    if (opportunityIds.length) {
      const { data: opportunityRows, error: opportunitiesError } = await loadRowsForIds(
        'opportunities', 'id,title,category,sector,province,municipality,application_deadline,source_name,source_url,application_url',
        'id', opportunityIds, 'id',
      );
      if (opportunitiesError) {
        target.innerHTML = '<div class="empty-state" role="alert"><b>Não foi possível carregar os dados das oportunidades correspondentes.</b></div>';
        adminLoading = false;
        return;
      }
      opportunitiesById = new Map((opportunityRows || []).map(item => [item.id, item]));
    }
  }
  renderAdminQueue();
  adminLoading = false;
}

async function updateDispatchStatus(button) {
  button.disabled = true;
  const { data, error } = await supabase.rpc('set_pulso_whatsapp_dispatch_status', {
    p_dispatch_id: button.dataset.dispatchId,
    p_status: button.dataset.dispatchStatus,
  });
  if (error || data !== true) {
    button.disabled = false;
    await showPulsoAlert('Não foi possível actualizar este pedido. Actualiza a fila e tenta novamente.', { title: 'Actualização não concluída' });
    return;
  }
  await loadAdminQueue();
}

function bindModuleEvents() {
  $('#whatsappAlertForm')?.addEventListener('submit', event => void saveSubscription(event));
  $('#whatsappAlertDelete')?.addEventListener('click', () => void deleteSubscription());
  $('#whatsappAdminRefresh')?.addEventListener('click', () => void loadAdminQueue());
  $('#whatsappAdminQueue')?.addEventListener('click', event => {
    const button = event.target.closest('[data-dispatch-status]');
    if (button && supabase) void updateDispatchStatus(button);
  });
  window.addEventListener('pulso:dashboard-ready', event => {
    supabase = event.detail?.client || null;
    currentUser = event.detail?.user || null;
    if (location.hash === '#whatsapp-alerts' && supabase && currentUser) void loadSubscription();
  });
  window.addEventListener('pulso:whatsapp-view', () => {
    if (supabase && currentUser) void loadSubscription();
    if (isAdmin) void loadAdminQueue();
  });
  window.addEventListener('pulso:whatsapp-admin-access', event => {
    isAdmin = Boolean(event.detail?.isAdmin);
    const section = $('#whatsappAdminSection');
    if (section) section.hidden = !isAdmin;
    if (isAdmin && location.hash === '#whatsapp-alerts') void loadAdminQueue();
  });
}

bindModuleEvents();
const dashboardState = window.__pulsoDashboardState;
if (dashboardState?.client && dashboardState?.user) {
  supabase = dashboardState.client;
  currentUser = dashboardState.user;
  if (location.hash === '#whatsapp-alerts') void loadSubscription();
}
if (window.__pulsoAdminAccess) {
  isAdmin = true;
  $('#whatsappAdminSection').hidden = false;
  if (location.hash === '#whatsapp-alerts') void loadAdminQueue();
}
