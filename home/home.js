// home/home.js — app SPA entry.

import { Router, bindNavLinks } from '/shared/router.js';
import { getSession, getSupabase } from '/shared/supabase.js';

import { initDashboard }  from './views/dashboard.js';
import { initChats }      from './views/chats.js';
import { initFriends }    from './views/friends.js';
import { initProfile }    from './views/profile.js';
import { initViewFriend } from './views/view-friend.js';

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
  // Make the Supabase client globally available to ported page logic.
  window.supabase = getSupabase();
  router.start();
})();