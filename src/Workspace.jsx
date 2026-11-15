
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import {
  Users,
  UserCircle,
  LogOut,
  MessageCircle,
} from "lucide-react";

import { signOut } from "./auth";
import IncomingCallListener from "./IncomingCallListener";
import "./workspace.css";

export default function Workspace({ session }) {
  const navigate = useNavigate();
  const userId = session?.user?.id;

  async function handleSignOut() {
    try {
      await signOut();
      navigate("/login", { replace: true });
    } catch (error) {
      console.error("Sign out failed:", error);
    }
  }

  return (
    <div className="workspace">
      <IncomingCallListener session={session} />

      <aside className="sidebar">
        <NavLink to="/app/friends" className="brand">
          <span className="brand-symbol">
            <MessageCircle size={21} />
          </span>
          <span>RelayTalk</span>
        </NavLink>

        <nav className="sidebar-nav">
          <NavLink to="/app/friends" className="sidebar-link">
            <Users size={19} />
            <span>Friends</span>
          </NavLink>

          <NavLink
            to={`/app/profile/${userId}`}
            className="sidebar-link"
          >
            <UserCircle size={19} />
            <span>My profile</span>
          </NavLink>
        </nav>

        <div className="sidebar-bottom">
          <div className="sidebar-user">
            <div className="avatar small">
              {session?.user?.user_metadata?.username?.[0]?.toUpperCase() ||
                session?.user?.email?.[0]?.toUpperCase() ||
                "U"}
            </div>

            <div className="sidebar-user-details">
              <strong>
                {session?.user?.user_metadata?.username ||
                  session?.user?.email?.split("@")[0] ||
                  "User"}
              </strong>
              <span>Signed in</span>
            </div>
          </div>

          <button
            type="button"
            className="sidebar-link logout-button"
            onClick={handleSignOut}
          >
            <LogOut size={19} />
            <span>Sign out</span>
          </button>
        </div>
      </aside>

      <main className="workspace-main">
        <header className="mobile-header">
          <NavLink to="/app/friends" className="brand">
            <span className="brand-symbol">
              <MessageCircle size={20} />
            </span>
            RelayTalk
          </NavLink>
        </header>

        <div className="workspace-content">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
