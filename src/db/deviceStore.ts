import { getSetting, setSetting } from './index'

/**
 * Hardware the app can gate UI on. Apple Health itself is not here — it's the
 * always-relevant hub, not optional equipment.
 */
export type DeviceId = 'apple_watch' | 'ringconn' | 'renpho'

export const GATEABLE_DEVICES: Array<{ id: DeviceId; name: string; icon: string; desc: string }> = [
  { id: 'apple_watch', name: 'Apple Watch',        icon: '⌚', desc: 'Heart rate, HRV, activity, workouts' },
  { id: 'ringconn',    name: 'RingConn',           icon: '💍', desc: 'Sleep, HRV, resting heart rate, SpO2' },
  { id: 'renpho',      name: 'RENPHO Smart Scale', icon: '⚖️', desc: 'Weight, body fat, muscle mass' },
]

const KEY = 'owned-devices'

/**
 * `null` means the user has never confirmed owning anything (set only via
 * Settings → Connected Accounts) — callers should treat that as "owns
 * nothing," so equipment-specific prompts don't show by default to someone
 * who was never asked and never has the hardware. Real synced data from a
 * device still shows regardless of this flag; it only gates the empty-state
 * nudge toward syncing something that can't produce anything for most users.
 */
export async function getOwnedDevices(): Promise<DeviceId[] | null> {
  return getSetting<DeviceId[] | null>(KEY, null)
}

export async function setOwnedDevices(ids: DeviceId[]): Promise<void> {
  await setSetting(KEY, ids)
}

export function owns(owned: DeviceId[] | null, id: DeviceId): boolean {
  return owned !== null && owned.includes(id)
}
