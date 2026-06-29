// ─── Connection states ────────────────────────────────────────────────────────

export type ConnectionStatus =
  | 'connected'        // actively syncing via API/OAuth
  | 'import_ready'     // file import configured and working
  | 'via_hub'          // syncs through Apple Health — no direct action needed
  | 'needs_setup'      // user must enable sync in the source app
  | 'not_connected'    // not configured at all
  | 'coming_soon'      // planned, not yet built
  | 'syncing'          // actively pulling data right now
  | 'failed'           // last sync attempt errored

export type SyncMethod =
  | 'apple_healthkit'  // native iOS HealthKit (real-time, Phase 6)
  | 'apple_health_xml' // manual export.xml import (Phase 2)
  | 'oauth_api'        // official OAuth 2.0 API (Phase 3+)
  | 'csv_import'       // manual CSV file upload
  | 'via_apple_health' // device syncs into Apple Health first
  | 'mock'             // simulated for development

export type DataSourcePhase = 1 | 2 | 3 | 4 | 5 | 6

// ─── Provider definition (static metadata) ───────────────────────────────────

export interface DataProvider {
  id: string
  name: string
  shortName: string
  description: string
  category: 'hub' | 'wearable' | 'scale' | 'fitness' | 'nutrition'
  dataTypes: string[]
  primarySyncMethod: SyncMethod
  fallbackSyncMethod?: SyncMethod
  supportsAutoSync: boolean
  requiresOAuth: boolean
  hasOfficialApi: boolean
  apiStatus: 'public' | 'limited' | 'none' | 'deprecated'
  targetPhase: DataSourcePhase
  privacyNote: string
  setupNote?: string
  importFileType?: 'xml' | 'csv' | 'json' | 'zip'
  importInstructions?: string
}

// ─── Connection state (runtime, per-user) ────────────────────────────────────

export interface ConnectedApp {
  providerId: string
  status: ConnectionStatus
  syncMethod: SyncMethod
  lastSyncedAt: string | null
  lastSyncedRecordCount: number | null
  errorMessage?: string
  isEnabled: boolean
  oauthToken?: string  // never persisted in mock mode
}

// ─── Sync operation ───────────────────────────────────────────────────────────

export interface SyncStatus {
  providerId: string
  state: 'idle' | 'syncing' | 'success' | 'error'
  progress?: number     // 0–100
  message?: string
  startedAt?: string
  completedAt?: string
}

export interface SyncResult {
  providerId: string
  success: boolean
  recordsImported: number
  recordsUpdated: number
  errors: string[]
  durationMs: number
  syncedAt: string
}

// ─── Data model ───────────────────────────────────────────────────────────────

export interface HealthMetric {
  id: string
  type: string          // 'weight' | 'heart_rate' | 'sleep' | 'steps' | etc.
  value: number
  unit: string
  timestamp: string     // ISO 8601
  sourceProviderId: string
  sourceName: string
  isManualEntry: boolean
}

export interface ImportJob {
  id: string
  providerId: string
  fileName: string
  fileSizeBytes: number
  status: 'pending' | 'processing' | 'success' | 'error'
  recordsFound: number
  recordsImported: number
  errorMessage?: string
  startedAt: string
  completedAt?: string
}
