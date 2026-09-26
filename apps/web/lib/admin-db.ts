import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let client: SupabaseClient | undefined;

/**
 * Service-role client for /admin server actions. Never import this from a
 * client component — the key must stay on the server.
 */
export function adminDb(): SupabaseClient {
  if (typeof window !== "undefined") throw new Error("adminDb() is server-only");
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set for /admin");
  client ??= createClient(url, key, { auth: { persistSession: false } });
  return client;
}
