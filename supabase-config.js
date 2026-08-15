// Supabase project connection details, used by auth.js (and by app.js /
// tutor.js for authenticated requests). Safe to ship client-side: the anon
// key is a public key by design — it only grants what Row Level Security
// policies on the database allow (see supabase/schema.sql), never a
// bypass of them. Get both values from the Supabase dashboard →
// Project Settings → API ("Project URL" and "anon public" key).
window.SUPABASE_CONFIG = {
  url: "https://khooprfrdazbhsxeasyn.supabase.co",
  anonKey: "sb_publishable_Uz-FEWXsX4BCaAVxbFgEnA_ktmWCjYb",
};
