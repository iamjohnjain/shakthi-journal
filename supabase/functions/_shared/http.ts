// Generic HTTP response helpers shared by every edge function (meal or
// workout, text or vision) — nothing domain-specific lives here.

// The only web origins this app is ever actually served from — the
// authoritative production Pages deployment (see docs/APP_STORE_READINESS.md:
// jeevan-health-fitness-app.pages.dev is the sole Release origin; the
// shakthi-journal.pages.dev parallel deployment is legacy and intentionally
// NOT trusted here) plus local dev. Previously this echoed back whatever
// Origin header the caller sent (`origin ?? '*'`), which trusts every
// website on the internet — a page on any other domain could drive a
// visitor's browser into calling these functions. verify_jwt is off on all
// of these (see each function's own comment), so this origin allowlist is
// the only thing standing between "my app calls this" and "any site can."
const ALLOWED_ORIGINS = new Set([
  'https://jeevan-health-fitness-app.pages.dev',
  'http://localhost:5173',
  'http://localhost:4173', // vite preview
])

export function corsHeaders(origin: string | null): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': origin && ALLOWED_ORIGINS.has(origin) ? origin : 'null',
    // supabase-js's functions.invoke() sends x-client-info (and sometimes
    // x-supabase-api-version) on every call — missing either from this list
    // makes the browser's CORS preflight fail silently before the request
    // ever reaches this function. curl/Postman don't enforce CORS, so this
    // class of bug only shows up in an actual browser.
    'Access-Control-Allow-Headers': 'content-type, authorization, apikey, x-client-info, x-supabase-api-version',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  }
}

export function jsonResponse(body: unknown, status: number, origin: string | null): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) },
  })
}
