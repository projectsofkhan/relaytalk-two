import { supabase } from "./supabase";

const USERNAME_EMAIL_DOMAIN = "@luster.test";

function normalizeUsername(username) {
  return String(username || "").trim();
}

function usernameToEmail(username) {
  return `${normalizeUsername(username)}${USERNAME_EMAIL_DOMAIN}`;
}

export async function getCurrentSession() {
  const { data, error } = await supabase.auth.getSession();

  if (error) throw error;

  return data.session;
}

export function listenToAuthChanges(callback) {
  const {
    data: { subscription },
  } = supabase.auth.onAuthStateChange((_event, session) => {
    callback(session);
  });

  return () => subscription.unsubscribe();
}

export async function signInWithUsername(username, password) {
  const cleanUsername = normalizeUsername(username);

  if (!cleanUsername || !password) {
    throw new Error("Enter your username and password.");
  }

  const { data, error } = await supabase.auth.signInWithPassword({
    email: usernameToEmail(cleanUsername),
    password,
  });

  if (error) {
    if (error.message.includes("Invalid login credentials")) {
      throw new Error("Invalid username or password.");
    }

    if (error.message.includes("Email not confirmed")) {
      throw new Error("Your account email has not been confirmed.");
    }

    throw new Error(error.message || "Unable to sign in.");
  }

  return data;
}

export async function signUpWithUsername(
  username,
  password,
  confirmPassword
) {
  const cleanUsername = normalizeUsername(username);

  if (!/^[a-zA-Z0-9_.]{3,20}$/.test(cleanUsername)) {
    throw new Error(
      "Username must be 3–20 characters and contain only letters, numbers, dots or underscores."
    );
  }

  if (!password || password.length < 6) {
    throw new Error("Password must contain at least 6 characters.");
  }

  if (password !== confirmPassword) {
    throw new Error("Passwords do not match.");
  }

  const email = usernameToEmail(cleanUsername);

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        username: cleanUsername,
        full_name: cleanUsername,
      },
    },
  });

  if (error) {
    if (
      error.message.toLowerCase().includes("already registered") ||
      error.message.toLowerCase().includes("already exists")
    ) {
      throw new Error("That username is already taken.");
    }

    throw new Error(error.message || "Unable to create your account.");
  }

  // Match the original application: attempt an immediate login.
  // The existing database trigger remains responsible for profile creation.
  const { data: loginData, error: loginError } =
    await supabase.auth.signInWithPassword({
      email,
      password,
    });

  return {
    user: data.user,
    session: loginData?.session || null,
    autoLogin: !loginError && !!loginData?.session,
    loginError: loginError?.message || null,
  };
}

export async function signOut() {
  const { error } = await supabase.auth.signOut();

  if (error) throw error;

  return true;
}
