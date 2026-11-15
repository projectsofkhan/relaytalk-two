
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { signOut } from "./auth";

export default function Workspace({ session }) {
  const navigate = useNavigate();

  const username =
    session.user.user_metadata?.username ||
    session.user.email?.split("@")[0] ||
    "Account";

  async function handleSignOut() {
    try {
      await signOut();
      navigate("/login", { replace: true });
    } catch (error) {
      window.alert(error.message || "Could not sign out.");
    }
  }

  return (
    <div className="workspace-layout">
      <aside className="workspace-sidebar">
        <NavLink to="/" className="brand">
          <span className="brand-symbol">R</span>
          <span>relaytalk</span>
        </NavLink>

        <div className="sidebar-label">WORKSPACE</div>

        <nav className="workspace-nav">
          <NavLink to="/app/friends">
            <span className="nav-icon">♧</span>
            Friends
          </NavLink>

          <NavLink to="/app/profile/me">
            <span className="nav-icon">◉</span>
            My profile
          </NavLink>
        </nav>

        <div className="sidebar-bottom">
          <div className="sidebar-account">
            <div className="sidebar-avatar">
              {username.charAt(0).toUpperCase()}
            </div>
            <div>
              <strong>{username}</strong>
              <span>Signed in</span>
            </div>
          </div>

          <button className="sidebar-signout" onClick={handleSignOut}>
            Sign out
          </button>
        </div>
      </aside>

      <main className="workspace-main">
        <header className="workspace-topbar">
          <span>RelayTalk workspace</span>
          <span className="topbar-status">
            <span className="status-dot" />
            Connected account
          </span>
        </header>

        <Outlet />
      </main>
    </div>
  );
}
