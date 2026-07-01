# Supabase RLS Debug — health_metrics 403

## What causes the 403

HTTP 403 from `/rest/v1/health_metrics` means Supabase accepted the request (valid credentials) but Row Level Security blocked the write. This happens when either:

1. The RLS policy was never created on the table
2. The table was created through the Supabase UI (Table Editor) which enables RLS automatically but does not add any policies — leaving all access blocked by default

## Step 1 — Verify whether the policy exists

Run this in **Supabase Dashboard → SQL Editor → New query**:

```sql
SELECT policyname, cmd, qual, with_check
FROM pg_policies
WHERE tablename = 'health_metrics'
ORDER BY policyname;
```

**Expected output (one row):**

| policyname | cmd | qual | with_check |
|---|---|---|---|
| Users own their health metrics | ALL | (auth.uid() = user_id) | (auth.uid() = user_id) |

**If the result is empty**, the policy is missing. Run Step 2.

---

## Step 2 — Add the missing RLS policy

```sql
CREATE POLICY "Users own their health metrics"
  ON public.health_metrics FOR ALL
  USING      (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
```

This is additive — it does not drop any data, does not alter the table structure, and is safe to run at any time.

---

## Step 3 — Verify RLS is enabled on the table

```sql
SELECT relname, relrowsecurity
FROM pg_class
WHERE relname = 'health_metrics';
```

If `relrowsecurity` is `false`, enable it:

```sql
ALTER TABLE public.health_metrics ENABLE ROW LEVEL SECURITY;
```

---

## Step 4 — Verify the table schema matches what iOS sends

```sql
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'health_metrics'
ORDER BY ordinal_position;
```

Expected columns:

| column_name | data_type | is_nullable |
|---|---|---|
| id | text | NO |
| user_id | uuid | NO |
| updated_at | timestamp with time zone | NO |
| data | jsonb | NO |

The iOS app sends exactly these four columns. If the table has extra columns with `NOT NULL` and no default, inserts will fail.

---

## Step 5 — Test with a manual upsert

Replace `<your-user-uuid>` with your actual user ID (visible in Supabase Dashboard → Authentication → Users):

```sql
INSERT INTO public.health_metrics (id, user_id, updated_at, data)
VALUES (
  'test_2026-07-01',
  '<your-user-uuid>',
  now(),
  '{"id":"test_2026-07-01","date":"2026-07-01","type":"weight","value":80,"unit":"kg","sourceId":"apple_health","sourceName":"Apple Health","dataMode":"imported","importedAt":"2026-07-01T10:00:00Z"}'::jsonb
)
ON CONFLICT (user_id, id) DO UPDATE SET updated_at = now(), data = EXCLUDED.data;
```

If this succeeds, the table and policies are correct. The iOS 403 was caused by a missing policy (now fixed).

---

## Why the error message said "HTTP 403" with no detail

In the original iOS code, `upsertHealthMetrics` discarded the HTTP response body:

```swift
let (_, response) = try await URLSession.shared.data(for: req)  // body discarded
```

This is fixed in Phase iOS 1.2 — the body is now captured and shown in the "Show debug details" disclosure on the Dashboard error card.

---

## After fixing — test on iPhone

1. Open the app → tap **Sync Now**
2. If the policy was missing and you just added it, sync succeeds
3. Web dashboard updates immediately
