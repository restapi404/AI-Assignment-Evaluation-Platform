// Supabase client, server-side only. Uses the service_role key (never send
// this to the frontend) so the backend can read/write freely regardless of
// Row Level Security policies.
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.warn(
    "SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are not set in backend/.env - " +
      "database calls will fail until these are configured."
  );
}

export const supabase = createClient(
  supabaseUrl || "https://not-configured.supabase.co",
  supabaseServiceKey || "not-configured",
  { auth: { persistSession: false } }
);