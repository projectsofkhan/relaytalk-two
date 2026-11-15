
import { createClient } from "@supabase/supabase-js";

// Copy these two values from the ORIGINAL repository's
// utils/supabase.js. Do not use a service-role key here.
const SUPABASE_URL = "PASTE_YOUR_EXISTING_SUPABASE_PROJECT_URL";
const SUPABASE_ANON_KEY = "PASTE_YOUR_EXISTING_SUPABASE_ANON_KEY";

if (
  !SUPABASE_URL.startsWith("https://") ||
  SUPABASE_ANON_KEY.startsWith("PASTE_")
) {
  throw new Error(
    "RelayTalk Supabase configuration is missing. Add the existing project URL and anon key in src/supabase.js."
  );
}

export const supabase = createClient(
  SUPABASE_URL,
  SUPABASE_ANON_KEY,
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false,
      storage: window.localStorage,
      storageKey: "supabase.auth.token"
    },
    realtime: {
      params: {
        eventsPerSecond: 10
      }
    }
  }
);
