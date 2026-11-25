// Cross-account IndexedDB isolation (P1-3). Verifies that once two
// different identities have each called `setActiveDbIdentity`, their data
// lives in physically separate databases — one account can never read,
// overwrite, or delete another's records, even on the same device without
// a full page reload between sessions.
import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import type { WorkoutSession } from './index'

function workout(overrides: Partial<WorkoutSession> & { id: string }): WorkoutSession {
  return {
    date: '2026-01-01', type: 'lifting', title: 'Session', durationMin: 30,
    exercises: [], createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  }
}

// This vitest/jsdom setup doesn't provide a real `localStorage` (only
// IndexedDB is polyfilled above) — stub a minimal one so the legacy-
// migration flag the production code reads/writes via `localStorage` has
// somewhere to live during tests. Real browsers always have one.
if (typeof globalThis.localStorage === 'undefined') {
  const store = new Map<string, string>()
  globalThis.localStorage = {
    getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
    setItem: (k: string, v: string) => { store.set(k, v) },
    removeItem: (k: string) => { store.delete(k) },
    clear: () => { store.clear() },
    key: (i: number) => Array.from(store.keys())[i] ?? null,
    get length() { return store.size },
  } as Storage
}

async function freshDb() {
  // Each test needs its own copy of the module's singleton state
  // (`_dbPromise`, `_activeDbName`, the identity gate) — re-importing after
  // `vi.resetModules()` is the only way to get that without exposing a
  // test-only reset hook from production code.
  const mod = await import('./index')
  return mod
}

describe('per-account IndexedDB isolation', () => {
  beforeEach(async () => {
    // fake-indexeddb keeps all databases in memory for the whole test file,
    // not per test, and deleting a database while a previous test's handle
    // is still open just hangs (real IndexedDB semantics: a pending delete
    // blocks until every open connection closes). Rather than fight that,
    // each test below uses its own unique identity names, so there's never
    // any database-name collision across tests to begin with.
    localStorage.clear()
    const { vi } = await import('vitest')
    vi.resetModules()
  })

  it('account A cannot see account B\'s records, and vice versa', async () => {
    const { setActiveDbIdentity, getDB } = await freshDb()

    await setActiveDbIdentity('user-a')
    const dbA = await getDB()
    await dbA.put('workouts', workout({ id: 'w1' }))

    await setActiveDbIdentity('user-b')
    const dbB = await getDB()
    const bSeesA = await dbB.get('workouts', 'w1')
    expect(bSeesA).toBeUndefined()

    await dbB.put('workouts', workout({ id: 'w2', date: '2026-01-02' }))

    // B cannot delete/overwrite A's record by id collision — B's store
    // simply never had it, confirmed above. Now confirm the reverse: A
    // switching back still sees only its own record, not B's.
    await setActiveDbIdentity('user-a')
    const dbA2 = await getDB()
    const aRecord = await dbA2.get('workouts', 'w1')
    const aSeesB = await dbA2.get('workouts', 'w2')
    expect(aRecord?.id).toBe('w1')
    expect(aSeesB).toBeUndefined()
  })

  it('guest mode keeps using the original unscoped database, untouched by any account', async () => {
    // Simulate the one-time legacy migration already being behind us —
    // this test is about steady-state isolation, not the first-sign-in
    // migration (covered separately below).
    localStorage.setItem('jeevan.perUserMigrationDone', '1')
    const { setActiveDbIdentity, getDB } = await freshDb()

    await setActiveDbIdentity(null)
    const guestDb = await getDB()
    await guestDb.put('daily_logs', {
      date: '2026-01-01', createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z',
    })

    await setActiveDbIdentity('user-a')
    const dbA = await getDB()
    const aSeesGuest = await dbA.get('daily_logs', '2026-01-01')
    expect(aSeesGuest).toBeUndefined()

    await setActiveDbIdentity(null)
    const guestDb2 = await getDB()
    const stillThere = await guestDb2.get('daily_logs', '2026-01-01')
    expect(stillThere?.date).toBe('2026-01-01')
  })

  it('legacy unscoped data migrates to the first account to sign in, and only that one', async () => {
    const { setActiveDbIdentity, getDB } = await freshDb()

    // Simulate pre-upgrade guest data under the original database name.
    await setActiveDbIdentity(null)
    const legacyDb = await getDB()
    await legacyDb.put('daily_logs', {
      date: '2025-06-01', createdAt: '2025-06-01T00:00:00Z', updatedAt: '2025-06-01T00:00:00Z',
    })

    await setActiveDbIdentity('first-user')
    const firstDb = await getDB()
    const migrated = await firstDb.get('daily_logs', '2025-06-01')
    expect(migrated?.date).toBe('2025-06-01')

    // A second account afterward must NOT also inherit it — only the first
    // post-upgrade account gets the one-time copy.
    await setActiveDbIdentity('second-user')
    const secondDb = await getDB()
    const secondSeesLegacy = await secondDb.get('daily_logs', '2025-06-01')
    expect(secondSeesLegacy).toBeUndefined()
  })

  it('switching identity closes the previous database handle so stale writes cannot land cross-account', async () => {
    const { setActiveDbIdentity, getDB } = await freshDb()

    await setActiveDbIdentity('user-c')
    const dbA = await getDB()

    await setActiveDbIdentity('user-d')

    // The old handle is closed — any further use of it should reject
    // rather than silently writing into what is now a stale reference.
    await expect(
      dbA.put('workouts', workout({ id: 'late-write' }))
    ).rejects.toBeDefined()
  })
})

describe('guest-to-account data transfer', () => {
  beforeEach(async () => {
    localStorage.clear()
    localStorage.setItem('jeevan.perUserMigrationDone', '1')
    const { vi } = await import('vitest')
    vi.resetModules()
  })

  it('importGuestDataIntoAccount copies guest records into the account database without clearing guest data', async () => {
    const { setActiveDbIdentity, getDB, importGuestDataIntoAccount } = await freshDb()

    await setActiveDbIdentity(null)
    const guestDb = await getDB()
    await guestDb.put('workouts', workout({ id: 'guest-w1' }))

    const copied = await importGuestDataIntoAccount('new-user')
    expect(copied).toBeGreaterThan(0)

    await setActiveDbIdentity('new-user')
    const accountDb = await getDB()
    const transferred = await accountDb.get('workouts', 'guest-w1')
    expect(transferred?.id).toBe('guest-w1')

    // Guest data must still be intact — this path never clears it.
    await setActiveDbIdentity(null)
    const guestDb2 = await getDB()
    const stillInGuest = await guestDb2.get('workouts', 'guest-w1')
    expect(stillInGuest?.id).toBe('guest-w1')
  })

  it('importGuestDataIntoAccount never overwrites an account\'s own existing records with unrelated guest records', async () => {
    const { setActiveDbIdentity, getDB, importGuestDataIntoAccount } = await freshDb()

    await setActiveDbIdentity('existing-user')
    const accountDb = await getDB()
    await accountDb.put('workouts', workout({ id: 'own-w1', title: 'Own session' }))

    await setActiveDbIdentity(null)
    const guestDb = await getDB()
    await guestDb.put('workouts', workout({ id: 'guest-w2', title: 'Guest session' }))

    await importGuestDataIntoAccount('existing-user')

    await setActiveDbIdentity('existing-user')
    const accountDb2 = await getDB()
    const own = await accountDb2.get('workouts', 'own-w1')
    const imported = await accountDb2.get('workouts', 'guest-w2')
    expect(own?.title).toBe('Own session')
    expect(imported?.title).toBe('Guest session')
  })

  it('clearGuestDatabase erases guest data, honoring the "replace local with cloud" promise', async () => {
    const { setActiveDbIdentity, getDB, clearGuestDatabase } = await freshDb()

    await setActiveDbIdentity(null)
    const guestDb = await getDB()
    await guestDb.put('workouts', workout({ id: 'to-be-erased' }))

    await clearGuestDatabase()

    const guestDb2 = await getDB()
    const gone = await guestDb2.get('workouts', 'to-be-erased')
    expect(gone).toBeUndefined()
  })
})
