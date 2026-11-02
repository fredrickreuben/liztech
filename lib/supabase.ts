import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;

export const supabase = createClient(url, key);

// Signing up through the main client would replace the admin's own session with
// the new user's, so adding a user goes through this throwaway client.
export function createSignupClient() {
  return createClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
      storageKey: "liztech-signup",
    },
  });
}

// Strips characters that have meaning inside a PostgREST or() filter.
export function cleanSearch(text: string) {
  return text.replace(/[,()%*"\\:]/g, " ").trim();
}
