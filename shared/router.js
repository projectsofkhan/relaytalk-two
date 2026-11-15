// shared/router.js — minimal hash router for <template>-based SPAs.
// Views live as <template id="tpl-..."> blocks in the shell.
// Each route points to a template ID and an init() function.

export class Router {
  constructor(routes, options = {}) {
    this.routes = routes;
    this.mountEl = options.mount || document.getElementById('view-outlet');
    this.current = null;
    this.currentPath = null;
    this.cleanup = null;
    this.onBeforeNavigate = options.onBeforeNavigate || null;
    this.onAfterNavigate = options.onAfterNavigate || null;

    if (!this.mountEl) {
      throw new Error('[Router] mount element not found. Pass options.mount or add <main id="view-outlet">.');
    }
  }

  parseHash() {
    const raw = window.location.hash.slice(1) || '/';
    const [path, query] = raw.split('?');
    return {
      path: path || '/',
      params: new URLSearchParams(query || '')
    };
  }

  async resolve() {
    const { path, params } = this.parseHash();
    const route = this.routes[path] || this.routes['/'];

    if (!route) {
      console.warn('[Router] No route for', path);
      return;
    }

    // Same view, no re-render
    if (this.currentPath === path && this.current === route) return;

    // Cleanup previous view (realtime unsubs, listeners, etc.)
    if (typeof this.cleanup === 'function') {
      try { this.cleanup(); } catch (err) { console.error('[Router] cleanup error', err); }
    }
    this.cleanup = null;

    if (this.onBeforeNavigate) this.onBeforeNavigate(route, path);

    // Find template
    const template = document.getElementById(route.template);
    if (!template) {
      console.error('[Router] Template not found:', route.template);
      return;
    }

    // Swap DOM
    this.mountEl.innerHTML = '';
    this.mountEl.appendChild(template.content.cloneNode(true));

    this.current = route;
    this.currentPath = path;
    window.scrollTo({ top: 0, behavior: 'instant' });

    // Run init
    if (typeof route.init === 'function') {
      try {
        const cleanup = await route.init({ params, router: this, path });
        if (typeof cleanup === 'function') this.cleanup = cleanup;
      } catch (err) {
        console.error('[Router] init error for', path, err);
      }
    }

    if (this.onAfterNavigate) this.onAfterNavigate(route, path);
  }

  navigate(path) {
    const target = '#' + path.replace(/^#/, '');
    if (window.location.hash === target) {
      return this.resolve(); // force refresh same route
    }
    window.location.hash = target;
  }

  back() { window.history.back(); }

  refresh() {
    this.current = null;
    this.currentPath = null;
    return this.resolve();
  }

  start() {
    window.addEventListener('hashchange', () => this.resolve());
    return this.resolve();
  }
}

// Convenience: wire any [data-nav] element to the router.
export function bindNavLinks(router) {
  document.addEventListener('click', (e) => {
    const el = e.target.closest('[data-nav]');
    if (!el) return;
    e.preventDefault();
    router.navigate(el.getAttribute('data-nav'));
  });
}