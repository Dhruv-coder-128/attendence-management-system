-- =====================================================================
-- SMS — License server cutover
-- Moves licenses out of public.courses ("LIC:<key>" rows with JSON in description)
-- into public.school_licenses, which only the service role can access.
-- Safe to run more than once. Run in Supabase SQL editor BEFORE deploying the new /api code.
-- =====================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.school_licenses (
    id VARCHAR(64) PRIMARY KEY,
    school_name VARCHAR(255) NOT NULL,
    license_key VARCHAR(128) NOT NULL UNIQUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.school_licenses
    ADD COLUMN IF NOT EXISTS kind VARCHAR(32) NOT NULL DEFAULT 'school', -- school | universal_trial | grace
    ADD COLUMN IF NOT EXISTS school_supabase_url TEXT,
    ADD COLUMN IF NOT EXISTS school_supabase_anon_key TEXT,
    ADD COLUMN IF NOT EXISTS is_activated BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS trial_started_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS trial_ends_at TIMESTAMPTZ,           -- NULL + status 'licensed' = lifetime
    ADD COLUMN IF NOT EXISTS status VARCHAR(32) NOT NULL DEFAULT 'trial_active', -- trial_active | licensed (expiry is derived from trial_ends_at)
    ADD COLUMN IF NOT EXISTS is_locked BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS activated_device_id TEXT,
    ADD COLUMN IF NOT EXISTS bound_device_id TEXT,
    ADD COLUMN IF NOT EXISTS device_grants JSONB NOT NULL DEFAULT '{}'::jsonb, -- per-device grants for universal/grace keys
    ADD COLUMN IF NOT EXISTS max_students INTEGER NOT NULL DEFAULT 200,
    ADD COLUMN IF NOT EXISTS is_timer_visible BOOLEAN NOT NULL DEFAULT TRUE,
    ADD COLUMN IF NOT EXISTS contact_person TEXT DEFAULT '',
    ADD COLUMN IF NOT EXISTS email TEXT DEFAULT '',
    ADD COLUMN IF NOT EXISTS phone TEXT DEFAULT '',
    ADD COLUMN IF NOT EXISTS last_validated_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS notes TEXT DEFAULT '';

-- Older migration made these NOT NULL; schools on the shared database have no own URL.
ALTER TABLE public.school_licenses ALTER COLUMN school_supabase_url DROP NOT NULL;
ALTER TABLE public.school_licenses ALTER COLUMN school_supabase_anon_key DROP NOT NULL;

ALTER TABLE public.school_licenses ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Deny all public direct access to school_licenses" ON public.school_licenses;
CREATE POLICY "Deny all public direct access to school_licenses"
    ON public.school_licenses FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);
REVOKE ALL ON public.school_licenses FROM anon, authenticated;

-- Helpers that never throw on bad legacy JSON
CREATE OR REPLACE FUNCTION pg_temp.safe_jsonb(t TEXT) RETURNS JSONB LANGUAGE plpgsql AS $$
BEGIN RETURN coalesce(t, '{}')::jsonb; EXCEPTION WHEN others THEN RETURN '{}'::jsonb; END $$;
CREATE OR REPLACE FUNCTION pg_temp.safe_ts(t TEXT) RETURNS TIMESTAMPTZ LANGUAGE plpgsql AS $$
BEGIN RETURN t::timestamptz; EXCEPTION WHEN others THEN RETURN NULL; END $$;
CREATE OR REPLACE FUNCTION pg_temp.safe_int(t TEXT) RETURNS INTEGER LANGUAGE plpgsql AS $$
BEGIN RETURN t::numeric::int; EXCEPTION WHEN others THEN RETURN NULL; END $$;

-- Copy legacy license rows out of courses
WITH legacy AS (
    SELECT c.*, upper(substr(c.code, 5)) AS k, pg_temp.safe_jsonb(c.description) AS d
    FROM public.courses c
    WHERE c.code LIKE 'LIC:%'
), shaped AS (
    SELECT
        l.*,
        coalesce(pg_temp.safe_int(d->>'days_remaining'), pg_temp.safe_int(d->>'daysRemaining')) AS days,
        coalesce(pg_temp.safe_ts(d->>'trial_ends_at'), pg_temp.safe_ts(d->>'trialEndsAt')) AS ends
    FROM legacy l
)
INSERT INTO public.school_licenses (
    id, license_key, kind, school_name, contact_person, email, phone, status, is_locked, is_activated,
    trial_started_at, trial_ends_at, bound_device_id, activated_device_id, max_students, is_timer_visible,
    device_grants, notes, created_at, updated_at
)
SELECT
    'LIC-' || k,
    k,
    CASE k WHEN 'SMS-FREE-TRIAL-30D' THEN 'universal_trial' WHEN 'SMS-GRACE-5D' THEN 'grace' ELSE 'school' END,
    coalesce(nullif(d->>'school_name', ''), nullif(d->>'schoolName', ''), nullif(trim(regexp_replace(name, '\s*\[.*\]', '')), ''), 'SMS Client School'),
    coalesce(d->>'contact_person', d->>'contactPerson', ''),
    coalesce(d->>'email', ''),
    coalesce(d->>'phone', ''),
    CASE WHEN d->>'status' = 'licensed' OR days >= 9000 THEN 'licensed' ELSE 'trial_active' END,
    coalesce(d->>'is_locked', '') = 'true' OR coalesce(d->>'isLocked', '') = 'true'
        OR coalesce(d->>'status', '') = 'suspended' OR NOT coalesce(is_active, true),
    coalesce(d->>'bound_device_id', d->>'activated_device_id') IS NOT NULL,
    coalesce(pg_temp.safe_ts(d->>'trial_started_at'), pg_temp.safe_ts(d->>'trialStartedAt'), created_at),
    CASE
        WHEN days >= 9000 THEN NULL
        WHEN d->>'status' = 'trial_expired' THEN coalesce(ends, now())
        ELSE coalesce(ends, now() + make_interval(days => coalesce(days, 30)))
    END,
    coalesce(d->>'bound_device_id', d->>'activated_device_id'),
    coalesce(d->>'bound_device_id', d->>'activated_device_id'),
    coalesce(pg_temp.safe_int(d->>'max_students'), pg_temp.safe_int(d->>'maxStudents'), 200),
    coalesce(d->>'is_timer_visible', d->>'isTimerVisible', 'true') <> 'false',
    coalesce(d->'activated_devices', d->'authorized_devices', '{}'::jsonb),
    coalesce(d->>'notes', ''),
    coalesce(created_at, now()),
    now()
FROM shaped
ON CONFLICT (license_key) DO NOTHING;

-- Universal keys must exist as rows
INSERT INTO public.school_licenses (id, license_key, kind, school_name, status, is_timer_visible, max_students)
VALUES
    ('LIC-SMS-FREE-TRIAL-30D', 'SMS-FREE-TRIAL-30D', 'universal_trial', 'Universal 30-Day Trial', 'trial_active', TRUE, 5000),
    ('LIC-SMS-GRACE-5D', 'SMS-GRACE-5D', 'grace', 'Emergency 5-Day Grace', 'trial_active', TRUE, 5000)
ON CONFLICT (license_key) DO UPDATE SET kind = EXCLUDED.kind;

-- Licenses no longer live in courses (they were readable/writable by every logged-in user)
DELETE FROM public.courses WHERE code LIKE 'LIC:%';

COMMIT;
