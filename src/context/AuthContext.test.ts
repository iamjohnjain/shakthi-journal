import { describe, it, expect, vi } from 'vitest'
import { withTimeout } from './AuthContext'

// Covers the bounding primitive `signOut()` (Remediation Pass 3, P2-5)
// uses to guarantee it reaches its final, guaranteed stage (local state
// clearing + the native bridge notification) even if a prerequisite step
// (clearQueueForUser, supabase.auth.signOut(), a settings write) hangs
// forever or rejects outright. This does NOT exercise `signOut()` itself
// end-to-end (no @testing-library/react in this project to render the
// provider) — it proves the primitive signOut() is built on, deterministically.
describe('withTimeout', () => {
  it('resolves with the operation result when it finishes before the deadline', async () => {
    const result = await withTimeout(() => Promise.resolve('ok'), 50)
    expect(result).toBe('ok')
  })

  it('rejects once the timeout elapses for a never-resolving operation', async () => {
    vi.useFakeTimers()
    const neverResolves = () => new Promise<void>(() => {})
    const p = withTimeout(neverResolves, 1000)
    const assertion = expect(p).rejects.toThrow(/timed out/)
    await vi.advanceTimersByTimeAsync(1000)
    await assertion
    vi.useRealTimers()
  })

  it('propagates a rejected operation without waiting for the timeout', async () => {
    const failing = () => Promise.reject(new Error('boom'))
    await expect(withTimeout(failing, 5000)).rejects.toThrow('boom')
  })

  it('does not leak a pending timer once the operation resolves first', async () => {
    vi.useFakeTimers()
    const fast = () => Promise.resolve(1)
    const result = await withTimeout(fast, 10000)
    expect(result).toBe(1)
    // If the internal timer weren't cleared, advancing past the deadline
    // would have no observable effect either way for THIS call, but a
    // leaked timer across many sign-outs would accumulate — this at
    // least confirms resolving doesn't throw or hang when fake timers
    // are later advanced past the original deadline.
    await vi.advanceTimersByTimeAsync(10000)
    vi.useRealTimers()
  })
})
