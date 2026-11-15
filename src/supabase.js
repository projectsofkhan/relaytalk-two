
import { createClient } from "@supabase/supabase-js";

// Copy these two values from the ORIGINAL repository's
// utils/supabase.js. Do not use a service-role key here.
const SUPABASE_URL = "https://kponqaktavkrchebmiwr.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imtwb25xYWt0YXZrcmNoZWJtaXdyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODkyOTUzMTMsImV4cCI6MjEwNDg3MTMxM30.nkoiFez4G3-CzKvatQ9xZL4FpnZa9Qixcr64Sh8ytDE";

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
