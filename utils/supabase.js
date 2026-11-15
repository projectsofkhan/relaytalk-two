// utils/supabase.js — adapter over shared client.
// Prevents a second client being created with a legacy storageKey.

let fallbackClient = null;

const SUPABASE_URL = 'https://kponqaktavkrchebmiwr.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imtwb25xYWt0YXZrcmNoZWJtaXdyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODkyOTUzMTMsImV4cCI6MjEwNDg3MTMxM30.nkoiFez4G3-CzKvatQ9xZL4FpnZa9Qixcr64Sh8ytDE';

export async function initializeSupabase() {
  // Prefer the shared SPA client so we share one auth session
  try {
    const shared = await import('/shared/supabase.js');
    const client = shared.getSupabase();
    if (client) return client;
  } catch (e) {
    // shared not available (e.g. opened in isolated window without shell) — fall back
  }

  if (fallbackClient) return fallbackClient;

  if (window.supabase?.createClient) {
    fallbackClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        storage: window.localStorage
      }
    });
    window.supabase = fallbackClient;
    return fallbackClient;
  }

  try {
    const { createClient } = await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.38.4/+esm');
    fallbackClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        storage: window.localStorage
      }
    });
    window.supabase = fallbackClient;
    return fallbackClient;
  } catch (err) {
    console.error('[supabase] adapter: all init paths failed', err);
    throw err;
  }
}

export function getSupabase() {
  if (window.supabase) return window.supabase;
  return fallbackClient;
}

export async function getSession() {
  const sb = await initializeSupabase();
  if (!sb?.auth) return null;
  const { data } = await sb.auth.getSession();
  return data?.session || null;
}