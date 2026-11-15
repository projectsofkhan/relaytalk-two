// shared/supabase.js — single Supabase client, shared by both SPAs.

const SUPABASE_URL = 'https://kponqaktavkrchebmiwr.supabase.co';
const SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imtwb25xYWt0YXZrcmNoZWJtaXdyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODkyOTUzMTMsImV4cCI6MjEwNDg3MTMxM30.nkoiFez4G3-CzKvatQ9xZL4FpnZa9Qixcr64Sh8ytDE';

let client = null;

export function getSupabase() {
  if (client) return client;

  if (!window.supabase || typeof window.supabase.createClient !== 'function') {
    throw new Error(
      '[supabase] window.supabase not found — the <script src=".../@supabase/supabase-js@2"> tag must load before this module runs.'
    );
  }

  client = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      storage: window.localStorage
    }
  });

  return client;
}

export async function getSession() {
  try {
    const sb = getSupabase();
    const { data, error } = await sb.auth.getSession();
    if (error) throw error;
    return data?.session || null;
  } catch (err) {
    console.error('[supabase] getSession failed', err);
    return null;
  }
}

export async function requireSession(redirectTo = '/#/login') {
  const session = await getSession();
  if (!session) {
    window.location.replace(redirectTo);
    return null;
  }
  return session;
}