import { createCalendarHandler } from "./handler.mjs";

// Keep the query under public RLS. This endpoint never uses a service-role key.
const supabaseUrl = Deno.env.get("SUPABASE_URL");
const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
if (!supabaseUrl || !anonKey) throw new Error("Public Supabase configuration missing");

Deno.serve(createCalendarHandler({ supabaseUrl, anonKey }));
