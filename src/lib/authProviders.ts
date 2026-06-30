export const AUTH_PROVIDERS = {
  google: { enabled: true },
  email:  { enabled: true },
  guest:  { enabled: true },
  apple:  { enabled: false }, // requires Apple Developer account + Supabase Apple provider config
} as const

export type AuthProviderKey = keyof typeof AUTH_PROVIDERS
