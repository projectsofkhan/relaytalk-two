// shared/router.js — hash router. Fast cross-fades.

export class Router {
  constructor(routes, options = {}) {
    this.routes = routes;
    this.mountEl = options.mount || document.getElementById('view-outlet');
    this.current = null;
    this.currentPath = null;
    this.cleanup = null;
    this.onBeforeNavigate = options.onBeforeNavigate || null;
    this.onAfterNavigate = options.onAfterNavigate || null;
    this.transitionDuration = options.transitionDuration ?? 100;
    this._swapping = false;

    if (!this.mountEl) {
      throw new Error('[Router] mount element not found. Pass options.mount or add <main id="view-outlet">.');
    }
  }

  parseHash() {
    const raw = window.location.hash.slice(1) || '/';
    const [path, query] = raw.split('?');
    return { path: path || '/', params: new URLSearchParams(query || '') };
  }

  async resolve() {
    if (this._swapping) return;

    const { path, params } = this.parseHash();
    const route = this.routes[path] || this.routes['/'];
    if (!route) { console.warn('[Router] No route for', path); return; }
    if (this.currentPath === path && this.current === route) return;

    this._swapping = true;
    try {
      if (typeof this.cleanup === 'function') {
        try { this.cleanup(); } catch (err) { console.error('[Router] cleanup error', err); }
      }
      this.cleanup = null;
      if (this.onBeforeNavigate) this.onBeforeNavigate(route, path);

      const template = document.getElementById(route.template);
      if (!template) { console.error('[Router] Template not found:', route.template); return; }

      const dur = this.transitionDuration;
      const hasContent = this.mountEl.childElementCount > 0;

      if (hasContent && dur > 0) {
        this.mountEl.style.transition = `opacity ${dur}ms cubic-bezier(0.4, 0, 1, 1)`;
        this.mountEl.style.opacity = '0';
        await new Promise(r => setTimeout(r, dur));
      }

      this.mountEl.innerHTML = '';
      this.mountEl.appendChild(template.content.cloneNode(true));
      this.current = route;
      this.currentPath = path;
      window.scrollTo({ top: 0, behavior: 'instant' });

      if (dur > 0) {
        this.mountEl.style.transition = 'none';
        this.mountEl.style.opacity = '0';
        void this.mountEl.offsetHeight;
        requestAnimationFrame(() => {
          this.mountEl.style.transition = `opacity ${Math.round(dur * 1.3)}ms cubic-bezier(0, 0, 0.2, 1)`;
          this.mountEl.style.opacity = '1';
        });
      } else {
        this.mountEl.style.opacity = '1';
      }

      if (typeof route.init === 'function') {
        try {
          const cleanup = await route.init({ params, router: this, path });
          if (typeof cleanup === 'function') this.cleanup = cleanup;
        } catch (err) { console.error('[Router] init error for', path, err); }
      }

      if (this.onAfterNavigate) this.onAfterNavigate(route, path);
    } finally {
      this._swapping = false;
    }
  }

  navigate(path) {
    const target = '#' + path.replace(/^#/, '');
    if (window.location.hash === target) return this.resolve();
    window.location.hash = target;
  }

  back() { window.history.back(); }
  refresh() { this.current = null; this.currentPath = null; return this.resolve(); }
  start() {
    window.addEventListener('hashchange', () => this.resolve());
    return this.resolve();
  }
}

export function bindNavLinks(router) {
  document.addEventListener('click', (e) => {
    const el = e.target.closest('[data-nav]');
    if (!el) return;
    e.preventDefault();
    router.navigate(el.getAttribute('data-nav'));
  });
}