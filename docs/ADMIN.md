# Admin guide: accounts & access

This site has no self-serve signup and no billing. You (the site owner)
manually invite each user and manually flip on their access. This doc
covers the whole loop.

## 1. Create a Supabase project

1. Go to https://supabase.com, sign up (free tier, no card required).
2. "New project" → pick a name/region/database password (save the DB
   password somewhere — you likely won't need it day to day, but it's
   your escape hatch for direct Postgres access).
3. Wait ~2 minutes for provisioning.

### Where to find your keys

Project Settings (gear icon) → API:

- **Project URL** — goes in `supabase-config.js` as `url`.
- **anon public** key — goes in `supabase-config.js` as `anonKey`. This is
  safe to ship in client-side JS; Row Level Security policies (see
  `supabase/schema.sql`) are the real access boundary, not secrecy of this
  key.
- **service_role** key — do **not** put this in any client-side file. It
  bypasses RLS entirely. It's used server-side only: as a secret on the
  Cloudflare Worker (another part of this project's setup — see the
  worker's own docs) and when you run admin SQL yourself. Treat it like a
  password.

## 2. Run the schema

Easiest path — the dashboard SQL editor:

1. Supabase dashboard → SQL Editor → "New query".
2. Open `supabase/schema.sql` from this repo, paste the whole thing in.
3. Run it.

The script is idempotent (`create table if not exists`, `drop policy if
exists` before recreating, etc.), so re-running it after a future edit is
safe — it won't error on things that already exist or duplicate data.

If you'd rather use the Supabase CLI or `psql` directly, that works too
(`supabase db push` or `psql <connection-string> -f supabase/schema.sql`),
but the SQL editor is the lowest-friction option and needs nothing
installed locally.

## 3. Invite a user

1. Supabase dashboard → Authentication → Users → "Invite user".
2. Enter their email, send.
3. Supabase emails them a link. Clicking it lands them back on this site
   with an invite token in the URL, where the frontend shows a "set your
   password" form (see `auth.js`'s `isInviteOrRecoveryFlow()` /
   `setPassword()` — wired into the UI elsewhere). Once they set a
   password they're signed in.

A `profiles` row is created for them automatically (by a database trigger
— see `supabase/schema.sql`), so there's nothing else to do here.

## 4. Grant them paid access

They can sign in at this point, but `subscriptions` has no row for them
yet, so `is_subscription_active()` is false and RLS blocks their
practice-history writes. Turn it on with SQL:

1. Find their `uuid`: Authentication → Users → click their row (or just
   look at the "UID" column in the users list).
2. SQL Editor → run:

   ```sql
   insert into subscriptions (user_id, plan, status)
   values ('<their-uuid-from-auth.users>', 'admin_grant', 'active');
   ```

That's it — `is_subscription_active()` now returns true for them, and the
`question_attempts`/`sessions` RLS policies let their client read/write
normally.

## 5. Revoke access

```sql
update subscriptions set status = 'canceled' where user_id = '<their-uuid>';
```

Their `profiles` row and history stay intact (nothing is deleted); they
just lose write/read access to `question_attempts`/`sessions` until you
set `status` back to `'active'`.

To fully remove someone instead: Authentication → Users → delete their
row. `profiles`, `subscriptions`, `question_attempts`, `sessions`, and
`tutor_usage` all reference `auth.users(id) on delete cascade`, so their
data is cleaned up automatically.
