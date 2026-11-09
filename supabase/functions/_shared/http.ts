// Generic HTTP response helpers shared by every edge function (meal or
// workout, text or vision) — nothing domain-specific lives here.

export function corsHeaders(origin: string | null): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': origin ?? '*',
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
