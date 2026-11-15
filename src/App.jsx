
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
  getMyProfile,
  listenToAuthChanges,
  signInWithUsername,
  signOut,
  signUpWithUsername
} from "./auth";

function LoadingScreen() {
  return (
    <main className="loading-screen">
      <div className="loading-mark">R</div>
      <p>Connecting to RelayTalk...</p>
    </main>
  );
}

function Brand({ light = false }) {
  return (
    <Link
      to="/"
      className={`brand ${light ? "brand-light" : ""}`}
      aria-label="RelayTalk home"
    >
      <span className="brand-symbol">R</span>
      <span>relaytalk</span>
    </Link>
  );
}

function PublicLayout({ children }) {
  return (
    <div className="public-layout">
      <header className="site-header">
        <Brand />
        <Link className="header-link" to="/login">
          Sign in <span aria-hidden="true">↗</span>
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
                Open RelayTalk <span>→</span>
              </Link>
            ) : (
              <>
                <Link className="primary-button" to="/signup">
                  Get started <span>→</span>
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
            <div className="fake-lines">
              <span />
              <span />
            </div>
            <div className="fake-time">now</div>
          </div>

          <div className="conversation-card card-middle">
            <div className="fake-avatar avatar-orange">M</div>
            <div className="fake-lines">
              <span />
              <span />
            </div>
            <div className="fake-time">2m</div>
          </div>

          <div className="conversation-card card-front">
            <div className="fake-avatar avatar-blue">R</div>
            <div className="fake-lines">
              <span />
              <span />
            </div>
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

function AuthLayout({ children, title, subtitle, footer }) {
  return (
    <PublicLayout>
      <main className="auth-page">
        <section className="auth-card">
          <div className="auth-brand">
            <Brand />
          </div>

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
      setError(err.message || "Unable to sign in. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthLayout
      title="Welcome back."
      subtitle="Sign in to continue your conversations."
      footer={
        <>
          New to RelayTalk? <Link to="/signup">Create an account</Link>
        </>
      }
    >
      <form className="auth-form" onSubmit={handleSubmit}>
        <label htmlFor="login-username">Username</label>
        <input
          id="login-username"
          type="text"
          placeholder="Enter your username"
          autoComplete="username"
          value={username}
          onChange={(event) => setUsername(event.target.value)}
          required
        />

        <label htmlFor="login-password">Password</label>
        <input
          id="login-password"
          type="password"
          placeholder="Enter your password"
          autoComplete="current-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
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
          "Your account was created. Complete the confirmation process configured for your existing Supabase project, then sign in."
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
        <>
          Already have an account? <Link to="/login">Sign in</Link>
        </>
      }
    >
      <form className="auth-form" onSubmit={handleSubmit}>
        <label htmlFor="signup-username">Choose a username</label>
        <input
          id="signup-username"
          type="text"
          placeholder="Your username"
          autoComplete="username"
          minLength={3}
          maxLength={20}
          value={username}
          onChange={(event) => setUsername(event.target.value)}
          required
        />

        <label htmlFor="signup-password">Create a password</label>
        <input
          id="signup-password"
          type="password"
          placeholder="At least 6 characters"
          autoComplete="new-password"
          minLength={6}
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          required
        />

        <label htmlFor="signup-confirm">Confirm password</label>
        <input
          id="signup-confirm"
          type="password"
          placeholder="Enter your password again"
          autoComplete="new-password"
          value={confirmPassword}
          onChange={(event) => setConfirmPassword(event.target.value)}
          required
        />

        {error && <div className="form-error" role="alert">{error}</div>}
        {notice && <div className="form-notice" role="status">{notice}</div>}

        <button className="primary-button form-submit" disabled={busy}>
          {busy ? "Creating account..." : "Create account"}
          {!busy && <span>→</span>}
        </button>

        <p className="form-terms">
          By creating an account, you agree to use RelayTalk responsibly.
        </p>
      </form>
    </AuthLayout>
  );
}

function DashboardPage({ session, onLogout }) {
  const [profile, setProfile] = useState(null);
  const [profileError, setProfileError] = useState("");
  const [loadingProfile, setLoadingProfile] = useState(true);

  useEffect(() => {
    let active = true;

    async function loadProfile() {
      try {
        const data = await getMyProfile(session.user.id);

        if (active) {
          setProfile(data);
        }
      } catch (err) {
        if (active) {
          setProfileError(
            "Your account is connected, but the profile could not be loaded."
          );
        }
      } finally {
        if (active) {
          setLoadingProfile(false);
        }
      }
    }

    loadProfile();

    return () => {
      active = false;
    };
  }, [session.user.id]);

  const username =
    profile?.username ||
    session.user.user_metadata?.username ||
    session.user.email?.split("@")[0] ||
    "there";

  return (
    <div className="dashboard-page">
      <header className="dashboard-header">
        <Brand />
        <button className="logout-button" onClick={onLogout}>
          Sign out
        </button>
      </header>

      <main className="dashboard-content">
        <div className="dashboard-eyebrow">
          <span className="status-dot" />
          YOUR RELAYTALK ACCOUNT
        </div>

        <h1>
          Good to see you,
          <br />
          <span>{username}.</span>
        </h1>

        <p className="dashboard-intro">
          Your account has successfully connected to RelayTalk.
        </p>

        <section className="account-panel">
          <div className="account-panel-heading">
            <div className="account-avatar">
              {username.charAt(0).toUpperCase()}
            </div>
            <div>
              <strong>{profile?.full_name || username}</strong>
              <span>@{username}</span>
            </div>
            <span className="account-status">Connected</span>
          </div>

          <div className="account-details">
            <div>
              <span>Account ID</span>
              <strong>{session.user.id}</strong>
            </div>
            <div>
              <span>Profile status</span>
              <strong>
                {loadingProfile
                  ? "Loading..."
                  : profile
                    ? "Loaded"
                    : "Not available"}
              </strong>
            </div>
          </div>

          {profileError && (
            <p className="dashboard-warning">{profileError}</p>
          )}
        </section>

        <section className="build-notice">
          <div className="build-notice-icon">✦</div>
          <div>
            <h2>The new RelayTalk workspace</h2>
            <p>
              Your authentication is connected. The messaging,
              friends, profile editing and calling modules are the
              next integration stage. They will be connected to
              your existing backend, not simulated with sample data.
            </p>
          </div>
        </section>
      </main>
    </div>
  );
}

function App() {
  const [session, setSession] = useState(null);
  const [checkingSession, setCheckingSession] = useState(true);

  useEffect(() => {
    let active = true;

    getCurrentSession()
      .then((currentSession) => {
        if (active) {
          setSession(currentSession);
        }
      })
      .catch((error) => {
        console.error("Session restore failed:", error);
      })
      .finally(() => {
        if (active) {
          setCheckingSession(false);
        }
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

  async function handleLogout() {
    try {
      await signOut();
    } catch (error) {
      console.error("Sign out failed:", error);
      window.alert("Unable to sign out. Please try again.");
    }
  }

  if (checkingSession) {
    return <LoadingScreen />;
  }

  return (
    <Routes>
      <Route path="/" element={<HomePage session={session} />} />

      <Route
        path="/login"
        element={
          session ? <Navigate to="/app" replace /> : <LoginPage />
        }
      />

      <Route
        path="/signup"
        element={
          session ? <Navigate to="/app" replace /> : <SignupPage />
        }
      />

      <Route
        path="/app"
        element={
          session ? (
            <DashboardPage session={session} onLogout={handleLogout} />
          ) : (
            <Navigate to="/login" replace />
          )
        }
      />

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default App;
