import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from './supabase-config.js';

const BUSINESS_ACTIVE = 'verified';
const PARTNER_ACTIVE = 'approved';
const TERMINAL_STATES = new Set(['rejected', 'suspended']);

export function createPULSOClient() {
  return Promise.resolve(createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY));
}

async function latestRequest(supabase, table, userId, columns) {
  const { data, error } = await supabase
    .from(table)
    .select(columns)
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(10);
  if (error) throw error;
  return data?.[0] || null;
}

export async function resolvePULSODestination(supabase, user, preferredWorkspace = null) {
  if (!user?.id) return './index.html';

  const [business, partnership] = await Promise.all([
    latestRequest(supabase, 'business_verification_requests', user.id, 'id,status,created_at'),
    latestRequest(supabase, 'partnership_requests', user.id, 'id,status,created_at')
  ]);

  if (preferredWorkspace === 'business' && business?.status === BUSINESS_ACTIVE) return './empresa-dashboard.html';
  if (preferredWorkspace === 'partner' && partnership?.status === PARTNER_ACTIVE) return './parceiro-dashboard.html';

  const { data: admin, error: adminError } = await supabase
    .from('admin_users')
    .select('user_id')
    .eq('user_id', user.id)
    .maybeSingle();
  if (!adminError && admin) return './dashboard.html';
  if (business?.status === BUSINESS_ACTIVE) return './empresa-dashboard.html';
  if (partnership?.status === PARTNER_ACTIVE) return './parceiro-dashboard.html';
  if (business && TERMINAL_STATES.has(business.status)) return './organization-account-status.html?type=business';
  if (partnership && TERMINAL_STATES.has(partnership.status)) return './organization-account-status.html?type=partnership';
  if (business || partnership) return `./empresas-parceiros.html?view=requests&flow=${business ? 'business' : 'partnership'}`;
  return './dashboard.html';
}
