// home/home.js — App SPA entry.
import { Router, bindNavLinks } from '/shared/router.js';
import { getSession, getSupabase } from '/shared/supabase.js';

import { initDashboard }  from './views/dashboard.js';
import { initChats }      from './views/chats.js';
import { initFriends }    from './views/friends.js';
import { initProfile }    from './views/profile.js';
import { initViewFriend } from './views/view-friend.js';

// Load background utils (each wrapped in try/catch so one failure doesn't kill the app)
(async () => {
  try { await import('/utils/callHub.js'); } catch(e) { console.warn('callHub missing'); }
  try { await import('/utils/pushClient.js'); } catch(e) { console.warn('pushClient missing'); }
  try { await import('/utils/native-init.js'); } catch(e) { console.warn('native-init missing'); }
  try { await import('/utils/offline-guard.js'); } catch(e) { console.warn('offline-guard missing'); }
})();

const router = new Router({
  '/':        { template: 'tpl-dashboard',   init: initDashboard  },
  '/chats':   { template: 'tpl-chats',       init: initChats      },
  '/friends': { template: 'tpl-friends',     init: initFriends    },
  '/profile': { template: 'tpl-profile',     init: initProfile    },
  '/user':    { template: 'tpl-view-friend', init: initViewFriend }
}, {
  mount: document.getElementById('view-outlet')
});

bindNavLinks(router);

(async function boot() {
  try {
    const session = await getSession();
    if (!session) {
      window.location.replace('/#/login');
      return;
    }
    window.supabase = getSupabase();
    router.start();
  } catch (err) {
    console.error("BOOT ERROR:", err);
    document.getElementById('view-outlet').innerHTML = `
      <div style="padding: 40px; text-align: center; font-family: sans-serif;">
        <h2 style="color: red;">Boot Error</h2>
        <p>${err.message}</p>
        <p>Check if /shared/router.js and /shared/supabase.js exist.</p>
      </div>
    `;
  }
})();