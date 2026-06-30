import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { Heart, User, Footprints, Download } from 'lucide-react'

import { AuthProvider } from './context/AuthContext'
import AuthGate from './components/AuthGate'
import Layout from './layout/Layout'
import Dashboard from './pages/Dashboard'
import Profile from './pages/Profile'
import Progress from './pages/Progress'
import AICoach from './pages/AICoach'
import ComingSoon from './pages/ComingSoon'
import ImportPage from './components/ImportPage'
import ConnectedAccounts from './pages/ConnectedAccounts'
import SyncHistory from './pages/SyncHistory'
import Settings from './pages/Settings'
import DevDiagnostics from './pages/DevDiagnostics'
import StravaCallback from './pages/StravaCallback'
import ImportAppleHealth from './pages/ImportAppleHealth'
import ComparePage from './pages/ComparePage'
import DailyLog from './pages/DailyLog'
import WorkoutsPage from './pages/WorkoutsPage'
import WorkoutHistoryPage from './pages/WorkoutHistoryPage'
import NutritionPage from './pages/NutritionPage'
import AthleticGoals from './pages/AthleticGoals'
import DashboardSettings from './pages/DashboardSettings'
import WorkoutPlanPage from './pages/WorkoutPlanPage'
import ExerciseLibraryPage from './pages/ExerciseLibraryPage'
import WorkoutProgressPage from './pages/WorkoutProgressPage'
import WorkoutTemplatesPage from './pages/WorkoutTemplatesPage'
import RecoveryPage from './pages/RecoveryPage'
import Timeline from './pages/Timeline'
import BackupRestorePage from './pages/BackupRestorePage'
import AuthPage from './pages/AuthPage'
import MergeDialog from './pages/MergeDialog'
import OnboardingPage from './pages/OnboardingPage'
import SyncTestPage from './pages/SyncTestPage'

import './styles/globals.css'

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <MergeDialog />
      <Routes>
        {/* Auth routes — outside Layout shell */}
        <Route path="/auth" element={<AuthGate><AuthPage /></AuthGate>} />
        <Route path="/auth/callback" element={<AuthGate><AuthPage /></AuthGate>} />

        {/* Onboarding — outside Layout shell so the redirect loop can't fire */}
        <Route path="/onboarding" element={<OnboardingPage />} />

        {/* OAuth callbacks live outside the main Layout shell */}
        <Route path="/oauth/strava/callback" element={<StravaCallback />} />

        <Route element={<Layout />}>
          <Route path="/" element={<Dashboard />} />
          <Route path="/profile" element={<Profile />} />
          <Route path="/progress" element={<Progress />} />
          <Route path="/ai-coach" element={<AICoach />} />
          <Route path="/import" element={<ImportPage />} />
          <Route path="/import/apple-health" element={<ImportAppleHealth />} />
          <Route path="/compare" element={<ComparePage />} />
          <Route path="/log" element={<DailyLog />} />

          {/* Settings & data management — accessible from Settings page */}
          <Route path="/connected-accounts" element={<ConnectedAccounts />} />
          <Route path="/connected-apps" element={<Navigate to="/connected-accounts" replace />} />
          <Route path="/sync-history" element={<SyncHistory />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/settings/backup" element={<BackupRestorePage />} />
          <Route path="/dashboard-settings" element={<DashboardSettings />} />
          <Route path="/dev" element={<DevDiagnostics />} />
          <Route path="/dev/sync-test" element={<SyncTestPage />} />

          {/* Core health pages */}
          <Route path="/health" element={<ComingSoon icon={Heart} title="Health Overview" description="A unified view of all your health metrics — heart rate, HRV, VO2 max, blood work, and more." accentColor="var(--red)" />} />
          <Route path="/recovery" element={<RecoveryPage />} />
          <Route path="/sleep" element={<Navigate to="/recovery" replace />} />
          <Route path="/nutrition" element={<NutritionPage />} />

          {/* Workouts — tabs handled within pages */}
          <Route path="/workouts" element={<WorkoutsPage />} />
          <Route path="/workouts/plan" element={<WorkoutPlanPage />} />
          <Route path="/workouts/history" element={<WorkoutHistoryPage />} />
          <Route path="/workouts/progress" element={<WorkoutProgressPage />} />
          <Route path="/workouts/templates" element={<WorkoutTemplatesPage />} />
          <Route path="/workouts/library" element={<ExerciseLibraryPage />} />

          {/* Goals */}
          <Route path="/goals" element={<AthleticGoals />} />
          <Route path="/athletic-goals" element={<Navigate to="/goals" replace />} />

          {/* Stubs — not in main nav, accessible via direct link */}
          <Route path="/body" element={<ComingSoon icon={User} title="Body Composition" description="Weight, body fat %, muscle mass, and visceral fat history from your RENPHO scale." accentColor="var(--teal)" />} />
          <Route path="/running" element={<ComingSoon icon={Footprints} title="Running" description="Pace, distance, heart rate zones, and GPS routes from Strava and Apple Health." accentColor="var(--orange)" />} />
          <Route path="/timeline" element={<Timeline />} />
          <Route path="/import2" element={<ComingSoon icon={Download} title="Import Data" description="" />} />
        </Route>
      </Routes>
      </AuthProvider>
    </BrowserRouter>
  )
}
