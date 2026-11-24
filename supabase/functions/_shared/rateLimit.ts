// Lightweight per-isolate rate limiter for the AI edge functions. These all
// run with `verify_jwt = false` (see each function's own comment — none of
// them touch the database, so there's no per-user identity to key on), which
// means the only thing standing between "my app calls Groq" and "anyone who
// finds this URL calls Groq on my API key" was the CORS origin check. CORS
// stops drive-by browser abuse but not a direct curl/script hitting the
// public function URL — this closes that gap by capping how many calls a
// single caller can make.
//
// Deliberately NOT a database-backed limiter: that would mean adding a
// service-role DB client to functions that currently have none (a bigger
// surface to secure than the problem it'd solve). A Deno edge function
// instance stays warm across requests for a while, so an in-memory counter
// keyed by caller IP is a real, if imperfect, limit — it resets on cold
// start and isn't shared across regions/instances, so treat it as a
// speed bump against casual/scripted abuse, not a hard guarantee.

const WINDOW_MS = 60_000
const MAX_REQUESTS_PER_WINDOW = 20

const hits = new Map<string, number[]>()

function callerKey(req: Request): string {
  // Supabase/Cloudflare set this to the real client IP; fall back to a
  // shared bucket (fails safe toward "more limited," not "unlimited") if
  // it's ever missing.
  return req.headers.get('x-forwarded-for')?.split(',')[0].trim()
    ?? req.headers.get('cf-connecting-ip')
    ?? 'unknown'
}

/** Returns true if the request should be allowed, false if it's over the
 *  limit. Call once at the top of each AI function's handler. */
export function checkRateLimit(req: Request): boolean {
  const key = callerKey(req)
  const now = Date.now()
  const windowStart = now - WINDOW_MS
  const recent = (hits.get(key) ?? []).filter(t => t > windowStart)
  if (recent.length >= MAX_REQUESTS_PER_WINDOW) {
    hits.set(key, recent)
    return false
  }
  recent.push(now)
  hits.set(key, recent)
  return true
}
