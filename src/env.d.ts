declare namespace App {
  interface Locals {
    user: import("@supabase/supabase-js").User | null;
    /**
     * display_name resolved by middleware once per request from profiles
     * (with email-local-part fallback). Null when no user is signed in
     * or the lookup couldn't resolve a value. Consumers (AppTopbar,
     * lesson page) read this instead of re-querying profiles per render.
     */
    displayName: string | null;
  }
}
