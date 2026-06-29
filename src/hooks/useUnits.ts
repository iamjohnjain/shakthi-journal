import { useState, useEffect, useCallback } from 'react'
import { getSetting, setSetting } from '../db'

export type UnitSystem = 'us-hybrid' | 'metric'

export interface Units {
  system: UnitSystem
  weight: 'lbs' | 'kg'          // workout + body weight
  distance: 'miles' | 'km'
  height: 'ft-in' | 'cm'
  // food always in grams
  setSystem: (s: UnitSystem) => void
  fmtWeight: (kg: number) => string
  fmtDistance: (km: number) => string
}

function kgToLbs(kg: number) { return Math.round(kg * 2.2046 * 10) / 10 }
function kmToMiles(km: number) { return Math.round(km * 0.62137 * 100) / 100 }

export function useUnits(): Units {
  const [system, setSystemState] = useState<UnitSystem>('us-hybrid')

  useEffect(() => {
    getSetting<UnitSystem>('unit-system', 'us-hybrid').then(setSystemState)
  }, [])

  const setSystem = useCallback((s: UnitSystem) => {
    setSystemState(s)
    setSetting('unit-system', s)
  }, [])

  const isMetric = system === 'metric'

  return {
    system,
    weight:   isMetric ? 'kg'    : 'lbs',
    distance: isMetric ? 'km'    : 'miles',
    height:   isMetric ? 'cm'    : 'ft-in',
    setSystem,
    fmtWeight:   (kg)  => isMetric ? `${kg.toFixed(1)} kg`  : `${kgToLbs(kg)} lbs`,
    fmtDistance: (km)  => isMetric ? `${km.toFixed(2)} km`  : `${kmToMiles(km)} mi`,
  }
}

// Sync helper — call once per render if you just need the current system value
export async function getUnitSystem(): Promise<UnitSystem> {
  return getSetting<UnitSystem>('unit-system', 'us-hybrid')
}
