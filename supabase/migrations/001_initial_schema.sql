-- Shakthi Journal — Initial Supabase Schema
-- Run this in: Supabase Dashboard → SQL Editor → New query → paste and run
--
-- Pattern: each table stores the full local record as JSONB (data column)
-- plus a top-level updated_at for conflict resolution.
-- Row Level Security ensures each user only sees their own data.

-- ─── Helpers ──────────────────────────────────────────────────────────────────

-- Automatically update updated_at on row change
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ─── workouts ─────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.workouts (
  id         text        NOT NULL,
  user_id    uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  updated_at timestamptz NOT NULL DEFAULT now(),
  data       jsonb       NOT NULL,
  PRIMARY KEY (user_id, id)
);

ALTER TABLE public.workouts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users own their workouts"
  ON public.workouts FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS workouts_user_id_idx ON public.workouts(user_id);
CREATE INDEX IF NOT EXISTS workouts_updated_at_idx ON public.workouts(updated_at);

-- ─── nutrition_entries ────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.nutrition_entries (
  id         text        NOT NULL,
  user_id    uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  updated_at timestamptz NOT NULL DEFAULT now(),
  data       jsonb       NOT NULL,
  PRIMARY KEY (user_id, id)
);

ALTER TABLE public.nutrition_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users own their nutrition entries"
  ON public.nutrition_entries FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS nutrition_entries_user_id_idx ON public.nutrition_entries(user_id);
CREATE INDEX IF NOT EXISTS nutrition_entries_updated_at_idx ON public.nutrition_entries(updated_at);

-- ─── daily_logs ───────────────────────────────────────────────────────────────
-- Local key is YYYY-MM-DD date string

CREATE TABLE IF NOT EXISTS public.daily_logs (
  id         text        NOT NULL,   -- the date string, e.g. '2026-06-29'
  user_id    uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  updated_at timestamptz NOT NULL DEFAULT now(),
  data       jsonb       NOT NULL,
  PRIMARY KEY (user_id, id)
);

ALTER TABLE public.daily_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users own their daily logs"
  ON public.daily_logs FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS daily_logs_user_id_idx ON public.daily_logs(user_id);
CREATE INDEX IF NOT EXISTS daily_logs_updated_at_idx ON public.daily_logs(updated_at);

-- ─── health_metrics ───────────────────────────────────────────────────────────
-- Local key is ${type}_${date}

CREATE TABLE IF NOT EXISTS public.health_metrics (
  id         text        NOT NULL,
  user_id    uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  updated_at timestamptz NOT NULL DEFAULT now(),
  data       jsonb       NOT NULL,
  PRIMARY KEY (user_id, id)
);

ALTER TABLE public.health_metrics ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users own their health metrics"
  ON public.health_metrics FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS health_metrics_user_id_idx ON public.health_metrics(user_id);
CREATE INDEX IF NOT EXISTS health_metrics_updated_at_idx ON public.health_metrics(updated_at);

-- ─── profiles ─────────────────────────────────────────────────────────────────
-- One row per user (local key is 'main')

CREATE TABLE IF NOT EXISTS public.profiles (
  user_id    uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  updated_at timestamptz NOT NULL DEFAULT now(),
  data       jsonb       NOT NULL
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users own their profile"
  ON public.profiles FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ─── user_settings ────────────────────────────────────────────────────────────
-- Local key is the setting key string

CREATE TABLE IF NOT EXISTS public.user_settings (
  id         text        NOT NULL,   -- setting key string
  user_id    uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  updated_at timestamptz NOT NULL DEFAULT now(),
  data       jsonb       NOT NULL,
  PRIMARY KEY (user_id, id)
);

ALTER TABLE public.user_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users own their settings"
  ON public.user_settings FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ─── training_profiles ────────────────────────────────────────────────────────
-- One row per user (local key is 'main')

CREATE TABLE IF NOT EXISTS public.training_profiles (
  user_id    uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  updated_at timestamptz NOT NULL DEFAULT now(),
  data       jsonb       NOT NULL
);

ALTER TABLE public.training_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users own their training profile"
  ON public.training_profiles FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ─── workout_plans ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.workout_plans (
  id         text        NOT NULL,
  user_id    uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  updated_at timestamptz NOT NULL DEFAULT now(),
  data       jsonb       NOT NULL,
  PRIMARY KEY (user_id, id)
);

ALTER TABLE public.workout_plans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users own their workout plans"
  ON public.workout_plans FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ─── exercise_library ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.exercise_library (
  id         text        NOT NULL,
  user_id    uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  updated_at timestamptz NOT NULL DEFAULT now(),
  data       jsonb       NOT NULL,
  PRIMARY KEY (user_id, id)
);

ALTER TABLE public.exercise_library ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users own their exercise library"
  ON public.exercise_library FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ─── workout_templates ────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.workout_templates (
  id         text        NOT NULL,
  user_id    uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  updated_at timestamptz NOT NULL DEFAULT now(),
  data       jsonb       NOT NULL,
  PRIMARY KEY (user_id, id)
);

ALTER TABLE public.workout_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users own their workout templates"
  ON public.workout_templates FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ─── sync_history_cloud ───────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.sync_history_cloud (
  id         text        NOT NULL,
  user_id    uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  updated_at timestamptz NOT NULL DEFAULT now(),
  data       jsonb       NOT NULL,
  PRIMARY KEY (user_id, id)
);

ALTER TABLE public.sync_history_cloud ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users own their sync history"
  ON public.sync_history_cloud FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ─── Verification ─────────────────────────────────────────────────────────────
-- Run this to confirm all tables were created:
-- SELECT table_name FROM information_schema.tables WHERE table_schema = 'public';
