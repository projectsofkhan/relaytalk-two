
import { supabase } from "./supabase";

function usernameToEmail(username) {
  return `${username.trim()}@luster.test`;
}

export function validateUsername(username) {
  const value = username.trim();

  if (value.length < 3 || value.length > 20) {
    return "Username must be between 3 and 20 characters.";
  }

  if (!/^[a-zA-Z0-9_.]+$/.test(value)) {
    return "Only letters, numbers, underscores and dots are allowed.";
  }

  return null;
}

export async function signInWithUsername(username, password) {
  const usernameError = validateUsername(username);

  if (usernameError) {
    return { success: false, error: usernameError };
  }

  if (!password) {
    return { success: false, error: "Please enter your password." };
  }

  const { data, error } = await supabase.auth.signInWithPassword({
    email: usernameToEmail(username),
    password
  });

  if (error) {
    if (error.message.includes("Invalid login credentials")) {
      return {
        success: false,
        error: "Invalid username or password."
      };
    }

    if (error.message.includes("Email not confirmed")) {
      return {
        success: false,
        error: "Your account needs email confirmation."
      };
    }

    return {
      success: false,
      error: error.message
    };
  }

  return {
    success: true,
    user: data.user,
    session: data.session
  };
}

export async function signUpWithUsername(
  username,
  password,
  confirmPassword
) {
  const usernameError = validateUsername(username);

  if (usernameError) {
    return { success: false, error: usernameError };
  }

  if (password.length < 6) {
    return {
      success: false,
      error: "Password must contain at least 6 characters."
    };
  }

  if (password !== confirmPassword) {
    return {
      success: false,
      error: "Passwords do not match."
    };
  }

  const cleanUsername = username.trim();

  const { data, error } = await supabase.auth.signUp({
    email: usernameToEmail(cleanUsername),
    password,
    options: {
      data: {
        username: cleanUsername,
        full_name: cleanUsername
      }
    }
  });

  if (error) {
    if (
      error.message.toLowerCase().includes("already registered") ||
      error.message.toLowerCase().includes("already exists")
    ) {
      return {
        success: false,
        error: "That username is already taken."
      };
    }

    return {
      success: false,
      error: error.message
    };
  }

  // Preserve the original app's automatic sign-in behaviour.
  // If confirmation is enabled, Supabase may not create a session yet.
  if (!data.session && data.user) {
    const loginResult = await supabase.auth.signInWithPassword({
      email: usernameToEmail(cleanUsername),
      password
    });

    if (loginResult.error) {
      return {
        success: true,
        user: data.user,
        session: null,
        needsConfirmation: true
      };
    }

    return {
      success: true,
      user: loginResult.data.user,
      session: loginResult.data.session,
      needsConfirmation: false
    };
  }

  return {
    success: true,
    user: data.user,
    session: data.session,
    needsConfirmation: false
  };
}

export async function signOut() {
  const { error } = await supabase.auth.signOut();

  if (error) {
    throw error;
  }

  return true;
}

export async function getCurrentUser() {
  const { data, error } = await supabase.auth.getUser();

  if (error) {
    return null;
  }

  return data.user ?? null;
}

export async function getCurrentSession() {
  const { data, error } = await supabase.auth.getSession();

  if (error) {
    throw error;
  }

  return data.session;
}

export function listenToAuthChanges(callback) {
  const { data } = supabase.auth.onAuthStateChange(
    (event, session) => {
      callback(event, session);
    }
  );

  return () => {
    data.subscription.unsubscribe();
  };
}

export async function getMyProfile(userId) {
  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", userId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data;
}
