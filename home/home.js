// home/home.js — app SPA entry.

import { Router, bindNavLinks } from '/shared/router.js';
import { getSession, getSupabase } from '/shared/supabase.js';

import { initDashboard }  from './views/dashboard.js';
import { initChats }      from './views/chats.js';
import { initFriends }    from './views/friends.js';
import { initProfile }    from './views/profile.js';
import { initViewFriend } from './views/view-friend.js';

// Load global utilities (single instance each, they handle their own presence/realtime)
import '/utils/callHub.js';
import '/utils/offline-guard.js';

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
  const session = await getSession();
  if (!session) {
    window.location.replace('/#/login');
    return;
  }
  window.supabase = getSupabase();
  router.start();
})();