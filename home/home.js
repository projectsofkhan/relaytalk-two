// home/home.js — bulletproof boot script

(async function() {
  const outlet = document.getElementById('view-outlet');
  
  try {
    const { Router, bindNavLinks } = await import('/shared/router.js');
    const { getSession, getSupabase } = await import('/shared/supabase.js');
    
    // 1. Load views safely (one missing file won't kill the app)
    const views = {};
    const viewFiles = ['dashboard', 'chats', 'friends', 'profile', 'view-friend'];
    
    for (const v of viewFiles) {
      try {
        views[v] = await import(`./views/${v}.js`);
        console.log(`✅ View loaded: ${v}`);
      } catch (e) {
        console.error(`❌ View FAILED: ${v}`, e);
      }
    }
    
    // 2. Load background utils safely
    ['callHub', 'pushClient', 'offline-guard', 'native-init'].forEach(async (u) => {
      try { 
        await import(`/utils/${u}.js`); 
      } catch (e) { 
        console.warn(`⚠️ Util FAILED: ${u}`); 
      }
    });
    
    // 3. Setup Router
    const router = new Router({
      '/':        { template: 'tpl-dashboard',   init: views.dashboard?.initDashboard || (()=>()=>{}) },
      '/chats':   { template: 'tpl-chats',       init: views.chats?.initChats || (()=>()=>{}) },
      '/friends': { template: 'tpl-friends',     init: views.friends?.initFriends || (()=>()=>{}) },
      '/profile': { template: 'tpl-profile',     init: views.profile?.initProfile || (()=>()=>{}) },
      '/user':    { template: 'tpl-view-friend', init: views['view-friend']?.initViewFriend || (()=>()=>{}) }
    }, { mount: outlet });
    
    bindNavLinks(router);
    
    // 4. Boot
    const session = await getSession();
    if (!session) {
      window.location.replace('/#/login');
      return;
    }
    
    window.supabase = getSupabase();
    router.start();
    
  } catch (err) {
    // 🚨 IF ANYTHING FAILS, SHOW IT ON SCREEN
    console.error('FATAL BOOT ERROR:', err);
    if (outlet) {
      outlet.innerHTML = `
        <div style="padding: 40px 20px; text-align: center; font-family: sans-serif; background: #fff; min-height: 100vh;">
          <h2 style="color: #dc2626; margin-bottom: 16px;">App Failed to Start</h2>
          <p style="color: #333; margin-bottom: 24px; font-size: 15px; font-weight: bold;">${err.message}</p>
          <pre style="background: #f4f4f5; padding: 16px; border-radius: 8px; font-size: 12px; text-align: left; overflow-x: auto; color: #666; white-space: pre-wrap;">${err.stack || ''}</pre>
          <button onclick="location.reload()" style="margin-top: 20px; padding: 12px 24px; background: #0B84F3; color: white; border: none; border-radius: 8px; font-size: 15px; font-weight: bold;">Reload Page</button>
        </div>
      `;
    }
  }
})();