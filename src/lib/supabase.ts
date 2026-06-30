import { createClient } from '@supabase/supabase-js'
import type { SupabaseClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseKey)
export { supabaseUrl }

export const supabase: SupabaseClient | null = isSupabaseConfigured
  ? createClient(supabaseUrl!, supabaseKey!)
  : null

// Checks /auth/v1/settings before redirecting so provider errors are caught in-app
// instead of showing raw JSON from Supabase's auth endpoint.
export async function assertProviderEnabled(provider: string): Promise<void> {
  if (!supabaseUrl) return
  try {
    const resp = await fetch(`${supabaseUrl}/auth/v1/settings`)
    if (!resp.ok) return // can't validate — proceed and let Supabase handle it
    const data = await resp.json() as { external?: Record<string, boolean> }
    if (data?.external?.[provider] === false) {
      throw new Error(
        `${provider.charAt(0).toUpperCase() + provider.slice(1)} sign-in is not enabled on this project. ` +
        `Use email sign-in or ask the app owner to enable it in Supabase → Authentication → Providers.`
      )
    }
  } catch (e) {
    // Re-throw only our own error; network errors are ignored (assume enabled)
    if (e instanceof Error && e.message.includes('not enabled')) throw e
  }
}
