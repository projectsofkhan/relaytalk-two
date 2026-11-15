// shared/supabase.js — single Supabase client, shared by both SPAs.

const SUPABASE_URL = 'https://blxtldgnssvasuinpyit.supabase.co';
const SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJseHRsZGduc3N2YXN1aW5weWl0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjcwODIxODIsImV4cCI6MjA4MjY1ODE4Mn0.Dv04IOAY76o2ccu5dzwK3fJjzo93BIoK6C2H3uWrlMw';

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