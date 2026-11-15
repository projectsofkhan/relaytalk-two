// pages/call-app/utils/userSync.js — reads user from shared SPA session.

import { getSession } from '/shared/supabase.js';

export async function getRelayTalkUser() {
  try {
    const session = await getSession();
    if (!session?.user) return null;
    const u = session.user;
    return {
      id: u.id,
      email: u.email || '',
      username: u.user_metadata?.username || u.email?.split('@')[0] || 'User',
      avatar_url: u.user_metadata?.avatar_url || null
    };
  } catch (e) {
    console.error('[userSync] getRelayTalkUser failed:', e);
    return null;
  }
}

export async function syncUserToDatabase(supabase, user) {
  if (!supabase || !user?.id) {
    return user ? { ...user, status: 'online' } : null;
  }
  try {
    const { data: existing } = await supabase
      .from('profiles').select('*').eq('id', user.id).maybeSingle();

    if (existing) {
      await supabase.from('profiles')
        .update({ status: 'online', last_seen: new Date().toISOString() })
        .eq('id', user.id);
      return existing;
    }

    const newProfile = {
      id: user.id,
      username: user.username,
      full_name: user.username,
      avatar_url: user.avatar_url,
      status: 'online',
      last_seen: new Date().toISOString(),
      created_at: new Date().toISOString()
    };

    const { data: created } = await supabase
      .from('profiles').insert([newProfile]).select().maybeSingle();

    return created || newProfile;
  } catch (err) {
    console.warn('[userSync] sync failed (non-fatal):', err);
    return { id: user.id, username: user.username, avatar_url: user.avatar_url, status: 'online' };
  }
}

export async function getUserFriends(supabase, userId) {
  try {
    const { data: friendships } = await supabase
      .from('friends').select('friend_id').eq('user_id', userId);
    if (!friendships?.length) return [];
    const ids = friendships.map(f => f.friend_id);
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, username, avatar_url, status, last_seen')
      .in('id', ids).order('username');
    return profiles || [];
  } catch (e) { return []; }
}

export async function updateUserStatus(supabase, userId, status) {
  if (!supabase || !userId) return;
  try {
    await supabase.from('profiles')
      .update({ status, last_seen: new Date().toISOString() })
      .eq('id', userId);
  } catch (e) {}
}