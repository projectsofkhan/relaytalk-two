// home/views/profile.js — my profile.
// Ported from pages/home/profile/profile.js. Same features, SPA routing.

import { getSession } from '/shared/supabase.js';

const IMGBB_API_KEY = '82e49b432e2ee14921f7d0cd81ba5551';
const DOWNLOAD_PAGE_URL = '/assets/apk/';

let currentUser = null;
let currentProfile = null;
let currentShowDetails = true;
let currentBio = '';
let notificationsEnabled = false;
let currentNotifTab = 'main';
let routerRef = null;
let abortController = null;

const locallyDismissedRequestIds = new Set();
const locallyReadCallIds = new Set();

function isNativeShell() {
  return !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
}

async function persistSeenCalls(ids) {
  if (!ids || ids.length === 0 || !window.supabase || !currentUser) return;
  try {
    await window.supabase.from('calls').update({ seen: true }).in('id', ids)
      .or(`receiver_id.eq.${currentUser.id},callee_id.eq.${currentUser.id}`);
  } catch (e) {}
}

// ─────────────────────────────────────────────────────────
// DATA
// ─────────────────────────────────────────────────────────
async function loadProfile() {
  try {
    const { data: profile } = await window.supabase
      .from('profiles')
      .select('id, username, avatar_url, status, last_seen, show_message_preview, bio')
      .eq('id', currentUser.id).maybeSingle();

    currentProfile = profile || {
      id: currentUser.id,
      username: currentUser.email?.split('@')[0] || 'User',
      show_message_preview: true, bio: ''
    };
    currentShowDetails = currentProfile.show_message_preview !== false;
    renderProfile(currentProfile);
    renderBio(currentProfile.bio || '');
    setTimeout(loadUserStats, 80);
  } catch (err) {
    const fallbackUsername = currentUser?.email?.split('@')[0] || 'User';
    currentProfile = { id: currentUser.id, username: fallbackUsername, bio: '' };
    renderProfile(currentProfile);
    renderBio('');
  }
}

function getBestUsername() {
  return currentProfile?.username || currentUser?.user_metadata?.username
    || currentUser?.email?.split('@')[0] || 'User';
}

function renderAvatar(avatarUrl, username) {
  const img = document.getElementById('avatarImage');
  const initialDiv = document.getElementById('avatarInitial');
  if (!img || !initialDiv) return;
  const name = username || 'User';
  const initial = name.trim().charAt(0).toUpperCase() || '?';
  img.onload = null; img.onerror = null;

  if (!avatarUrl || !String(avatarUrl).trim()) {
    img.removeAttribute('src');
    img.style.display = 'none';
    initialDiv.style.display = 'flex';
    initialDiv.textContent = initial;
    return;
  }
  img.style.display = 'none';
  initialDiv.style.display = 'flex';
  initialDiv.textContent = initial;

  const preload = new Image();
  preload.onload = () => { img.src = avatarUrl; img.style.display = 'block'; initialDiv.style.display = 'none'; };
  preload.onerror = () => { img.removeAttribute('src'); initialDiv.style.display = 'flex'; initialDiv.textContent = initial; };
  preload.src = avatarUrl;
}

function renderProfile(profile) {
  const username = profile.username || getBestUsername();
  const nameEl = document.getElementById('displayName');
  const userEl = document.getElementById('displayUsername');
  if (nameEl) nameEl.textContent = username;
  if (userEl) userEl.textContent = `@${username.toLowerCase()}`;
  renderAvatar(profile.avatar_url, username);
}

async function loadUserStats() {
  try {
    const { count: friendsCount } = await window.supabase.from('friends')
      .select('*', { count: 'exact', head: true }).eq('user_id', currentUser.id);
    const friendsEl = document.getElementById('friendsCount');
    if (friendsEl) friendsEl.textContent = friendsCount || 0;
  } catch (e) {
    const friendsEl = document.getElementById('friendsCount');
    if (friendsEl) friendsEl.textContent = '0';
  }
}

async function loadMemberSince() {
  try {
    const el = document.getElementById('memberSince');
    if (!el) return;
    const { data } = await window.supabase.from('profiles')
      .select('created_at').eq('id', currentUser.id).maybeSingle();
    if (!data?.created_at) { el.textContent = '—'; return; }
    el.textContent = new Date(data.created_at).toLocaleDateString(undefined, { month: 'short', year: 'numeric' });
  } catch (e) {
    const el = document.getElementById('memberSince');
    if (el) el.textContent = '—';
  }
}

// ─────────────────────────────────────────────────────────
// BIO
// ─────────────────────────────────────────────────────────
function renderBio(bio) {
  currentBio = bio || '';
  const box = document.getElementById('bioBox');
  if (!box) return;
  if (currentBio.trim()) {
    box.textContent = currentBio.trim();
    box.classList.remove('empty');
  } else {
    box.innerHTML = '<span class="bio-empty">Tap the pencil to write something about you (up to 100 characters)</span>';
    box.classList.add('empty');
  }
}

function openBioEditor() {
  const modal = document.getElementById('bioEditorModal');
  const input = document.getElementById('bioInput');
  const counter = document.getElementById('bioCharCount');
  if (!modal || !input) return;
  input.value = currentBio || '';
  counter.textContent = input.value.length;
  input.oninput = () => { counter.textContent = input.value.length; };
  modal.style.display = 'flex';
  requestAnimationFrame(() => modal.classList.add('visible'));
  setTimeout(() => input.focus(), 120);
}

function closeBioEditor() {
  const modal = document.getElementById('bioEditorModal');
  if (!modal) return;
  modal.classList.remove('visible');
  setTimeout(() => modal.style.display = 'none', 200);
}

async function saveBio() {
  const input = document.getElementById('bioInput');
  if (!input) return;
  const newBio = input.value.trim();
  if (newBio.length > 100) { showToast('error', 'About must be 100 characters or less'); return; }
  try {
    const { error } = await window.supabase.from('profiles')
      .update({ bio: newBio, updated_at: new Date().toISOString() }).eq('id', currentUser.id);
    if (error) throw error;
    if (currentProfile) currentProfile.bio = newBio;
    renderBio(newBio);
    closeBioEditor();
    showToast('success', 'About updated!');
  } catch (e) { showToast('error', 'Could not save about'); }
}

// ─────────────────────────────────────────────────────────
// AVATAR
// ─────────────────────────────────────────────────────────
function openImagePicker() {
  const modal = document.getElementById('imagePickerModal');
  if (!modal) return;
  modal.style.display = 'flex';
  requestAnimationFrame(() => modal.classList.add('visible'));
}

function closeImagePicker() {
  const modal = document.getElementById('imagePickerModal');
  if (!modal) return;
  modal.classList.remove('visible');
  setTimeout(() => modal.style.display = 'none', 200);
}

function uploadFromCamera() {
  const input = document.getElementById('cameraInput');
  input.accept = 'image/*';
  input.capture = 'environment';
  input.click();
  closeImagePicker();
}

function uploadFromGallery() {
  const input = document.getElementById('galleryInput');
  input.accept = 'image/*';
  input.click();
  closeImagePicker();
}

async function compressProfileImage(file, maxSize = 1024 * 1024) {
  return new Promise((resolve) => {
    if (!file || file.size <= maxSize) return resolve(file);
    const isMobile = /Android/i.test(navigator.userAgent) || /iPhone|iPad|iPod/i.test(navigator.userAgent);
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        let w = img.width, h = img.height;
        const MAX = isMobile ? 1200 : 1600;
        if (w > h && w > MAX) { h = Math.round(h * MAX / w); w = MAX; }
        else if (h > MAX) { w = Math.round(w * MAX / h); h = MAX; }
        canvas.width = w; canvas.height = h;
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, 0, 0, w, h);
        let quality = isMobile ? 0.8 : 0.88;
        const tryCompress = () => {
          canvas.toBlob((blob) => {
            if (!blob) return resolve(file);
            if (blob.size <= maxSize || quality <= 0.4) {
              resolve(new File([blob], file.name.replace(/\.[^.]+$/, '.jpg'), { type: 'image/jpeg', lastModified: Date.now() }));
            } else { quality -= 0.1; tryCompress(); }
          }, 'image/jpeg', quality);
        };
        tryCompress();
      };
      img.onerror = () => resolve(file);
      img.src = e.target.result;
    };
    reader.onerror = () => resolve(file);
    reader.readAsDataURL(file);
  });
}

async function handleImageSelect(event) {
  const originalFile = event.target.files && event.target.files[0];
  const inputEl = event.target;
  setTimeout(() => { inputEl.value = ''; }, 100);
  if (!originalFile) return;
  if (!originalFile.type.startsWith('image/')) { showToast('error', 'Please select an image file'); return; }
  if (originalFile.size > 25 * 1024 * 1024) { showToast('error', 'Image is too large'); return; }

  const uploadLoading = document.getElementById('uploadLoading');
  if (uploadLoading) uploadLoading.style.display = 'flex';

  try {
    let processedFile;
    try { processedFile = await compressProfileImage(originalFile); }
    catch (e) { processedFile = originalFile; }

    const fileToUpload = new File([processedFile],
      (processedFile.name || 'avatar.jpg').replace(/\s+/g, '_'),
      { type: processedFile.type || 'image/jpeg', lastModified: Date.now() });

    const formData = new FormData();
    formData.append('key', IMGBB_API_KEY);
    formData.append('image', fileToUpload);
    formData.append('name', `relaytalk_avatar_${currentUser.id.slice(0, 8)}_${Date.now()}`);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 45000);

    let response;
    try {
      response = await fetch('https://api.imgbb.com/1/upload', {
        method: 'POST', body: formData, signal: controller.signal,
        headers: { 'Accept': 'application/json' }, mode: 'cors', credentials: 'omit'
      });
    } catch (fetchErr) {
      clearTimeout(timeout);
      if (fetchErr.name === 'AbortError') throw new Error('Upload timed out.');
      throw new Error('Network error.');
    }
    clearTimeout(timeout);

    if (!response.ok) throw new Error(`Server error (${response.status})`);
    const data = await response.json();
    if (!data.success || !data.data?.url) throw new Error(data.error?.message || 'Upload failed');

    const imageUrl = data.data.url;
    const { error } = await window.supabase.from('profiles')
      .update({ avatar_url: imageUrl, updated_at: new Date().toISOString() }).eq('id', currentUser.id);
    if (error) throw error;
    if (currentProfile) currentProfile.avatar_url = imageUrl;
    renderAvatar(imageUrl, getBestUsername());
    showToast('success', 'Profile photo updated!');
  } catch (err) {
    showToast('error', err.message || 'Failed to upload image');
  } finally {
    if (uploadLoading) uploadLoading.style.display = 'none';
  }
}

async function removeAvatar() {
  if (!confirm('Remove profile photo?')) return;
  const uploadLoading = document.getElementById('uploadLoading');
  if (uploadLoading) uploadLoading.style.display = 'flex';
  try {
    const { error } = await window.supabase.from('profiles')
      .update({ avatar_url: null, updated_at: new Date().toISOString() }).eq('id', currentUser.id);
    if (error) throw error;
    if (currentProfile) currentProfile.avatar_url = null;
    renderAvatar(null, getBestUsername());
    showToast('success', 'Profile photo removed');
  } catch (err) { showToast('error', 'Failed to remove photo'); }
  finally {
    if (uploadLoading) uploadLoading.style.display = 'none';
    closeImagePicker();
  }
}

// ─────────────────────────────────────────────────────────
// NOTIFICATIONS
// ─────────────────────────────────────────────────────────
async function enableNativeNotifications() {
  const Plugins = (window.Capacitor && window.Capacitor.Plugins) || {};
  const PushNotifications = Plugins.PushNotifications;
  if (!PushNotifications) { showToast('error', 'Push plugin missing.'); return false; }
  try {
    let perm = await PushNotifications.checkPermissions();
    if (perm.receive === 'prompt' || perm.receive === 'prompt-with-rationale') {
      perm = await PushNotifications.requestPermissions();
    }
    if (perm.receive !== 'granted') { showToast('error', 'Notifications blocked'); return false; }
    await PushNotifications.register();
    showToast('success', 'Notifications enabled!');
    return true;
  } catch (e) { showToast('error', 'Could not enable notifications'); return false; }
}

async function enableWebNotifications() {
  if (Notification.permission === 'granted') {
    if (window.relaytalkPush) await window.relaytalkPush.init();
    showToast('success', 'Notifications enabled');
    return true;
  }
  if (!window.relaytalkPush) { showToast('error', 'Notifications not ready.'); return false; }
  const isIOS = /iPhone|iPad|iPod/i.test(navigator.userAgent);
  const isStandalone = window.navigator.standalone === true;
  if (isIOS && !isStandalone) {
    alert('On iPhone, please tap Share → Add to Home Screen first.');
    return false;
  }
  const result = await window.relaytalkPush.request();
  if (result.success) { showToast('success', 'Notifications enabled!'); return true; }
  showToast('error', 'Could not enable: ' + (result.reason || 'denied'));
  return false;
}

async function enableNotificationsAction() {
  return isNativeShell() ? enableNativeNotifications() : enableWebNotifications();
}

async function disableNotificationsAction() {
  if (!confirm('Turn off notifications for this device?')) return;
  if (isNativeShell()) {
    try { await window.supabase.from('device_tokens').delete().eq('user_id', currentUser.id); } catch (e) {}
    showToast('success', 'Notifications turned off');
    return;
  }
  try { if (window.relaytalkPush?.unsubscribe) await window.relaytalkPush.unsubscribe(); } catch (e) {}
  try { await window.supabase.from('push_subscriptions').delete().eq('user_id', currentUser.id); } catch (e) {}
  showToast('success', 'Notifications turned off');
}

async function toggleNotifications() {
  const btn = document.getElementById('enableNotificationsBtn');
  if (!btn) return;
  if (!isNativeShell() && !('Notification' in window)) { showToast('error', 'Notifications not supported'); return; }
  btn.disabled = true;
  btn.classList.add('loading');
  try {
    if (notificationsEnabled) await disableNotificationsAction();
    else await enableNotificationsAction();
  } catch (e) { showToast('error', 'Something went wrong'); }
  finally {
    btn.disabled = false;
    btn.classList.remove('loading');
    await refreshNotificationState();
  }
}

async function refreshNotificationState() {
  const btn = document.getElementById('enableNotificationsBtn');
  const label = document.getElementById('enableBtnLabel');
  const icon = document.getElementById('enableBtnIcon');
  if (!btn || !label || !icon) return;

  if (isNativeShell()) {
    btn.classList.remove('enabled', 'denied', 'loading');
    try {
      const Plugins = (window.Capacitor && window.Capacitor.Plugins) || {};
      const PushNotifications = Plugins.PushNotifications;
      let granted = false;
      if (PushNotifications) { const p = await PushNotifications.checkPermissions(); granted = p.receive === 'granted'; }
      let hasToken = false;
      const { data } = await window.supabase.from('device_tokens').select('id').eq('user_id', currentUser.id).limit(1);
      hasToken = !!(data && data.length > 0);
      notificationsEnabled = granted && hasToken;
      if (notificationsEnabled) { btn.classList.add('enabled'); label.textContent = 'Enabled'; setBellIcon(icon, 'on'); }
      else { label.textContent = 'Enable'; setBellIcon(icon, 'off'); }
    } catch (e) { label.textContent = 'Enable'; setBellIcon(icon, 'off'); }
    return;
  }

  btn.classList.remove('enabled', 'denied', 'loading');
  const perm = ('Notification' in window) ? Notification.permission : 'unsupported';
  if (perm === 'unsupported') { btn.style.display = 'none'; return; }
  if (perm === 'denied') {
    notificationsEnabled = false;
    btn.classList.add('denied');
    label.textContent = 'Blocked';
    setBellIcon(icon, 'off');
    return;
  }

  let hasSub = false;
  try { const reg = await navigator.serviceWorker.getRegistration(); if (reg) { const sub = await reg.pushManager.getSubscription(); hasSub = !!sub; } } catch (e) {}
  let hasDbRow = false;
  try { const { data } = await window.supabase.from('push_subscriptions').select('id').eq('user_id', currentUser.id).limit(1); hasDbRow = !!(data && data.length > 0); } catch (e) {}
  notificationsEnabled = (perm === 'granted') && (hasSub || hasDbRow);

  if (notificationsEnabled) { btn.classList.add('enabled'); label.textContent = 'Enabled'; setBellIcon(icon, 'on'); }
  else { label.textContent = 'Enable'; setBellIcon(icon, 'off'); }
}

function setBellIcon(container, state) {
  if (!container) return;
  if (state === 'on') {
    container.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/><polyline points="9 12 11 14 15 10" style="stroke: currentColor; stroke-width: 2.5;"/></svg>`;
  } else {
    container.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>`;
  }
}

async function resetNotifications() {
  const btn = document.getElementById('resetNotificationsBtn');
  if (!btn) return;
  if (!confirm('Reset notifications?')) return;
  btn.disabled = true;
  btn.classList.add('loading');
  showToast('info', 'Resetting...');

  if (isNativeShell()) {
    try {
      await window.supabase.from('device_tokens').delete().eq('user_id', currentUser.id);
      await new Promise(r => setTimeout(r, 500));
      const Plugins = (window.Capacitor && window.Capacitor.Plugins) || {};
      const PushNotifications = Plugins.PushNotifications;
      if (PushNotifications) await PushNotifications.register();
      showToast('success', 'Notifications reset!');
    } catch (e) { showToast('error', 'Reset failed'); }
    finally { btn.disabled = false; btn.classList.remove('loading'); await refreshNotificationState(); }
    return;
  }

  try { if (window.relaytalkPush?.unsubscribe) await window.relaytalkPush.unsubscribe(); } catch (e) {}
  try { await window.supabase.from('push_subscriptions').delete().eq('user_id', currentUser.id); } catch (e) {}
  await new Promise(r => setTimeout(r, 700));
  try {
    if (window.relaytalkPush) {
      const result = await window.relaytalkPush.request();
      if (result.success) showToast('success', 'Notifications reset!');
      else showToast('error', 'Reset failed: ' + (result.reason || 'unknown'));
    }
  } catch (e) { showToast('error', 'Reset failed'); }
  finally { btn.disabled = false; btn.classList.remove('loading'); await refreshNotificationState(); }
}

// ─────────────────────────────────────────────────────────
// DETAILS TOGGLE
// ─────────────────────────────────────────────────────────
function showDetailsInfo() {
  const isCurrentlyOn = currentShowDetails;
  const titleEl = document.getElementById('detailsInfoTitle');
  const bodyEl = document.getElementById('detailsInfoBody');
  if (isCurrentlyOn) {
    titleEl.textContent = 'Hide Details';
    bodyEl.innerHTML = `
      <p style="margin-bottom:12px;">By turning this <strong>off</strong>, notifications will be less detailed:</p>
      <ul style="padding-left:20px; line-height:1.8;"><li>You'll only see <em>"There is a new message on RelayTalk"</em></li><li><strong>No sender name</strong></li><li><strong>No avatar</strong></li><li><strong>No message content</strong> or images</li></ul>
      <p style="margin-top:14px;color:#666;font-size:0.9rem;">Useful for privacy when your phone screen is visible to others.</p>`;
  } else {
    titleEl.textContent = 'Show Details';
    bodyEl.innerHTML = `
      <p style="margin-bottom:12px;">By turning this <strong>on</strong>, notifications will include:</p>
      <ul style="padding-left:20px; line-height:1.8;"><li>The <strong>sender's name</strong></li><li>The <strong>sender's avatar</strong></li><li>The <strong>message content</strong></li><li>A <strong>preview image</strong></li></ul>
      <p style="margin-top:14px;color:#666;font-size:0.9rem;">Recommended if you want to know who messaged.</p>`;
  }
  const modal = document.getElementById('detailsInfoModal');
  if (modal) { modal.style.display = 'flex'; requestAnimationFrame(() => modal.classList.add('visible')); }
}

function closeDetailsInfo() {
  const modal = document.getElementById('detailsInfoModal');
  if (!modal) return;
  modal.classList.remove('visible');
  setTimeout(() => modal.style.display = 'none', 200);
}

async function confirmDetailsToggle() {
  closeDetailsInfo();
  const newValue = !currentShowDetails;
  try {
    const { error } = await window.supabase.from('profiles')
      .update({ show_message_preview: newValue, updated_at: new Date().toISOString() })
      .eq('id', currentUser.id);
    if (error) throw error;
    currentShowDetails = newValue;
    if (currentProfile) currentProfile.show_message_preview = newValue;
    updateDetailsToggle();
    showToast('success', newValue ? 'Details ON' : 'Details OFF');
  } catch (e) { showToast('error', 'Could not update preference'); }
}

function updateDetailsToggle() {
  const label = document.getElementById('detailsToggleLabel');
  const toggleSwitch = document.getElementById('detailsToggleSwitch');
  const btn = document.getElementById('detailsToggleBtn');
  if (!btn || !label) return;
  if (currentShowDetails) {
    btn.classList.add('active');
    btn.classList.remove('inactive');
    label.textContent = 'Details Visible';
    if (toggleSwitch) toggleSwitch.classList.add('on');
  } else {
    btn.classList.add('inactive');
    btn.classList.remove('active');
    label.textContent = 'Details Hidden';
    if (toggleSwitch) toggleSwitch.classList.remove('on');
  }
}

// ─────────────────────────────────────────────────────────
// NOTIFICATIONS MODAL
// ─────────────────────────────────────────────────────────
function openNotifications(event) {
  if (event) event.preventDefault();
  const modal = document.getElementById('notificationsModal');
  if (modal) {
    modal.style.display = 'flex';
    requestAnimationFrame(() => modal.classList.add('visible'));
    switchNotifTab('main');
    markVisibleItemsSeen();
  }
}

function closeNotifications() {
  const modal = document.getElementById('notificationsModal');
  if (!modal) return;
  modal.classList.remove('visible');
  setTimeout(() => { modal.style.display = 'none'; }, 200);
}

function switchNotifTab(tab) {
  currentNotifTab = tab;
  const mainTab = document.getElementById('notifTabMain');
  const callsTab = document.getElementById('notifTabCalls');
  const mainContent = document.getElementById('notifMainContent');
  const callsContent = document.getElementById('notifCallsContent');
  if (!mainTab || !callsTab || !mainContent || !callsContent) return;
  if (tab === 'main') {
    mainTab.classList.add('active'); callsTab.classList.remove('active');
    mainContent.classList.add('active'); callsContent.classList.remove('active');
    loadNotifications();
  } else {
    callsTab.classList.add('active'); mainTab.classList.remove('active');
    callsContent.classList.add('active'); mainContent.classList.remove('active');
    loadCallHistory();
  }
}

async function markVisibleItemsSeen() {
  try {
    const { data: reqs } = await window.supabase.from('friend_requests').select('id')
      .eq('receiver_id', currentUser.id).eq('status', 'pending');
    if (reqs) reqs.forEach(r => locallyDismissedRequestIds.add(String(r.id)));

    const { data: calls } = await window.supabase.from('calls').select('id, seen')
      .or(`receiver_id.eq.${currentUser.id},callee_id.eq.${currentUser.id}`)
      .in('status', ['missed', 'rejected']);
    if (calls) {
      const unseen = [];
      calls.forEach(c => { locallyReadCallIds.add(String(c.id)); if (c.seen !== true) unseen.push(c.id); });
      if (unseen.length > 0) await persistSeenCalls(unseen);
    }
    await updateNavBadge();
  } catch (e) {}
}

async function loadNotifications() {
  const container = document.getElementById('notificationsList');
  if (!container) return;
  try {
    const { data: notifications } = await window.supabase.from('friend_requests')
      .select('id, sender_id, created_at')
      .eq('receiver_id', currentUser.id).eq('status', 'pending')
      .order('created_at', { ascending: false });

    const visible = (notifications || []).filter(n => !locallyDismissedRequestIds.has(String(n.id)));
    if (visible.length === 0) { showEmptyNotifications(container); return; }

    const senderIds = visible.map(n => n.sender_id);
    const { data: profiles } = await window.supabase.from('profiles')
      .select('id, username, avatar_url').in('id', senderIds);
    const profileMap = {};
    (profiles || []).forEach(p => profileMap[p.id] = p);

    let html = '';
    visible.forEach(notification => {
      const timeAgo = timeAgoShort(notification.created_at);
      const sender = profileMap[notification.sender_id] || { username: 'Unknown' };
      const senderName = sender.username;
      const initial = senderName.charAt(0).toUpperCase();
      const avatarSrc = sender.avatar_url || '';
      html += `
        <div class="notification-item" data-request-id="${notification.id}">
          <div class="notification-avatar">
            ${avatarSrc ? `<img src="${avatarSrc}" alt="${escapeHtml(senderName)}">` : `<span>${escapeHtml(initial)}</span>`}
          </div>
          <div class="notification-content">
            <div class="notification-text">
              <strong>${escapeHtml(senderName)}</strong> wants to be friends
              <span class="notification-time">${timeAgo}</span>
            </div>
          </div>
          <div class="notification-actions">
            <button class="btn-small btn-success" onclick="acceptFriendRequest('${notification.id}', '${notification.sender_id}', '${escapeAttr(senderName)}', this)" aria-label="Accept"><i class="fas fa-check"></i></button>
            <button class="btn-small btn-danger" onclick="declineFriendRequest('${notification.id}', this)" aria-label="Decline"><i class="fas fa-times"></i></button>
          </div>
        </div>`;
    });
    container.innerHTML = html;
  } catch (e) { showEmptyNotifications(container); }
}

function showEmptyNotifications(container) {
  container.innerHTML = `<div class="empty-state"><div class="empty-icon"><i class="fas fa-bell-slash"></i></div><p class="empty-desc">No notifications yet</p></div>`;
}

async function loadCallHistory() {
  const container = document.getElementById('callHistoryList');
  if (!container) return;
  try {
    const { data: calls } = await window.supabase.from('calls').select('*')
      .or(`caller_id.eq.${currentUser.id},receiver_id.eq.${currentUser.id},callee_id.eq.${currentUser.id}`)
      .order('created_at', { ascending: false }).limit(50);

    if (!calls || calls.length === 0) {
      container.innerHTML = `<div class="empty-state"><div class="empty-icon"><i class="fas fa-phone-slash"></i></div><h3 class="empty-title">No calls yet</h3><p class="empty-desc">Your call history will appear here</p></div>`;
      return;
    }

    const userIds = new Set();
    calls.forEach(call => {
      if (call.caller_id !== currentUser.id) userIds.add(call.caller_id);
      if (call.receiver_id !== currentUser.id) userIds.add(call.receiver_id);
      if (call.callee_id && call.callee_id !== currentUser.id) userIds.add(call.callee_id);
    });

    let profileMap = {};
    if (userIds.size > 0) {
      const { data: profiles } = await window.supabase.from('profiles')
        .select('id, username, avatar_url').in('id', [...userIds]);
      (profiles || []).forEach(p => profileMap[p.id] = p);
    }

    let html = '';
    let lastDate = '';
    calls.forEach(call => {
      const callDate = new Date(call.created_at).toLocaleDateString();
      if (callDate !== lastDate) { lastDate = callDate; html += `<div class="call-history-date">${callDate}</div>`; }
      const isOutgoing = call.caller_id === currentUser.id;
      const otherUserId = isOutgoing ? (call.receiver_id || call.callee_id) : (call.caller_id || call.callee_id);
      const otherUser = profileMap[otherUserId] || { username: 'Unknown' };

      let metaIcon = 'fa-arrow-down', metaClass = 'meta-incoming', metaText = 'Incoming', isMissed = false;
      if (isOutgoing) { metaIcon = 'fa-arrow-up'; metaClass = 'meta-outgoing'; metaText = 'Outgoing'; }
      if (['missed', 'cancelled', 'rejected'].includes(call.status)) {
        if (!isOutgoing || call.status === 'rejected') { metaIcon = 'fa-phone-slash'; metaClass = 'meta-missed'; metaText = 'Missed'; isMissed = true; }
      } else if (call.status === 'ringing' && !isOutgoing) { metaIcon = 'fa-phone-slash'; metaClass = 'meta-missed'; metaText = 'Missed'; isMissed = true; }

      const time = new Date(call.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      const initial = otherUser.username ? otherUser.username.charAt(0).toUpperCase() : '?';
      const avatarSrc = otherUser.avatar_url || '';

      let tagHTML = '';
      const callIdStr = String(call.id);
      const isUnseen = !isOutgoing && isMissed && !locallyReadCallIds.has(callIdStr) && call.seen !== true;
      if (isUnseen) tagHTML = `<span class="call-tag tag-new">New</span>`;
      else if (isMissed) tagHTML = `<span class="call-tag tag-missed">Missed</span>`;

      html += `
        <div class="call-history-item ${isUnseen ? 'has-tag' : ''}">
          <div class="call-history-avatar">
            ${avatarSrc ? `<img src="${avatarSrc}" alt="${escapeHtml(otherUser.username || '')}">` : `<span>${escapeHtml(initial)}</span>`}
          </div>
          <div class="call-history-info">
            <div class="call-history-name ${isMissed ? 'missed' : ''}">
              ${escapeHtml(otherUser.username || 'Unknown')} ${tagHTML}
            </div>
            <div class="call-history-meta">
              <i class="fas ${metaIcon} ${metaClass}"></i>
              <span>${metaText}</span><span class="dot">•</span><span>${time}</span>
            </div>
          </div>
        </div>`;
    });
    container.innerHTML = html;

    const unseenCallIds = calls.filter(c => c.caller_id !== currentUser.id && c.seen !== true).map(c => c.id);
    calls.forEach(c => locallyReadCallIds.add(String(c.id)));
    if (unseenCallIds.length > 0) { await persistSeenCalls(unseenCallIds); await updateNavBadge(); }
  } catch (e) {
    container.innerHTML = `<div class="empty-state"><p>Could not load call history</p></div>`;
  }
}

async function acceptFriendRequest(requestId, senderId, senderName, button) {
  if (button) { button.innerHTML = '...'; button.disabled = true; }
  locallyDismissedRequestIds.add(String(requestId));
  const itemEl = document.querySelector(`.notification-item[data-request-id="${requestId}"]`);
  if (itemEl) { itemEl.classList.add('removing'); setTimeout(() => itemEl.remove(), 280); }
  try {
    await window.supabase.from('friend_requests').update({ status: 'accepted', updated_at: new Date().toISOString() }).eq('id', requestId);
    await window.supabase.from('friends').insert({ user_id: currentUser.id, friend_id: senderId, created_at: new Date().toISOString() });
    await window.supabase.from('friends').insert({ user_id: senderId, friend_id: currentUser.id, created_at: new Date().toISOString() });
    showToast('success', `You are now friends with ${senderName}!`);
    setTimeout(() => { loadNotifications(); loadUserStats(); updateNavBadge(); }, 320);
  } catch (e) {
    showToast('error', 'Could not accept request');
    locallyDismissedRequestIds.delete(String(requestId));
    loadNotifications();
  }
}

async function declineFriendRequest(requestId, button) {
  if (button) { button.innerHTML = '...'; button.disabled = true; }
  locallyDismissedRequestIds.add(String(requestId));
  const itemEl = document.querySelector(`.notification-item[data-request-id="${requestId}"]`);
  if (itemEl) { itemEl.classList.add('removing'); setTimeout(() => itemEl.remove(), 280); }
  try {
    await window.supabase.from('friend_requests').update({ status: 'rejected', updated_at: new Date().toISOString() }).eq('id', requestId);
    showToast('info', 'Request declined');
    setTimeout(() => { loadNotifications(); updateNavBadge(); }, 320);
  } catch (e) {
    locallyDismissedRequestIds.delete(String(requestId));
    loadNotifications();
  }
}

async function updateNavBadge() {
  try {
    const { data: friendReqs } = await window.supabase.from('friend_requests').select('id')
      .eq('receiver_id', currentUser.id).eq('status', 'pending');
    const pendingCount = (friendReqs || []).filter(r => !locallyDismissedRequestIds.has(String(r.id))).length;

    const { data: calls } = await window.supabase.from('calls').select('id, seen, status')
      .or(`receiver_id.eq.${currentUser.id},callee_id.eq.${currentUser.id}`)
      .in('status', ['missed', 'rejected']).order('created_at', { ascending: false }).limit(50);
    const unseenCount = (calls || []).filter(c => c.seen !== true && !locallyReadCallIds.has(String(c.id))).length;

    const total = pendingCount + unseenCount;
    const navBadge = document.getElementById('notificationBadge');
    if (navBadge) {
      if (total > 0) { navBadge.textContent = total > 9 ? '9+' : total; navBadge.style.display = 'flex'; }
      else navBadge.style.display = 'none';
    }
    const mainTabBadge = document.getElementById('mainTabBadge');
    if (mainTabBadge) {
      if (pendingCount > 0) { mainTabBadge.textContent = pendingCount > 9 ? '9+' : pendingCount; mainTabBadge.style.display = 'inline-flex'; }
      else mainTabBadge.style.display = 'none';
    }
    const callsTabBadge = document.getElementById('callsTabBadge');
    if (callsTabBadge) {
      if (unseenCount > 0) { callsTabBadge.textContent = unseenCount > 9 ? '9+' : unseenCount; callsTabBadge.style.display = 'inline-flex'; }
      else callsTabBadge.style.display = 'none';
    }
  } catch (e) {}
}

// ─────────────────────────────────────────────────────────
// GUIDE MODAL
// ─────────────────────────────────────────────────────────
const GUIDE_CONTENT = {
  home: { icon: 'fa-home', color: '#0B84F3', bg: '#e7f3fe', title: 'Home', sub: 'Your starting point',
    items: [
      { icon: 'fa-search', title: 'Find friends', desc: 'Tap "Find friends" on the home page and search by username.' },
      { icon: 'fa-bell', title: 'Notifications & Alerts', desc: 'Tap the bell icon to see friend requests and call logs.' },
      { icon: 'fa-comments', title: 'Open a chat', desc: 'Tap any friend in the list to open a chat.' },
      { icon: 'fa-user-plus', title: 'Accept requests', desc: 'When someone accepts your request, they appear in your friends list automatically.' },
      { icon: 'fa-circle', title: 'Online status', desc: 'A green dot means they are online right now.' }
    ] },
  chats: { icon: 'fa-comment-dots', color: '#16a34a', bg: '#e6f4ea', title: 'Chats', sub: 'Talk, react, share',
    items: [
      { icon: 'fa-paper-plane', title: 'Send a message', desc: 'Type in the box and tap the send button.' },
      { icon: 'fa-image', title: 'Share images', desc: 'Tap the paperclip icon, choose Camera or Gallery.' },
      { icon: 'fa-palette', title: 'Color your message', desc: 'Type "/" in the message box → pick a color.' },
      { icon: 'fa-face-smile', title: 'React to messages', desc: 'Long-press any message → pick an emoji.' },
      { icon: 'fa-copy', title: 'Copy a message', desc: 'Long-press → tap the copy icon.' },
      { icon: 'fa-pen', title: 'Edit your message', desc: 'Long-press your own message → tap the pencil.' },
      { icon: 'fa-trash', title: 'Delete your message', desc: 'Long-press your own message → tap trash.' },
      { icon: 'fa-phone', title: 'Voice / video call', desc: 'Tap the phone icon in the top-right corner.' }
    ] },
  friends: { icon: 'fa-user-friends', color: '#d97706', bg: '#fef7e0', title: 'Friends', sub: "Everyone you're connected with",
    items: [
      { icon: 'fa-magnifying-glass', title: 'Search friends', desc: 'Use the search bar to filter your friends by username.' },
      { icon: 'fa-comment-dots', title: 'Message button', desc: 'Tap the message icon to open a chat.' },
      { icon: 'fa-phone', title: 'Call button', desc: 'Tap the phone icon to start a call.' },
      { icon: 'fa-id-badge', title: 'Open profile', desc: "Tap a friend's avatar to view their profile." }
    ] },
  profile: { icon: 'fa-user', color: '#7c3aed', bg: '#f3e8fd', title: 'Your Profile', sub: 'Everything about you',
    items: [
      { icon: 'fa-camera', title: 'Change your photo', desc: 'Tap the camera badge on your avatar.' },
      { icon: 'fa-pen', title: 'Edit your About', desc: 'Tap the pencil next to "About / Biography".' },
      { icon: 'fa-bell', title: 'Enable notifications', desc: 'Turn on push notifications so you get alerts.' },
      { icon: 'fa-rotate', title: 'Reset notifications', desc: 'Notifications not working? Reset them.' },
      { icon: 'fa-eye', title: 'Show / Hide details', desc: 'Control whether notifications show details.' },
      { icon: 'fa-download', title: 'Download App', desc: 'Get the latest signed APK.' },
      { icon: 'fa-mobile-screen', title: 'Download as PWA', desc: 'Install RelayTalk on your home screen.' },
      { icon: 'fa-right-from-bracket', title: 'Log Out', desc: 'Sign out of this device.' }
    ] },
  view: { icon: 'fa-id-badge', color: '#dc2626', bg: '#fee2e2', title: "Friend's Profile", sub: 'Viewing someone else',
    items: [
      { icon: 'fa-circle', title: 'Live status', desc: 'See whether your friend is online.' },
      { icon: 'fa-comment-dots', title: 'Message', desc: 'Tap "Message" to open a chat.' },
      { icon: 'fa-phone', title: 'Call', desc: "Tap 'Call' to start an audio call." },
      { icon: 'fa-quote-left', title: 'Biography', desc: 'Read their bio if they\'ve written one.' },
      { icon: 'fa-clock', title: 'Friends since', desc: 'See the date you two became friends.' }
    ] },
  others: { icon: 'fa-ellipsis-h', color: '#52525b', bg: '#f4f4f5', title: 'Others', sub: 'Tips and extras',
    items: [
      { icon: 'fa-mobile-screen', title: 'Install as an app', desc: 'Add RelayTalk to your home screen.' },
      { icon: 'fa-shield-halved', title: 'Privacy', desc: 'Choose whether notifications show details.' },
      { icon: 'fa-moon', title: 'Calls when offline', desc: 'You can call anyone anytime.' },
      { icon: 'fa-circle-info', title: 'Need help?', desc: 'Come back to this guide any time.' }
    ] }
};

function openGuide() {
  const modal = document.getElementById('guideModal');
  if (!modal) return;
  modal.style.display = 'flex';
  requestAnimationFrame(() => modal.classList.add('visible'));
  showGuideSection('home', document.querySelector('.guide-nav-btn[data-guide="home"]'));
}

function closeGuide() {
  const modal = document.getElementById('guideModal');
  if (!modal) return;
  modal.classList.remove('visible');
  setTimeout(() => { modal.style.display = 'none'; }, 220);
}

function showGuideSection(section, btn) {
  const data = GUIDE_CONTENT[section];
  if (!data) return;
  document.querySelectorAll('.guide-nav-btn').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');
  else { const fallback = document.querySelector(`.guide-nav-btn[data-guide="${section}"]`); if (fallback) fallback.classList.add('active'); }
  const body = document.getElementById('guideBody');
  if (!body) return;
  body.innerHTML = `
    <div class="guide-section">
      <div class="guide-section-head">
        <span class="guide-section-icon" style="background:${data.bg};color:${data.color};"><i class="fas ${data.icon}"></i></span>
        <div><h4 class="guide-section-title">${data.title}</h4><div class="guide-section-sub">${data.sub}</div></div>
      </div>
      <div class="guide-items">
        ${data.items.map(it => `<div class="guide-item"><span class="guide-item-icon"><i class="fas ${it.icon}"></i></span><div class="guide-item-text"><div class="guide-item-title">${it.title}</div><p class="guide-item-desc">${it.desc}</p></div></div>`).join('')}
      </div>
    </div>`;
}

// ─────────────────────────────────────────────────────────
// DOWNLOAD + PWA + LOGOUT + NAV
// ─────────────────────────────────────────────────────────
function openDownloadPage() { window.location.href = DOWNLOAD_PAGE_URL; }

function openPwaModal() {
  const modal = document.getElementById('pwaModal');
  if (!modal) return;
  modal.style.display = 'flex';
  requestAnimationFrame(() => modal.classList.add('visible'));
}

function closePwaModal() {
  const modal = document.getElementById('pwaModal');
  if (!modal) return;
  modal.classList.remove('visible');
  setTimeout(() => modal.style.display = 'none', 200);
}

async function disableAllNotifications() {
  if (isNativeShell()) {
    try {
      const Plugins = (window.Capacitor && window.Capacitor.Plugins) || {};
      const PushNotifications = Plugins.PushNotifications;
      if (PushNotifications) {
        if (typeof PushNotifications.removeAllListeners === 'function') await PushNotifications.removeAllListeners();
        if (typeof PushNotifications.unregister === 'function') try { await PushNotifications.unregister(); } catch (e) {}
      }
    } catch (e) {}
    try { await window.supabase.from('device_tokens').delete().eq('user_id', currentUser.id); } catch (e) {}
    return;
  }
  try { if (window.relaytalkPush?.unsubscribe) await window.relaytalkPush.unsubscribe(); } catch (e) {}
  try {
    if ('serviceWorker' in navigator) {
      const reg = await navigator.serviceWorker.getRegistration();
      if (reg) { const sub = await reg.pushManager.getSubscription(); if (sub) try { await sub.unsubscribe(); } catch (e) {} }
    }
  } catch (e) {}
  try {
    await window.supabase.from('push_subscriptions').delete().eq('user_id', currentUser.id);
    await window.supabase.from('device_tokens').delete().eq('user_id', currentUser.id);
  } catch (e) {}
}

async function logoutFromDevice() {
  if (!confirm('Logout from RelayTalk?\n\nThis will turn off notifications, clear cached data, and sign you out.')) return;
  const uploadEl = document.getElementById('uploadLoading');
  if (uploadEl) uploadEl.style.display = 'flex';
  const uploadText = document.querySelector('#uploadLoading .loading-text');
  if (uploadText) uploadText.textContent = 'Logging out...';

  try {
    await disableAllNotifications();
    try {
      if ('serviceWorker' in navigator) {
        const regs = await navigator.serviceWorker.getRegistrations();
        for (const r of regs) try { await r.unregister(); } catch (e) {}
      }
    } catch (e) {}
    try { localStorage.clear(); } catch (e) {}
    try { sessionStorage.clear(); } catch (e) {}
    try {
      document.cookie.split(";").forEach(function (c) {
        document.cookie = c.replace(/^ +/, "").replace(/=.*/, "=;expires=" + new Date().toUTCString() + ";path=/");
      });
    } catch (e) {}
    try {
      if ('caches' in window) {
        const names = await caches.keys();
        await Promise.all(names.map(n => caches.delete(n)));
      }
    } catch (e) {}
    if (window.supabase) try { await window.supabase.auth.signOut(); } catch (e) {}
  } catch (e) {}
  window.location.replace('/#/login');
}

// ─────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────
function timeAgoShort(dateStr) {
  const now = new Date(), past = new Date(dateStr);
  const diffMins = Math.floor((now - past) / 60000);
  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays === 1) return 'yesterday';
  if (diffDays < 7) return `${diffDays}d ago`;
  return past.toLocaleDateString();
}
function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}
function escapeAttr(str) { return escapeHtml(str); }

function showToast(type, message) {
  const container = document.getElementById('toastContainer');
  if (!container) return;
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  const icon = type === 'success' ? 'check-circle' : type === 'error' ? 'exclamation-circle' : 'info-circle';
  toast.innerHTML = `<i class="fas fa-${icon}"></i><span>${message}</span>`;
  container.appendChild(toast);
  requestAnimationFrame(() => toast.classList.add('show'));
  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 320);
  }, 2800);
}

// ─────────────────────────────────────────────────────────
// INIT
// ─────────────────────────────────────────────────────────
export async function initProfile({ router }) {
  routerRef = router;
  abortController = new AbortController();
  const sig = abortController.signal;

  // Reset state
  currentProfile = null;
  currentShowDetails = true;
  currentBio = '';
  currentNotifTab = 'main';
  notificationsEnabled = false;
  locallyDismissedRequestIds.clear();
  locallyReadCallIds.clear();

  const GLOBALS = {
    openBioEditor, closeBioEditor, saveBio,
    openImagePicker, closeModal: closeImagePicker,
    uploadFromCamera, uploadFromGallery, handleImageSelect, removeAvatar,
    toggleNotifications, resetNotifications,
    toggleDetails: showDetailsInfo, closeDetailsInfo, confirmDetailsToggle,
    openNotifications, closeNotifications, switchNotifTab,
    acceptFriendRequest, declineFriendRequest,
    openGuide, closeGuide, showGuideSection,
    openDownloadPage, openPwaModal, closePwaModal,
    logoutFromDevice,
    goToHome: () => routerRef.navigate('/'),
    goToFriends: () => routerRef.navigate('/friends')
  };
  Object.keys(GLOBALS).forEach(k => { window[k] = GLOBALS[k]; });

  try {
    const session = await getSession();
    if (!session?.user) {
      window.location.replace('/#/login');
      return () => {};
    }
    currentUser = session.user;

    const loadingIndicator = document.getElementById('loadingIndicator');
    if (loadingIndicator) loadingIndicator.style.display = 'flex';

    // Load profile + a small artificial delay for smooth UI
    await Promise.all([loadProfile(), new Promise(r => setTimeout(r, 400))]);
    if (loadingIndicator) loadingIndicator.style.display = 'none';

    await refreshNotificationState();
    updateDetailsToggle();
    loadMemberSince();
    updateNavBadge();

    // Visibility refresh
    const onVisible = () => {
      if (document.visibilityState === 'visible') updateNavBadge();
    };
    document.addEventListener('visibilitychange', onVisible, { signal: sig });

    return () => {
      try { abortController.abort(); } catch (e) {}
      document.body.style.overflow = '';
      ['imagePreviewOverlay', 'imageViewerOverlay', 'editModalOverlay', 'emojiPickerOverlay'].forEach(id => {
        const el = document.getElementById(id); if (el) el.remove();
      });
      Object.keys(GLOBALS).forEach(k => { try { delete window[k]; } catch (_) { window[k] = undefined; } });
      currentUser = null;
      currentProfile = null;
      routerRef = null;
      abortController = null;
    };
  } catch (err) {
    console.error('[profile] init error:', err);
    showToast('error', 'Failed to load profile');
    return () => {};
  }
}