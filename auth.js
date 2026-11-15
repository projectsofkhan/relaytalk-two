// auth.js — auth SPA entry. Welcome / login / signup views.

import { Router, bindNavLinks } from '/shared/router.js';
import { getSession, getSupabase } from '/shared/supabase.js';

const INTERNAL_EMAIL_DOMAIN = 'luster.test';

const EYE_OPEN_SVG = `
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
    <circle cx="12" cy="12" r="3"/>
  </svg>
`;
const EYE_OFF_SVG = `
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/>
    <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/>
    <path d="M14.12 14.12a3 3 0 1 1-4.24-4.24"/>
    <line x1="1" y1="1" x2="23" y2="23"/>
  </svg>
`;

const router = new Router({
  '/':       { template: 'tpl-welcome', init: initWelcome },
  '/login':  { template: 'tpl-login',   init: initLogin   },
  '/signup': { template: 'tpl-signup',  init: initSignup  }
}, {
  mount: document.getElementById('view-outlet')
});

bindNavLinks(router);

// ─────────────────────────────────────────────────────────────
// Welcome
// ─────────────────────────────────────────────────────────────
async function initWelcome() {
  const session = await getSession();
  if (session) {
    window.location.replace('/home/');
    return;
  }
}

// ─────────────────────────────────────────────────────────────
// Login
// ─────────────────────────────────────────────────────────────
async function initLogin() {
  const root = document.querySelector('.login-view');
  if (!root) return () => {};

  const sb = getSupabase();

  try {
    const { data } = await sb.auth.getSession();
    if (data?.session) {
      window.location.replace('/home/');
      return () => {};
    }
  } catch (err) {
    console.warn('[login] session check failed', err);
  }

  const form        = root.querySelector('#loginForm');
  const submitBtn   = root.querySelector('#loginBtn');
  const userEl      = root.querySelector('#loginUsername');
  const passEl      = root.querySelector('#loginPassword');
  const overlay     = root.querySelector('#loadingOverlay');
  const successEl   = root.querySelector('#successMessage');

  const showErr = (id, msg) => {
    const el = root.querySelector('#' + id);
    if (!el) return;
    el.textContent = msg;
    el.style.display = 'block';
    el.parentElement?.classList.add('shake');
    setTimeout(() => el.parentElement?.classList.remove('shake'), 500);
  };
  const hideErr = (id) => {
    const el = root.querySelector('#' + id);
    if (el) el.style.display = 'none';
  };

  const validateForm = () => {
    let ok = true;
    const user = userEl?.value.trim() || '';
    const pass = passEl?.value || '';

    if (!user)                { showErr('usernameError', 'Please enter username'); ok = false; }
    else if (user.length < 3) { showErr('usernameError', 'Username must be at least 3 characters'); ok = false; }
    else hideErr('usernameError');

    if (!pass)                { showErr('passwordError', 'Please enter password'); ok = false; }
    else if (pass.length < 6) { showErr('passwordError', 'Password must be at least 6 characters'); ok = false; }
    else hideErr('passwordError');

    return ok;
  };

  const togglePassword = () => {
    const btn = root.querySelector('#passwordToggle');
    if (!passEl || !btn) return;
    const hidden = passEl.type === 'password';
    passEl.type = hidden ? 'text' : 'password';
    btn.innerHTML = hidden ? EYE_OFF_SVG : EYE_OPEN_SVG;
  };

  let redirectTimer = null;

  const showSuccess = (title, subtitle, animated) => {
    if (overlay) overlay.style.display = 'none';
    if (!successEl) return;
    successEl.style.display = 'block';
    successEl.innerHTML = `
      <div class="success-block">
        <svg class="success-icon-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="10"/>
          <polyline points="8 12 11 15 16 9"/>
        </svg>
        <h3>${title}</h3>
        <p>${subtitle}</p>
        ${animated ? '<div class="progress-track"><div class="progress-fill"></div></div>' : ''}
      </div>
    `;
  };

  const onSubmit = async (e) => {
    e.preventDefault();
    if (!validateForm()) return;

    const username = userEl.value.trim();
    const password = passEl.value;

    const originalText = submitBtn.textContent;
    submitBtn.textContent = 'Logging in...';
    submitBtn.disabled = true;
    if (overlay) overlay.style.display = 'flex';

    try {
      const email = `${username}@${INTERNAL_EMAIL_DOMAIN}`;
      const { data, error } = await sb.auth.signInWithPassword({ email, password });

      if (error) {
        if (overlay) overlay.style.display = 'none';
        submitBtn.textContent = originalText;
        submitBtn.disabled = false;

        if (error.message.includes('Invalid login credentials')) {
          showErr('passwordError', 'Invalid username or password');
        } else {
          showErr('passwordError', 'Login failed. Please try again.');
        }
        return;
      }

      showSuccess('Login Successful', 'Redirecting to home page...', true);
      console.log('✅ Login successful, user:', data?.user?.email);

      redirectTimer = setTimeout(() => {
        window.location.replace('/home/');
      }, 1500);
    } catch (err) {
      console.error('Login handler error:', err);
      if (overlay) overlay.style.display = 'none';
      submitBtn.textContent = originalText;
      submitBtn.disabled = false;
      showErr('passwordError', 'Something went wrong. Please try again.');
    }
  };

  const onRootClick = (e) => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    if (btn.getAttribute('data-action') === 'toggle-password') togglePassword();
  };

  form.addEventListener('submit', onSubmit);
  root.addEventListener('click', onRootClick);
  userEl?.addEventListener('input', () => { if (userEl.value.trim()) hideErr('usernameError'); });
  passEl?.addEventListener('input', () => { if (passEl.value) hideErr('passwordError'); });

  setTimeout(() => userEl?.focus(), 300);

  return () => {
    form.removeEventListener('submit', onSubmit);
    root.removeEventListener('click', onRootClick);
    if (redirectTimer) clearTimeout(redirectTimer);
  };
}

// ─────────────────────────────────────────────────────────────
// Signup
// ─────────────────────────────────────────────────────────────
async function initSignup() {
  const root = document.querySelector('.signup-view');
  if (!root) return () => {};

  const sb = getSupabase();

  try {
    const { data } = await sb.auth.getSession();
    if (data?.session) {
      window.location.replace('/home/');
      return () => {};
    }
  } catch (err) {
    console.warn('[signup] session check failed', err);
  }

  const form       = root.querySelector('#signupForm');
  const submitBtn  = root.querySelector('#submitBtn');
  const userEl     = root.querySelector('#username');
  const passEl     = root.querySelector('#password');
  const confirmEl  = root.querySelector('#confirmPassword');
  const termsEl    = root.querySelector('#terms');
  const successEl  = root.querySelector('#successContainer');

  const showErr = (id, msg) => {
    const el = root.querySelector('#' + id);
    if (el) { el.textContent = msg; el.style.display = 'block'; }
  };
  const hideErr = (id) => {
    const el = root.querySelector('#' + id);
    if (el) el.style.display = 'none';
  };

  const validateUsername = (v) => {
    if (v.length < 3)  { showErr('usernameError', 'Username must be at least 3 characters'); return false; }
    if (v.length > 20) { showErr('usernameError', 'Username must be less than 20 characters'); return false; }
    if (!/^[a-zA-Z0-9_.]+$/.test(v)) {
      showErr('usernameError', 'Only letters, numbers, underscore, and dot allowed');
      return false;
    }
    hideErr('usernameError');
    return true;
  };
  const validatePassword = (v) => {
    if (v.length < 6) { showErr('passwordError', 'Password must be at least 6 characters'); return false; }
    hideErr('passwordError');
    return true;
  };
  const validateConfirm = (p, c) => {
    if (p !== c) { showErr('confirmError', 'Passwords do not match'); return false; }
    hideErr('confirmError');
    return true;
  };

  const openModal = (id) => {
    const m = root.querySelector('#' + id);
    if (!m) return;
    m.style.display = 'flex';
    requestAnimationFrame(() => m.classList.add('visible'));
  };
  const closeAllModals = () => {
    ['termsModal', 'privacyModal'].forEach((id) => {
      const m = root.querySelector('#' + id);
      if (!m) return;
      m.classList.remove('visible');
      setTimeout(() => { m.style.display = 'none'; }, 200);
    });
  };

  const togglePassword = () => {
    const btn = root.querySelector('.password-toggle');
    if (!passEl || !btn) return;
    const hidden = passEl.type === 'password';
    passEl.type = hidden ? 'text' : 'password';
    btn.innerHTML = hidden ? EYE_OFF_SVG : EYE_OPEN_SVG;
  };

  const onRootClick = (e) => {
    const actionBtn = e.target.closest('[data-action]');
    if (actionBtn) {
      const action = actionBtn.getAttribute('data-action');
      if (action === 'show-terms')      openModal('termsModal');
      else if (action === 'show-privacy') openModal('privacyModal');
      else if (action === 'close-modal')  closeAllModals();
      else if (action === 'toggle-password') togglePassword();
      return;
    }
    if (e.target.classList && e.target.classList.contains('modal-overlay')) closeAllModals();
  };

  const onKeydown = (e) => { if (e.key === 'Escape') closeAllModals(); };

  let progressInterval = null;

  const showSuccessAndRedirect = (username, autoLoggedIn) => {
    if (form) form.style.display = 'none';
    if (!successEl) return;
    successEl.style.display = 'block';

    const message = autoLoggedIn
      ? `Welcome to RelayTalk, <strong>${username}</strong>!<br>Redirecting to home page…`
      : `Account created, <strong>${username}</strong>!<br>Please log in with your credentials.`;

    successEl.innerHTML = `
      <div class="success-icon">
        <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="10"/>
          <polyline points="8 12 11 15 16 9"/>
        </svg>
      </div>
      <h2>${autoLoggedIn ? 'Account Created' : 'Almost Done'}</h2>
      <p>${message}</p>
      <div style="background: var(--bg-sub); padding: 14px 16px; border-radius: 12px; margin: 18px 0; border: 1px solid var(--border-soft); text-align: left;">
        <p style="color: var(--text-2); font-size: 0.85rem; margin-bottom: 6px;">Remember your password securely</p>
        <p style="color: var(--primary); font-size: 0.88rem; font-weight: 500; margin: 0;">
          Username: <strong>${username}</strong><br>
          <span style="color: var(--text-2); font-weight: 400;">We cannot recover passwords if forgotten</span>
        </p>
      </div>
      <div class="progress-bar">
        <div class="progress-fill" id="progressFill"></div>
      </div>
    `;

    let progress = 0;
    const bar = root.querySelector('#progressFill');
    progressInterval = setInterval(() => {
      progress += 2;
      if (bar) bar.style.width = progress + '%';
      if (progress >= 100) {
        clearInterval(progressInterval);
        progressInterval = null;
        window.location.replace(autoLoggedIn ? '/home/' : '/#/login');
      }
    }, 30);
  };

  const onSubmit = async (e) => {
    e.preventDefault();

    const username = userEl.value.trim();
    const password = passEl.value;
    const confirm  = confirmEl.value;

    const okU = validateUsername(username);
    const okP = validatePassword(password);
    const okC = validateConfirm(password, confirm);
    if (!okU || !okP || !okC) return;

    if (!termsEl || !termsEl.checked) {
      showErr('termsError', 'Please agree to Terms & Conditions to continue');
      const wrap = termsEl?.closest('.terms-checkbox');
      if (wrap) {
        wrap.classList.add('shake');
        setTimeout(() => wrap.classList.remove('shake'), 500);
      }
      return;
    }
    hideErr('termsError');

    const originalText = submitBtn.textContent;
    submitBtn.textContent = 'Creating account...';
    submitBtn.disabled = true;

    try {
      if (!sb?.auth) throw new Error('Authentication service not available');
      const internalEmail = `${username}@${INTERNAL_EMAIL_DOMAIN}`;

      const { data: authData, error: authError } = await sb.auth.signUp({
        email: internalEmail,
        password,
        options: { data: { username, full_name: username } }
      });

      if (authError) {
        console.error('Auth error:', authError);
        if (authError.message.includes('already registered')) {
          showErr('usernameError', 'Username already taken');
        } else {
          throw authError;
        }
        submitBtn.textContent = originalText;
        submitBtn.disabled = false;
        return;
      }

      console.log('✅ Auth created, user ID:', authData.user?.id);

      const { error: signInError } = await sb.auth.signInWithPassword({
        email: internalEmail,
        password
      });

      if (signInError) {
        console.warn('Auto-login failed:', signInError);
        showSuccessAndRedirect(username, false);
      } else {
        console.log('✅ Auto-login successful');
        showSuccessAndRedirect(username, true);
      }
    } catch (err) {
      console.error('Signup error:', err);

      const msg = err?.message || '';
      if (msg.includes('already registered') || msg.includes('already exists')) {
        showErr('usernameError', 'Username already taken. Please choose another.');
      } else if (msg.includes('password')) {
        showErr('passwordError', 'Password too weak. Try a stronger one.');
      } else if (!msg.includes('duplicate key')) {
        showErr('passwordError', 'Something went wrong. Please try again.');
      }

      submitBtn.textContent = originalText;
      submitBtn.disabled = false;
    }
  };

  form.addEventListener('submit', onSubmit);
  root.addEventListener('click', onRootClick);
  document.addEventListener('keydown', onKeydown);

  userEl?.addEventListener('input', () => validateUsername(userEl.value.trim()));
  passEl?.addEventListener('input', () => validatePassword(passEl.value));
  confirmEl?.addEventListener('input', () => validateConfirm(passEl?.value || '', confirmEl.value));
  termsEl?.addEventListener('change', () => { if (termsEl.checked) hideErr('termsError'); });

  return () => {
    form.removeEventListener('submit', onSubmit);
    root.removeEventListener('click', onRootClick);
    document.removeEventListener('keydown', onKeydown);
    if (progressInterval) { clearInterval(progressInterval); progressInterval = null; }
  };
}

router.start();