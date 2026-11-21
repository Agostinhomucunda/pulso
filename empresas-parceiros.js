import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from './supabase-config.js';

const BUCKET = 'pulso-business-documents';
const MAX_FILE_SIZE = 10 * 1024 * 1024;
const ALLOWED_MIME_TYPES = new Set(['application/pdf', 'image/jpeg', 'image/png', 'image/webp']);
const DOCUMENT_LABELS = {
  commercial_certificate: 'Certidão comercial',
  tax_document: 'Documento de NIF',
  business_license: 'Alvará',
  representative_id: 'Identificação do representante',
  representation_proof: 'Prova de representação',
  additional: 'Documento adicional'
};
const REQUIRED_DOCUMENTS = ['commercial_certificate', 'tax_document', 'representative_id'];
const BUSINESS_STATUSES = {
  under_review: 'Em análise',
  additional_documents_requested: 'Documentação adicional solicitada',
  verified: 'Verificada',
  rejected: 'Rejeitada',
  suspended: 'Suspensa'
};
const PARTNERSHIP_STATUSES = {
  received: 'Recebido',
  under_review: 'Em análise',
  additional_information_requested: 'Informação adicional solicitada',
  approved: 'Parceria aprovada',
  rejected: 'Parceria rejeitada',
  suspended: 'Parceria suspensa'
};
const DOCUMENT_STATUSES = {
  submitted: 'Enviado · pendente de revisão',
  replacement_requested: 'Precisa de substituição',
  accepted: 'Aceite',
  rejected: 'Não aceite'
};

const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const authPanel = $('#authPanel');
const portalApp = $('#portalApp');
const requestedFlow = new URLSearchParams(window.location.search).get('flow');
const requestedView = requestedFlow === 'partnership' ? 'partnership' : 'business';
const hasRequestedFlow = requestedFlow === 'business' || requestedFlow === 'partnership';
const requestedPanel = new URLSearchParams(window.location.search).get('view') === 'requests' ? 'requests' : null;
let currentUser = null;
let authUpdateInProgress = false;
let initialViewApplied = false;

function showFeedback(element, message, kind = 'info') {
  element.textContent = message;
  element.dataset.kind = kind;
  element.hidden = false;
}

function hideFeedback(element) {
  element.textContent = '';
  element.hidden = true;
  delete element.dataset.kind;
}

function setSessionView(user) {
  currentUser = user || null;
  authPanel.hidden = Boolean(currentUser);
  portalApp.hidden = !currentUser;
  if (!currentUser) {
    initialViewApplied = false;
    return;
  }
  $('#accountEmail').textContent = currentUser.email || 'Conta PULSO';
  if (!initialViewApplied) {
    initialViewApplied = true;
    if (requestedPanel) switchView(requestedPanel);
    else if (hasRequestedFlow) switchView(requestedView);
  }
}

function switchView(name) {
  $$('.portal-tab').forEach((button) => {
    const active = button.dataset.view === name;
    button.classList.toggle('active', active);
    button.setAttribute('aria-selected', String(active));
  });
  $$('.portal-view').forEach((panel) => {
    panel.hidden = panel.id !== `view-${name}`;
  });
  if (name === 'requests') void refreshRequests();
}

function messageForStatus(code, labels) {
  return labels[code] || 'Estado actualizado';
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[character]);
}

function validateWebsite(value) {
  if (!value) return true;
  try {
    return new URL(value).protocol === 'https:';
  } catch {
    return false;
  }
}

function validateFile(file) {
  if (!file) return 'Seleccione um ficheiro.';
  if (!ALLOWED_MIME_TYPES.has(file.type)) return 'Use um ficheiro PDF, JPG, PNG ou WEBP.';
  if (file.size > MAX_FILE_SIZE) return 'O ficheiro excede o limite de 10 MB.';
  return '';
}

function fileExtension(file) {
  const extensionByType = {
    'application/pdf': 'pdf',
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp'
  };
  return extensionByType[file.type];
}

async function uploadBusinessDocument({ requestId, file, documentType, replacesDocumentId = null }) {
  const validationError = validateFile(file);
  if (validationError) throw new Error(validationError);
  const safeId = crypto.randomUUID();
  const storagePath = `${currentUser.id}/${requestId}/${safeId}.${fileExtension(file)}`;
  const { error: uploadError } = await supabase.storage.from(BUCKET).upload(storagePath, file, {
    contentType: file.type,
    upsert: false
  });
  if (uploadError) throw uploadError;

  const documentRow = {
    request_id: requestId,
    user_id: currentUser.id,
    document_type: documentType,
    original_filename: file.name.slice(0, 240),
    storage_path: storagePath
  };
  if (replacesDocumentId) documentRow.replaces_document_id = replacesDocumentId;

  const { error: insertError } = await supabase.from('business_verification_documents').insert(documentRow);
  if (insertError) {
    await supabase.storage.from(BUCKET).remove([storagePath]);
    throw insertError;
  }
}

async function submitInitialDocuments(form, requestId) {
  const failures = [];
  for (const input of $$('[data-initial-document]', form)) {
    const file = input.files?.[0];
    if (!file) continue;
    try {
      await uploadBusinessDocument({
        requestId,
        file,
        documentType: input.dataset.initialDocument
      });
    } catch (error) {
      failures.push(`${DOCUMENT_LABELS[input.dataset.initialDocument]}: ${error.message}`);
    }
  }
  return failures;
}

async function handleBusinessSubmit(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const feedback = $('#businessFeedback');
  const button = $('button[type="submit"]', form);
  hideFeedback(feedback);
  if (!form.reportValidity()) return;
  if (!validateWebsite(form.elements.website.value.trim())) {
    showFeedback(feedback, 'O website deve usar um endereço HTTPS.', 'error');
    return;
  }

  button.disabled = true;
  button.textContent = 'A submeter pedido…';
  const values = new FormData(form);
  const payload = {
    user_id: currentUser.id,
    legal_name: values.get('legal_name').trim(),
    trade_name: values.get('trade_name').trim() || null,
    tax_id: values.get('tax_id').trim(),
    commercial_registration_number: values.get('commercial_registration_number').trim() || null,
    sector: values.get('sector'),
    province: values.get('province').trim(),
    municipality: values.get('municipality').trim(),
    address: values.get('address').trim(),
    website: values.get('website').trim() || null,
    institutional_email: values.get('institutional_email').trim(),
    organization_phone: values.get('organization_phone').trim(),
    representative_full_name: values.get('representative_full_name').trim(),
    representative_role: values.get('representative_role').trim(),
    representative_email: values.get('representative_email').trim(),
    representative_phone: values.get('representative_phone').trim(),
    consent_accepted: values.get('consent_accepted') === 'on'
  };

  try {
    const { data, error } = await supabase
      .from('business_verification_requests')
      .insert(payload)
      .select('id')
      .single();
    if (error) throw error;

    const uploadFailures = await submitInitialDocuments(form, data.id);
    form.reset();
    switchView('requests');
    if (uploadFailures.length) {
      showFeedback(
        $('#requestsFeedback'),
        `Pedido recebido, mas alguns documentos não foram carregados. Pode enviá-los no cartão do pedido: ${uploadFailures.join(' · ')}`,
        'error'
      );
    } else {
      showFeedback($('#requestsFeedback'), 'Pedido empresarial recebido. O estado inicial é “Em análise”; pode acompanhar o processo nesta página.', 'success');
    }
  } catch (error) {
    showFeedback(feedback, `Não foi possível submeter o pedido. ${error.message}`, 'error');
  } finally {
    button.disabled = false;
    button.innerHTML = 'Submeter pedido empresarial <span aria-hidden="true">→</span>';
  }
}

async function handlePartnershipSubmit(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const feedback = $('#partnershipFeedback');
  const button = $('button[type="submit"]', form);
  hideFeedback(feedback);
  if (!form.reportValidity()) return;
  button.disabled = true;
  button.textContent = 'A enviar pedido…';
  const values = new FormData(form);
  const payload = {
    user_id: currentUser.id,
    organization_name: values.get('organization_name').trim(),
    activity_description: values.get('activity_description').trim(),
    representative_name: values.get('representative_name').trim(),
    representative_email: values.get('representative_email').trim(),
    representative_phone: values.get('representative_phone').trim(),
    province: values.get('province').trim(),
    municipality: values.get('municipality').trim(),
    website_or_social_links: values.get('website_or_social_links').trim() || null,
    collaboration_type: values.get('collaboration_type'),
    collaboration_reason: values.get('collaboration_reason').trim(),
    consent_accepted: values.get('consent_accepted') === 'on'
  };

  try {
    const { error } = await supabase.from('partnership_requests').insert(payload);
    if (error) throw error;
    form.reset();
    switchView('requests');
    showFeedback($('#requestsFeedback'), 'Pedido de parceria recebido. Pode acompanhar o estado nesta página.', 'success');
  } catch (error) {
    showFeedback(feedback, `Não foi possível enviar o pedido. ${error.message}`, 'error');
  } finally {
    button.disabled = false;
    button.innerHTML = 'Enviar pedido de parceria <span aria-hidden="true">→</span>';
  }
}

function formatDate(value) {
  try {
    return new Intl.DateTimeFormat('pt-PT', { dateStyle: 'medium' }).format(new Date(value));
  } catch {
    return '';
  }
}

function renderStatusHistory(items) {
  if (!items.length) return '<small class="request-meta">Ainda não há alterações anteriores registadas.</small>';
  const labels = { ...BUSINESS_STATUSES, ...PARTNERSHIP_STATUSES };
  return `<div class="request-status-history"><b>Histórico do processo</b>${items.map((item) => `<div><span>${escapeHtml(item.previous_status ? labels[item.previous_status] || item.previous_status : 'Pedido recebido')} → ${escapeHtml(labels[item.new_status] || item.new_status)}</span><small>${escapeHtml(formatDate(item.changed_at))}${item.status_note ? ` · ${escapeHtml(item.status_note)}` : ''}</small></div>`).join('')}</div>`;
}

function renderBusinessCard(request, documents, history) {
  const status = messageForStatus(request.status, BUSINESS_STATUSES);
  const docs = documents.filter((document) => document.request_id === request.id);
  const latestByType = new Map();
  docs.forEach((document) => {
    const existing = latestByType.get(document.document_type);
    if (!existing || new Date(document.uploaded_at) > new Date(existing.uploaded_at)) {
      latestByType.set(document.document_type, document);
    }
  });
  const checklist = REQUIRED_DOCUMENTS.map((type) => {
    const latest = latestByType.get(type);
    const needsReplacement = latest?.status === 'replacement_requested' || latest?.status === 'rejected';
    const missing = !latest;
    const state = missing ? 'missing' : needsReplacement ? 'replacement' : 'received';
    const label = missing ? 'Pendente' : needsReplacement ? 'Precisa de substituição' : 'Registado';
    return `<div class="document-chip" data-state="${state}">${escapeHtml(DOCUMENT_LABELS[type])}<b>${label}</b></div>`;
  }).join('');

  const docRows = docs.map((document) => {
    const label = DOCUMENT_LABELS[document.document_type] || 'Documento';
    const download = document.fileUrl
      ? `<a href="${escapeHtml(document.fileUrl)}" target="_blank" rel="noopener noreferrer">Abrir ficheiro</a>`
      : '<small>Ficheiro privado</small>';
    const replaceForm = document.status === 'replacement_requested'
      ? `<form class="document-upload-form replacement-upload" data-request-id="${escapeHtml(request.id)}" data-document-type="${escapeHtml(document.document_type)}" data-replaces-document="${escapeHtml(document.id)}"><label class="field">Escolher substituição<input type="file" required accept="application/pdf,image/jpeg,image/png,image/webp"></label><span></span><button class="button button-secondary" type="submit">Enviar substituição</button></form>`
      : '';
    return `<div><div class="document-row"><div><b>${escapeHtml(label)} · ${escapeHtml(document.original_filename)}</b><small>${escapeHtml(DOCUMENT_STATUSES[document.status] || document.status)} · ${escapeHtml(formatDate(document.uploaded_at))}</small>${document.review_note ? `<small>Nota: ${escapeHtml(document.review_note)}</small>` : ''}</div>${download}</div>${replaceForm}</div>`;
  }).join('');

  const uploadForm = ['under_review', 'additional_documents_requested'].includes(request.status)
    ? `<form class="document-upload-form additional-upload" data-request-id="${escapeHtml(request.id)}"><label class="field">Tipo de documento<select name="document_type" required><option value="commercial_certificate">Certidão comercial</option><option value="tax_document">Documento de NIF</option><option value="business_license">Alvará</option><option value="representative_id">Identificação do representante</option><option value="representation_proof">Prova de representação</option><option value="additional">Documento adicional</option></select></label><label class="field">Seleccionar ficheiro<input type="file" required accept="application/pdf,image/jpeg,image/png,image/webp"></label><button class="button button-secondary" type="submit">Enviar documento</button></form>`
    : '';

  return `<article class="request-card">
    <div class="request-card-top"><div><h3>${escapeHtml(request.trade_name || request.legal_name)}</h3><div class="request-meta">Pedido empresarial · ${escapeHtml(formatDate(request.created_at))}</div></div><span class="status-badge" data-status="${escapeHtml(request.status)}">${escapeHtml(status)}</span></div>
    ${request.status_note ? `<div class="request-note">${escapeHtml(request.status_note)}</div>` : ''}
    <div class="document-checklist" aria-label="Estado dos documentos">${checklist}</div>
    ${docRows ? `<div class="document-list">${docRows}</div>` : '<p class="request-meta">Ainda não foram enviados documentos.</p>'}
    ${renderStatusHistory(history.filter((item) => item.request_id === request.id))}
    ${uploadForm}
  </article>`;
}

function renderPartnershipCard(request, history) {
  const status = messageForStatus(request.status, PARTNERSHIP_STATUSES);
  return `<article class="request-card">
    <div class="request-card-top"><div><h3>${escapeHtml(request.organization_name)}</h3><div class="request-meta">Pedido de parceria · ${escapeHtml(formatDate(request.created_at))}</div></div><span class="status-badge" data-status="${escapeHtml(request.status)}">${escapeHtml(status)}</span></div>
    ${request.status_note ? `<div class="request-note">${escapeHtml(request.status_note)}</div>` : ''}
    <div class="request-meta">${escapeHtml(request.collaboration_type)} · ${escapeHtml([request.municipality, request.province].filter(Boolean).join(', '))}</div>
    <p class="request-meta">${escapeHtml(request.activity_description)} · Motivo: ${escapeHtml(request.collaboration_reason)}</p>
    ${request.status === 'approved' ? '<a class="button button-secondary" href="./parceiro-dashboard.html">Abrir espaço Parceiro PULSO →</a>' : ''}
    ${renderStatusHistory(history.filter((item) => item.request_id === request.id))}
  </article>`;
}

function renderFutureSpaces(businessRequests, partnershipRequests) {
  const spaces = [];
  if (businessRequests.some((request) => request.status === 'verified')) {
    spaces.push('<article class="future-space" data-kind="verified"><b>Conta empresarial verificada</b><p>A aprovação resulta de revisão documental humana. As oportunidades continuam sujeitas a moderação.</p><a class="button button-secondary" href="./empresa-dashboard.html">Abrir dashboard empresarial →</a></article>');
  }
  if (partnershipRequests.some((request) => request.status === 'approved')) {
    spaces.push('<article class="future-space" data-kind="partner"><b>Parceiro PULSO · Parceria aprovada</b><p>Este estatuto não representa verificação empresarial legal. As permissões de submissão são concedidas separadamente.</p><a class="button button-secondary" href="./parceiro-dashboard.html">Abrir dashboard de parceiro →</a></article>');
  }
  if (businessRequests.some((request) => ['under_review', 'additional_documents_requested'].includes(request.status))) {
    spaces.push('<article class="future-space" data-kind="pending"><b>Pedido empresarial em análise</b><p>O estado e eventuais pedidos de documentos aparecem abaixo. O acesso empresarial permanece reservado até decisão autorizada.</p></article>');
  }
  if (partnershipRequests.some((request) => ['received', 'under_review', 'additional_information_requested'].includes(request.status))) {
    spaces.push('<article class="future-space" data-kind="pending"><b>Pedido de parceria em análise</b><p>O estatuto de parceiro só é atribuído após aprovação. Este pedido não concede verificação empresarial.</p></article>');
  }
  $('#futureSpaces').innerHTML = spaces.join('');
}

async function refreshRequests() {
  if (!currentUser || authUpdateInProgress) return;
  const feedback = $('#requestsFeedback');
  hideFeedback(feedback);
  const list = $('#requestList');
  list.innerHTML = '<div class="empty-state">A consultar os seus pedidos…</div>';
  const [businessResult, partnershipResult, documentResult, historyResult] = await Promise.all([
    supabase.from('business_verification_requests')
      .select('id,legal_name,trade_name,status,status_note,created_at')
      .eq('user_id', currentUser.id).order('created_at', { ascending: false }).limit(50),
    supabase.from('partnership_requests')
      .select('id,organization_name,activity_description,collaboration_type,collaboration_reason,province,municipality,status,status_note,created_at,submitted_at')
      .eq('user_id', currentUser.id).order('created_at', { ascending: false }).limit(50),
    supabase.from('business_verification_documents')
      .select('id,request_id,user_id,document_type,original_filename,storage_path,replaces_document_id,status,review_note,uploaded_at')
      .eq('user_id', currentUser.id).order('uploaded_at', { ascending: false }).limit(200),
    supabase.from('organizational_account_status_history')
      .select('id,request_type,request_id,user_id,previous_status,new_status,status_note,changed_at')
      .eq('user_id', currentUser.id).order('changed_at', { ascending: false }).limit(200)
  ]);

  const errors = [businessResult.error, partnershipResult.error, documentResult.error].filter(Boolean);
  if (errors.length) {
    list.innerHTML = '<div class="empty-state">Não foi possível carregar os pedidos. Tente actualizar a página.</div>';
    showFeedback(feedback, errors.map((error) => error.message).join(' · '), 'error');
    return;
  }

  const businessRequests = businessResult.data || [];
  const partnershipRequests = partnershipResult.data || [];
  const documents = documentResult.data || [];
  const history = historyResult?.data || [];
  if (historyResult?.error) console.warn('PULSO organizational status history is unavailable; apply the stage 2 migration.', historyResult.error.message);
  await Promise.all(documents.map(async (document) => {
    const { data } = await supabase.storage.from(BUCKET).createSignedUrl(document.storage_path, 120);
    document.fileUrl = data?.signedUrl || '';
  }));
  renderFutureSpaces(businessRequests, partnershipRequests);
  const cards = [
    ...businessRequests.map((request) => renderBusinessCard(request, documents, history)),
    ...partnershipRequests.map((request) => renderPartnershipCard(request, history))
  ];
  list.innerHTML = cards.length
    ? cards.join('')
    : '<div class="empty-state">Ainda não tem pedidos. Escolha “Conta empresarial” ou “Solicitar parceria” para começar.</div>';
}

async function handleDocumentUpload(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const button = $('button[type="submit"]', form);
  const requestId = form.dataset.requestId;
  const file = $('input[type="file"]', form).files?.[0];
  const documentType = form.dataset.documentType || form.elements.document_type?.value;
  const replacesDocumentId = form.dataset.replacesDocument || null;
  const validationError = validateFile(file);
  if (validationError) {
    showFeedback($('#requestsFeedback'), validationError, 'error');
    return;
  }

  button.disabled = true;
  button.textContent = 'A enviar…';
  try {
    await uploadBusinessDocument({ requestId, file, documentType, replacesDocumentId });
    showFeedback($('#requestsFeedback'), 'Documento enviado em privado. O estado do pedido será actualizado após revisão.', 'success');
    await refreshRequests();
  } catch (error) {
    showFeedback($('#requestsFeedback'), `Não foi possível enviar o documento. ${error.message}`, 'error');
    button.disabled = false;
    button.textContent = replacesDocumentId ? 'Enviar substituição' : 'Enviar documento';
  }
}

$('#loginForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const feedback = $('#loginFeedback');
  const button = $('button[type="submit"]', form);
  hideFeedback(feedback);
  if (!form.reportValidity()) return;
  button.disabled = true;
  button.textContent = 'A entrar…';
  try {
    const { error } = await supabase.auth.signInWithPassword({
      email: form.elements.email.value.trim(),
      password: form.elements.password.value
    });
    if (error) throw error;
    showFeedback(feedback, 'Sessão iniciada. Este portal permanece aberto.', 'success');
  } catch (error) {
    showFeedback(feedback, `Não foi possível iniciar sessão. ${error.message}`, 'error');
  } finally {
    button.disabled = false;
    button.innerHTML = 'Entrar sem sair deste portal <span aria-hidden="true">→</span>';
  }
});

$('#businessForm').addEventListener('submit', (event) => void handleBusinessSubmit(event));
$('#partnershipForm').addEventListener('submit', (event) => void handlePartnershipSubmit(event));
$('#signOutButton').addEventListener('click', async () => {
  const { error } = await supabase.auth.signOut();
  if (error) showFeedback($('#loginFeedback'), `Não foi possível terminar sessão. ${error.message}`, 'error');
});
$('#refreshButton').addEventListener('click', () => void refreshRequests());
document.addEventListener('click', (event) => {
  const tab = event.target.closest('[data-view]');
  if (tab) switchView(tab.dataset.view);
});
document.addEventListener('submit', (event) => {
  if (event.target.matches('.document-upload-form')) void handleDocumentUpload(event);
});

supabase.auth.onAuthStateChange((event, session) => {
  if (!['INITIAL_SESSION', 'SIGNED_IN', 'SIGNED_OUT', 'USER_UPDATED'].includes(event)) return;
  const nextUser = session?.user || null;
  if ((currentUser?.id || null) === (nextUser?.id || null) && event !== 'INITIAL_SESSION') return;
  setSessionView(nextUser);
  if (nextUser) void refreshRequests();
});

const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
if (sessionError) {
  setSessionView(null);
  showFeedback($('#loginFeedback'), `Não foi possível consultar a sessão. ${sessionError.message}`, 'error');
} else {
  setSessionView(sessionData.session?.user || null);
  if (currentUser) await refreshRequests();
}
