import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { requireEnv } from "./env.js";

let client: SupabaseClient | undefined;

/** Service-role client. Server-side only — bypasses RLS. */
export function db(): SupabaseClient {
  client ??= createClient(requireEnv("SUPABASE_URL"), requireEnv("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false },
  });
  return client;
}
