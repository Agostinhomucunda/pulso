import { createClient } from '@supabase/supabase-js';
import webpush from 'web-push';

type NotificationType = 'opportunity_digest' | 'admin_broadcast';
type WebPushClient = {
  setVapidDetails(subject: string, publicKey: string, privateKey: string): void;
  sendNotification(
    subscription: { endpoint: string; keys: { p256dh: string; auth: string } },
    payload: string,
    options: { TTL: number; urgency: 'normal'; topic: string },
  ): Promise<{ statusCode?: number }>;
};

type StoredEvent = {
  event_key: string;
  notification_type: NotificationType;
  created_by: string;
  title: string;
  message: string;
  target_url: string;
  opportunity_count: number;
  status: 'pending' | 'processing' | 'completed';
};

type PushSubscriptionRow = {
  id: string;
  user_id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
};

const EXPECTED_ORIGIN = 'https://agostinhomucunda.github.io';
const APP_BASE_PATH = '/pulso/';
const APP_ORIGIN = EXPECTED_ORIGIN;
const MAX_OPPORTUNITY_IDS = 1000;
const PAGE_SIZE = 500;
const WEB_PUSH_TTL_SECONDS = 3 * 24 * 60 * 60;
const webPush = webpush as unknown as WebPushClient;

const headers = {
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'no-store',
  'access-control-allow-origin': EXPECTED_ORIGIN,
  'access-control-allow-headers': 'authorization, apikey, x-client-info, content-type',
  'access-control-allow-methods': 'POST, OPTIONS',
};

function jsonResponse(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), { status, headers });
}

function isUuid(value: unknown): value is string {
  return typeof value === 'string'
    && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function isAllowedPushEndpoint(value: string): boolean {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password || url.port) return false;
    const host = url.hostname.toLowerCase();
    return host === 'fcm.googleapis.com'
      || host === 'web.push.apple.com'
      || host === 'push.services.mozilla.com'
      || host.endsWith('.push.services.mozilla.com')
      || host === 'notify.windows.com'
      || host.endsWith('.notify.windows.com');
  } catch {
    return false;
  }
}

function eventTarget(type: NotificationType): string {
  const page = type === 'opportunity_digest' ? 'opportunities' : 'notifications';
  return `${APP_BASE_PATH}dashboard.html#${page}`;
}

function buildMessage(count: number): { title: string; message: string } {
  if (count === 1) {
    return {
      title: 'Nova oportunidade no PULSO',
      message: 'Foi publicada 1 nova oportunidade. Toca para ver agora.',
    };
  }
  return {
    title: 'Novas oportunidades no PULSO',
    message: `Foram adicionadas ${count} novas oportunidades. Toca para ver agora.`,
  };
}

async function requireAdmin(request: Request, serviceClient: ReturnType<typeof createClient>) {
  const authorization = request.headers.get('authorization') || '';
  const accessToken = authorization.toLowerCase().startsWith('bearer ')
    ? authorization.slice(7).trim()
    : authorization.trim();
  if (!accessToken) return { userId: null, error: jsonResponse(401, { error: 'Inicia sessão com uma conta de administrador.' }) };

  const { data: authResult, error: authError } = await serviceClient.auth.getUser(accessToken);
  if (authError || !authResult.user) {
    return { userId: null, error: jsonResponse(401, { error: 'Sessão inválida ou expirada.' }) };
  }
  const { data: adminRow, error: adminError } = await serviceClient.from('admin_users')
    .select('user_id').eq('user_id', authResult.user.id).maybeSingle();
  if (adminError || !adminRow) {
    return { userId: null, error: jsonResponse(403, { error: 'Apenas administradores PULSO podem enviar estas notificações.' }) };
  }
  return { userId: authResult.user.id, error: null };
}

async function getOrCreateEvent(
  db: ReturnType<typeof createClient>,
  candidate: Omit<StoredEvent, 'status'>,
): Promise<{ event: StoredEvent | null; duplicate: boolean; error: string | null }> {
  const { data: existing, error: readError } = await db.from('push_notification_events')
    .select('event_key,notification_type,created_by,title,message,target_url,opportunity_count,status')
    .eq('event_key', candidate.event_key).maybeSingle();
  if (readError) return { event: null, duplicate: false, error: 'Não foi possível consultar o registo de envios.' };

  if (existing) {
    const matches = existing.created_by === candidate.created_by
      && existing.notification_type === candidate.notification_type
      && existing.title === candidate.title
      && existing.message === candidate.message
      && existing.target_url === candidate.target_url
      && Number(existing.opportunity_count) === candidate.opportunity_count;
    if (!matches) return { event: null, duplicate: false, error: 'A chave deste envio já foi usada para outro conteúdo.' };
    if (existing.status === 'completed' || existing.status === 'processing') {
      return { event: existing as StoredEvent, duplicate: true, error: null };
    }
    const { data: claimed, error: updateError } = await db.from('push_notification_events')
      .update({ status: 'processing' }).eq('event_key', candidate.event_key).eq('status', 'pending')
      .select('event_key,notification_type,created_by,title,message,target_url,opportunity_count,status').maybeSingle();
    if (updateError) return { event: null, duplicate: false, error: 'Não foi possível retomar o envio pendente.' };
    if (!claimed) return { event: existing as StoredEvent, duplicate: true, error: null };
    return { event: claimed as StoredEvent, duplicate: false, error: null };
  }

  const { data: inserted, error: insertError } = await db.from('push_notification_events')
    .insert({ ...candidate, status: 'processing' })
    .select('event_key,notification_type,created_by,title,message,target_url,opportunity_count,status')
    .single();
  if (!insertError && inserted) return { event: inserted as StoredEvent, duplicate: false, error: null };

  // Um segundo pedido idêntico pode ter criado o evento entre a leitura e a inserção.
  if (insertError?.code === '23505') {
    return await getOrCreateEvent(db, candidate);
  }
  return { event: null, duplicate: false, error: 'Não foi possível registar este envio.' };
}

async function allProfileIds(db: ReturnType<typeof createClient>): Promise<string[]> {
  const ids: string[] = [];
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const { data, error } = await db.from('profiles').select('id')
      .order('id', { ascending: true }).range(offset, offset + PAGE_SIZE - 1);
    if (error) throw new Error('Não foi possível carregar os utilizadores do PULSO.');
    const page = data || [];
    ids.push(...page.map((row: { id: string }) => row.id));
    if (page.length < PAGE_SIZE) break;
  }
  return ids;
}

async function persistInboxNotifications(
  db: ReturnType<typeof createClient>,
  event: StoredEvent,
  userIds: string[],
): Promise<void> {
  const alreadyStored = new Set<string>();
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const { data, error } = await db.from('notifications').select('user_id')
      .eq('event_key', event.event_key).order('user_id', { ascending: true })
      .range(offset, offset + PAGE_SIZE - 1);
    if (error) throw new Error('Não foi possível verificar as notificações já guardadas.');
    const page = data || [];
    page.forEach((row: { user_id: string }) => alreadyStored.add(row.user_id));
    if (page.length < PAGE_SIZE) break;
  }

  const missing = userIds.filter((userId) => !alreadyStored.has(userId));
  for (let offset = 0; offset < missing.length; offset += PAGE_SIZE) {
    const rows = missing.slice(offset, offset + PAGE_SIZE).map((user_id) => ({
      user_id,
      title: event.title,
      message: event.message,
      notification_type: event.notification_type,
      target_url: event.target_url,
      event_key: event.event_key,
    }));
    const { error } = await db.from('notifications').insert(rows);
    if (error && error.code !== '23505') throw new Error('Não foi possível guardar as notificações na caixa dos utilizadores.');
  }
}

async function allPushSubscriptions(db: ReturnType<typeof createClient>): Promise<PushSubscriptionRow[]> {
  const subscriptions: PushSubscriptionRow[] = [];
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const { data, error } = await db.from('push_subscriptions')
      .select('id,user_id,endpoint,p256dh,auth').order('id', { ascending: true })
      .range(offset, offset + PAGE_SIZE - 1);
    if (error) throw new Error('Não foi possível carregar os dispositivos inscritos.');
    const page = (data || []) as PushSubscriptionRow[];
    subscriptions.push(...page);
    if (page.length < PAGE_SIZE) break;
  }
  return subscriptions;
}

async function sendPushes(
  db: ReturnType<typeof createClient>,
  event: StoredEvent,
  subscriptions: PushSubscriptionRow[],
): Promise<{ delivered: number; failed: number; skipped: number; configured: boolean }> {
  if (!subscriptions.length) return { delivered: 0, failed: 0, skipped: 0, configured: true };

  const publicKey = Deno.env.get('VAPID_PUBLIC_KEY') || '';
  const privateKey = Deno.env.get('VAPID_PRIVATE_KEY') || '';
  const subject = Deno.env.get('VAPID_SUBJECT') || 'mailto:pulsobussines@gmail.com';
  if (!publicKey || !privateKey) {
    return { delivered: 0, failed: 0, skipped: subscriptions.length, configured: false };
  }

  try {
    webPush.setVapidDetails(subject, publicKey, privateKey);
  } catch (error) {
    console.error('PULSO Web Push VAPID configuration is invalid', error);
    return { delivered: 0, failed: 0, skipped: subscriptions.length, configured: false };
  }

  const payload = JSON.stringify({
    title: event.title,
    body: event.message,
    url: event.target_url,
    icon: `${APP_BASE_PATH}assets/pwa-icon-192-v2.png`,
    badge: `${APP_BASE_PATH}assets/pwa-icon-192-v2.png`,
    tag: `pulso-${event.event_key.replaceAll('-', '')}`,
  });
  const valid = subscriptions.filter((row) => isAllowedPushEndpoint(row.endpoint));
  const invalid = subscriptions.filter((row) => !isAllowedPushEndpoint(row.endpoint));
  if (invalid.length) {
    await Promise.all(invalid.map((row) => db.from('push_subscriptions').delete().eq('id', row.id)));
  }
  let delivered = 0;
  let failed = 0;
  let skipped = invalid.length;
  let nextIndex = 0;

  const worker = async () => {
    while (nextIndex < valid.length) {
      const row = valid[nextIndex++];
      try {
        const result = await webPush.sendNotification(
          { endpoint: row.endpoint, keys: { p256dh: row.p256dh, auth: row.auth } },
          payload,
          {
            TTL: WEB_PUSH_TTL_SECONDS,
            urgency: 'normal',
            topic: event.event_key.replaceAll('-', ''),
          },
        );
        if (Number(result.statusCode) >= 200 && Number(result.statusCode) < 300) {
          delivered += 1;
        } else if (result.statusCode === 404 || result.statusCode === 410) {
          await db.from('push_subscriptions').delete().eq('id', row.id);
          skipped += 1;
        } else {
          failed += 1;
        }
      } catch (error) {
        const statusCode = Number((error as { statusCode?: number })?.statusCode || 0);
        if (statusCode === 404 || statusCode === 410) {
          await db.from('push_subscriptions').delete().eq('id', row.id);
          skipped += 1;
        } else {
          failed += 1;
          console.warn('PULSO Web Push delivery failed', statusCode || 'network error');
        }
      }
    }
  };

  await Promise.all(Array.from({ length: Math.min(12, valid.length) }, () => worker()));
  return { delivered, failed, skipped, configured: true };
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
  if (request.method !== 'POST') return jsonResponse(405, { error: 'Método não permitido.' });
  const origin = request.headers.get('origin');
  if (origin && origin !== EXPECTED_ORIGIN) return jsonResponse(403, { error: 'Origem não autorizada.' });

  const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
  if (!supabaseUrl || !serviceRoleKey) return jsonResponse(503, { error: 'Configuração server-side Supabase incompleta.' });
  const db = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const admin = await requireAdmin(request, db);
  if (admin.error || !admin.userId) return admin.error || jsonResponse(401, { error: 'Sessão inválida.' });

  let input: Record<string, unknown>;
  try {
    const text = await request.text();
    if (text.length > 80_000) return jsonResponse(413, { error: 'O pedido excede o limite permitido.' });
    input = JSON.parse(text);
  } catch {
    return jsonResponse(400, { error: 'O corpo do pedido não contém JSON válido.' });
  }

  const eventKey = input.event_key;
  if (!isUuid(eventKey)) return jsonResponse(400, { error: 'A chave do envio é inválida.' });

  let notificationType: NotificationType;
  let title: string;
  let message: string;
  let count = 0;
  if (input.action === 'opportunity_digest') {
    notificationType = 'opportunity_digest';
    const suppliedIds = Array.isArray(input.opportunity_ids)
      ? [...new Set(input.opportunity_ids.filter(isUuid))]
      : [];
    if (!suppliedIds.length || suppliedIds.length > MAX_OPPORTUNITY_IDS
        || suppliedIds.length !== (input.opportunity_ids as unknown[]).length) {
      return jsonResponse(400, { error: `Indica entre 1 e ${MAX_OPPORTUNITY_IDS} oportunidades válidas.` });
    }
    const confirmedIds = new Set<string>();
    for (let offset = 0; offset < suppliedIds.length; offset += 100) {
      const pageIds = suppliedIds.slice(offset, offset + 100);
      const { data, error } = await db.from('opportunities').select('id')
        .in('id', pageIds).eq('status', 'published').eq('verification_status', 'verified');
      if (error) return jsonResponse(500, { error: 'Não foi possível confirmar as oportunidades publicadas.' });
      (data || []).forEach((row: { id: string }) => confirmedIds.add(row.id));
    }
    if (confirmedIds.size !== suppliedIds.length) {
      return jsonResponse(400, { error: 'Uma ou mais oportunidades não estão publicadas e verificadas.' });
    }
    count = suppliedIds.length;
    const copy = buildMessage(count);
    title = copy.title;
    message = copy.message;
  } else if (input.action === 'admin_broadcast') {
    notificationType = 'admin_broadcast';
    title = typeof input.title === 'string' ? input.title.trim() : '';
    message = typeof input.message === 'string' ? input.message.trim() : '';
    if (!title || title.length > 90 || !message || message.length > 500) {
      return jsonResponse(400, { error: 'O título deve ter até 90 caracteres e a mensagem até 500.' });
    }
  } else {
    return jsonResponse(400, { error: 'Tipo de notificação não suportado.' });
  }

  const targetUrl = eventTarget(notificationType);
  const candidate = {
    event_key: eventKey,
    notification_type: notificationType,
    created_by: admin.userId,
    title,
    message,
    target_url: targetUrl,
    opportunity_count: count,
  };
  const eventResult = await getOrCreateEvent(db, candidate);
  if (eventResult.error || !eventResult.event) {
    return jsonResponse(409, { error: eventResult.error || 'Não foi possível registar o envio.' });
  }
  if (eventResult.duplicate) {
    return jsonResponse(200, { ok: true, duplicate: true, notification_type: notificationType });
  }

  let pushDeliveryStarted = false;
  try {
    const userIds = await allProfileIds(db);
    await persistInboxNotifications(db, eventResult.event, userIds);
    const subscriptions = await allPushSubscriptions(db);
    pushDeliveryStarted = true;
    const delivery = await sendPushes(db, eventResult.event, subscriptions);
    const { error: completeError } = await db.from('push_notification_events').update({
      status: 'completed',
      recipients_count: userIds.length,
      push_delivered_count: delivery.delivered,
      completed_at: new Date().toISOString(),
    }).eq('event_key', eventKey);
    if (completeError) throw new Error('O envio foi processado, mas o registo final não ficou concluído.');

    return jsonResponse(200, {
      ok: true,
      notification_type: notificationType,
      recipients: userIds.length,
      push_delivered: delivery.delivered,
      push_failed: delivery.failed,
      push_skipped: delivery.skipped,
      push_configured: delivery.configured,
      opportunity_count: count,
    });
  } catch (error) {
    console.error('PULSO notification dispatch failed', error);
    // Se a entrega Push já começou, não repetir automaticamente um envio cujo
    // resultado externo possa ser parcial; isso poderia duplicar o aviso no telefone.
    if (!pushDeliveryStarted) {
      await db.from('push_notification_events').update({ status: 'pending' }).eq('event_key', eventKey);
    }
    return jsonResponse(500, { error: error instanceof Error ? error.message : 'Não foi possível processar as notificações.' });
  }
});
