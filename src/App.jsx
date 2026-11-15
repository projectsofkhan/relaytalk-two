
import { useEffect, useState } from "react";
import {
  Link,
  Navigate,
  Route,
  Routes,
  useNavigate
} from "react-router-dom";

import {
  getCurrentSession,
  listenToAuthChanges,
  signInWithUsername,
  signOut,
  signUpWithUsername
} from "./auth";

import Workspace from "./Workspace";
import FriendsPage from "./FriendsPage";
import ChatPage from "./ChatPage";
import ProfilePage from "./ProfilePage";
import CallPage from "./CallPage";

function Brand() {
  return (
    <Link to="/" className="brand">
      <span className="brand-symbol">R</span>
      <span>relaytalk</span>
    </Link>
  );
}

function LoadingScreen() {
  return (
    <main className="loading-screen">
      <div className="loading-mark">R</div>
      <p>Connecting to RelayTalk...</p>
    </main>
  );
}

function PublicLayout({ children }) {
  return (
    <div className="public-layout">
      <header className="site-header">
        <Brand />
        <Link className="header-link" to="/login">
          Sign in ↗
        </Link>
      </header>

      {children}

      <footer className="site-footer">
        <Brand />
        <span>Connect. Talk. Stay close.</span>
      </footer>
    </div>
  );
}

function HomePage({ session }) {
  return (
    <PublicLayout>
      <main className="landing">
        <div className="landing-copy">
          <div className="eyebrow">
            <span className="status-dot" />
            A simpler way to stay connected
          </div>

          <h1>
            Your people.
            <br />
            <span>Your conversations.</span>
          </h1>

          <p className="landing-description">
            A place to talk, share moments and stay close to the
            people who matter. Welcome to RelayTalk.
          </p>

          <div className="landing-actions">
            {session ? (
              <Link className="primary-button" to="/app">
                Open RelayTalk →
              </Link>
            ) : (
              <>
                <Link className="primary-button" to="/signup">
                  Get started →
                </Link>
                <Link className="secondary-button" to="/login">
                  I already have an account
                </Link>
              </>
            )}
          </div>

          <div className="landing-note">
            <span className="note-line" />
            Made for conversations that matter.
          </div>
        </div>

        <div className="landing-art" aria-hidden="true">
          <div className="art-glow" />

          <div className="conversation-card card-back">
            <div className="fake-avatar avatar-purple">A</div>
            <div className="fake-lines"><span /><span /></div>
            <div className="fake-time">now</div>
          </div>

          <div className="conversation-card card-middle">
            <div className="fake-avatar avatar-orange">M</div>
            <div className="fake-lines"><span /><span /></div>
            <div className="fake-time">2m</div>
          </div>

          <div className="conversation-card card-front">
            <div className="fake-avatar avatar-blue">R</div>
            <div className="fake-lines"><span /><span /></div>
            <div className="fake-time">online</div>
          </div>

          <div className="art-caption">
            <span className="status-dot" />
            Good conversations start here.
          </div>
        </div>
      </main>
    </PublicLayout>
  );
}

function AuthLayout({ title, subtitle, children, footer }) {
  return (
    <PublicLayout>
      <main className="auth-page">
        <section className="auth-card">
          <div className="auth-brand"><Brand /></div>

          <div className="auth-heading">
            <h1>{title}</h1>
            <p>{subtitle}</p>
          </div>

          {children}

          <div className="auth-footer">{footer}</div>
        </section>
      </main>
    </PublicLayout>
  );
}

function LoginPage() {
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");
    setBusy(true);

    try {
      const result = await signInWithUsername(username, password);

      if (!result.success) {
        setError(result.error);
        return;
      }

      navigate("/app", { replace: true });
    } catch (err) {
      setError(err.message || "Unable to sign in.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthLayout
      title="Welcome back."
      subtitle="Sign in to continue your conversations."
      footer={
        <>New to RelayTalk? <Link to="/signup">Create an account</Link></>
      }
    >
      <form className="auth-form" onSubmit={handleSubmit}>
        <label htmlFor="login-username">Username</label>
        <input
          id="login-username"
          value={username}
          onChange={(event) => setUsername(event.target.value)}
          placeholder="Enter your username"
          autoComplete="username"
          required
        />

        <label htmlFor="login-password">Password</label>
        <input
          id="login-password"
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          placeholder="Enter your password"
          autoComplete="current-password"
          required
        />

        {error && <div className="form-error" role="alert">{error}</div>}

        <button className="primary-button form-submit" disabled={busy}>
          {busy ? "Signing in..." : "Sign in"}
          {!busy && <span>→</span>}
        </button>
      </form>
    </AuthLayout>
  );
}

function SignupPage() {
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");
    setNotice("");
    setBusy(true);

    try {
      const result = await signUpWithUsername(
        username,
        password,
        confirmPassword
      );

      if (!result.success) {
        setError(result.error);
        return;
      }

      if (result.needsConfirmation) {
        setNotice(
          "Your account was created. Complete the confirmation process configured for your account, then sign in."
        );
        return;
      }

      navigate("/app", { replace: true });
    } catch (err) {
      setError(err.message || "Unable to create your account.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthLayout
      title="Join RelayTalk."
      subtitle="Create your account and start connecting."
      footer={
        <>Already have an account? <Link to="/login">Sign in</Link></>
      }
    >
      <form className="auth-form" onSubmit={handleSubmit}>
        <label htmlFor="signup-username">Choose a username</label>
        <input
          id="signup-username"
          value={username}
          onChange={(event) => setUsername(event.target.value)}
          placeholder="Your username"
          autoComplete="username"
          minLength={3}
          maxLength={20}
          required
        />

        <label htmlFor="signup-password">Create a password</label>
        <input
          id="signup-password"
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          placeholder="At least 6 characters"
          autoComplete="new-password"
          minLength={6}
          required
        />

        <label htmlFor="signup-confirm">Confirm password</label>
        <input
          id="signup-confirm"
          type="password"
          value={confirmPassword}
          onChange={(event) => setConfirmPassword(event.target.value)}
          placeholder="Enter your password again"
          autoComplete="new-password"
          required
        />

        {error && <div className="form-error" role="alert">{error}</div>}
        {notice && <div className="form-notice" role="status">{notice}</div>}

        <button className="primary-button form-submit" disabled={busy}>
          {busy ? "Creating account..." : "Create account"}
          {!busy && <span>→</span>}
        </button>
      </form>
    </AuthLayout>
  );
}

function App() {
  const [session, setSession] = useState(null);
  const [checkingSession, setCheckingSession] = useState(true);

  useEffect(() => {
    let active = true;

    getCurrentSession()
      .then((currentSession) => {
        if (active) setSession(currentSession);
      })
      .catch((error) => {
        console.error("Session restore failed:", error);
      })
      .finally(() => {
        if (active) setCheckingSession(false);
      });

    const unsubscribe = listenToAuthChanges((_event, newSession) => {
      if (active) {
        setSession(newSession);
        setCheckingSession(false);
      }
    });

    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  if (checkingSession) return <LoadingScreen />;

  return (
    <Routes>
      <Route path="/" element={<HomePage session={session} />} />

      <Route
        path="/login"
        element={session ? <Navigate to="/app" replace /> : <LoginPage />}
      />

      <Route
        path="/signup"
        element={session ? <Navigate to="/app" replace /> : <SignupPage />}
      />

      <Route
        path="/app"
        element={
          session
            ? <Workspace session={session} />
            : <Navigate to="/login" replace />
        }
      >
        <Route index element={<Navigate to="friends" replace />} />
        <Route path="friends" element={<FriendsPage session={session} />} />
        <Route path="chat/:friendId" element={<ChatPage session={session} />} />
        <Route path="profile/:userId" element={<ProfilePage session={session} />} />
        <Route path="call/:targetId" element={<CallPage session={session} />} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default App;
