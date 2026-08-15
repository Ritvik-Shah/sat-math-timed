// Thin wrapper around the Supabase JS client for accounts + per-user
// history. Requires vendor/supabase-js.js and supabase-config.js to be
// loaded first (in that order) via <script> tags before this file — that
// wiring lives in index.html, owned elsewhere.
//
// There is no self-serve signup here: accounts are provisioned by the site
// owner from the Supabase dashboard ("Invite user"), which emails the user
// a link to set their own password. That link lands back on this site with
// an invite/recovery token in the URL hash — see isInviteOrRecoveryFlow().

(function (root) {
  "use strict";

  let cachedSubscribed = null; // { value, at } — brief in-memory cache, see isSubscribed()
  const SUBSCRIBED_CACHE_MS = 30000;

  // Last session we've seen, kept up to date by the onAuthStateChange
  // listener set up in getClient() below. Lets getUser()/getSession-ish
  // sync reads work without forcing every caller to await.
  let lastKnownSession = null;
  let sessionListenerStarted = false;

  function notConfiguredError() {
    return new Error("Accounts aren't set up yet. Fill in supabase-config.js with your Supabase project's URL and anon key.");
  }

  // Builds the Supabase client on first use rather than at load time, so a
  // missing/placeholder config never throws during page load — it just
  // means every AUTH method below rejects with a clear error instead.
  let client = null;
  let clientAttempted = false;
  function getClient() {
    if (client) return client;
    if (clientAttempted) return null;
    clientAttempted = true;

    const cfg = window.SUPABASE_CONFIG;
    if (!cfg || !cfg.url || !cfg.anonKey || cfg.url.includes("REPLACE_WITH_YOUR_SUPABASE_URL")) {
      return null;
    }
    if (!window.supabase || typeof window.supabase.createClient !== "function") {
      return null; // vendor/supabase-js.js didn't load
    }
    client = window.supabase.createClient(cfg.url, cfg.anonKey);

    if (!sessionListenerStarted) {
      sessionListenerStarted = true;
      client.auth.getSession().then(({ data }) => {
        lastKnownSession = (data && data.session) || null;
      });
      client.auth.onAuthStateChange((_event, session) => {
        lastKnownSession = session || null;
        cachedSubscribed = null; // identity/session changed, don't serve a stale answer
      });
    }

    return client;
  }

  async function signIn(email, password) {
    const sb = getClient();
    if (!sb) throw notConfiguredError();

    const { data, error } = await sb.auth.signInWithPassword({ email, password });
    if (error) {
      throw new Error(error.message || "Sign in failed. Check your email and password and try again.");
    }
    cachedSubscribed = null; // stale after identity change
    return data;
  }

  async function signOut() {
    const sb = getClient();
    if (!sb) throw notConfiguredError();

    cachedSubscribed = null;
    const { error } = await sb.auth.signOut();
    if (error) throw new Error(error.message || "Sign out failed.");
  }

  // Synchronous "what do we know right now" read, backed by lastKnownSession
  // (kept current by the auth-state listener started in getClient()). Good
  // enough for render-time checks; use getSession()/onAuthChange for
  // anything that needs to be certain a token isn't stale.
  function getUser() {
    if (!getClient()) return null;
    return (lastKnownSession && lastKnownSession.user) || null;
  }

  async function getSession() {
    const sb = getClient();
    if (!sb) return null;
    const { data, error } = await sb.auth.getSession();
    if (error) return null;
    return data.session || null;
  }

  async function getUserAsync() {
    const session = await getSession();
    return (session && session.user) || null;
  }

  function onAuthChange(callback) {
    const sb = getClient();
    if (!sb) {
      // Nothing to subscribe to; still call back once so UI code doesn't
      // hang waiting for an event that will never come.
      callback(null, null);
      return { unsubscribe() {} };
    }

    // Fire once immediately with whatever we currently know, then again on
    // every future change (sign in/out, token refresh, password set).
    sb.auth.getSession().then(({ data }) => {
      const session = data && data.session;
      callback((session && session.user) || null, session || null);
    });

    const { data: sub } = sb.auth.onAuthStateChange((_event, session) => {
      cachedSubscribed = null; // identity/session changed, don't serve a stale answer
      callback((session && session.user) || null, session || null);
    });

    return sub.subscription;
  }

  async function isSubscribed() {
    const sb = getClient();
    if (!sb) return false;

    if (cachedSubscribed && Date.now() - cachedSubscribed.at < SUBSCRIBED_CACHE_MS) {
      return cachedSubscribed.value;
    }

    const user = await getUserAsync();
    if (!user) {
      cachedSubscribed = { value: false, at: Date.now() };
      return false;
    }

    const { data, error } = await sb
      .from("subscriptions")
      .select("status, current_period_end")
      .eq("user_id", user.id)
      .maybeSingle();

    if (error || !data) {
      cachedSubscribed = { value: false, at: Date.now() };
      return false;
    }

    // Mirrors is_subscription_active() in supabase/schema.sql: active status,
    // and either no expiry or an expiry still in the future.
    const active =
      data.status === "active" &&
      (!data.current_period_end || new Date(data.current_period_end) > new Date());

    cachedSubscribed = { value: active, at: Date.now() };
    return active;
  }

  // Supabase's invite/recovery email link redirects back here with
  // `#access_token=...&type=invite` (or `type=recovery`) in the URL hash.
  // Detect it so the frontend can show a "set your password" form instead
  // of a normal login form.
  function isInviteOrRecoveryFlow() {
    const hash = window.location.hash || "";
    if (!hash) return false;
    const params = new URLSearchParams(hash.replace(/^#/, ""));
    const type = params.get("type");
    return (type === "invite" || type === "recovery") && params.has("access_token");
  }

  async function setPassword(newPassword) {
    const sb = getClient();
    if (!sb) throw notConfiguredError();

    const { data, error } = await sb.auth.updateUser({ password: newPassword });
    if (error) throw new Error(error.message || "Couldn't set your password. Try again.");
    cachedSubscribed = null;
    return data;
  }

  // Exposes the initialized Supabase client (or null if not configured yet)
  // for code elsewhere (app.js) that needs direct table/RPC access — e.g.
  // `AUTH.getClient().from('sessions').insert(...)`. Distinct from the
  // `window.supabase` global, which is the *library* namespace (it just has
  // `.createClient`), not a client instance.
  function getClientForApp() {
    return getClient();
  }

  root.AUTH = {
    signIn,
    signOut,
    getUser,
    getSession,
    onAuthChange,
    isSubscribed,
    isInviteOrRecoveryFlow,
    setPassword,
    getClient: getClientForApp,
  };
})(window);
