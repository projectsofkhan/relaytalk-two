// pages/call-app/utils/supabase.js — delegate to shared client.
import { initializeSupabase as initRoot, getSupabase as getRoot, getSession as getRootSession } from '../../../utils/supabase.js';

export async function initializeSupabase() {
  return initRoot();
}

export function getSupabase() {
  return getRoot();
}

export async function getSession() {
  return getRootSession();
}