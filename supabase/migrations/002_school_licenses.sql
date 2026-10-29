-- =====================================================================
-- Migration 002: Dedicated school_licenses table (replaces courses LIC:% hack)
-- Run in Supabase SQL Editor
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.school_licenses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    license_key TEXT UNIQUE NOT NULL,
    school_name TEXT NOT NULL,
    contact_person TEXT DEFAULT 'Principal / Administrator',
    email TEXT DEFAULT '',
    phone TEXT DEFAULT '',
    status TEXT NOT NULL DEFAULT 'trial_active' CHECK (status IN ('trial_active', 'licensed', 'suspended', 'trial_expired', 'revoked', 'locked')),
    is_locked BOOLEAN NOT NULL DEFAULT false,
    days_remaining INTEGER NOT NULL DEFAULT 30 CHECK (days_remaining >= 0),
    max_students INTEGER NOT NULL DEFAULT 200 CHECK (max_students > 0),
    trial_started_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    trial_ends_at TIMESTAMPTZ NOT NULL DEFAULT (timezone('utc'::text, now()) + INTERVAL '30 days'),
    is_timer_visible BOOLEAN NOT NULL DEFAULT true,
    bound_device_id TEXT,
    bound_at TIMESTAMPTZ,
    notes TEXT DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_school_licenses_key ON public.school_licenses(license_key);
CREATE INDEX IF NOT EXISTS idx_school_licenses_status ON public.school_licenses(status);
CREATE INDEX IF NOT EXISTS idx_school_licenses_locked ON public.school_licenses(is_locked);

DROP TRIGGER IF EXISTS trigger_school_licenses_updated_at ON public.school_licenses;
CREATE TRIGGER trigger_school_licenses_updated_at BEFORE UPDATE ON public.school_licenses
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.school_licenses ENABLE ROW LEVEL SECURITY;

-- Policies: authenticated can read, service_role + master admins can write
DROP POLICY IF EXISTS "Authenticated can read licenses" ON public.school_licenses;
CREATE POLICY "Authenticated can read licenses"
    ON public.school_licenses FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Service role full access licenses" ON public.school_licenses;
CREATE POLICY "Service role full access licenses"
    ON public.school_licenses FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Allow anon to read only non-sensitive fields for license validation RPC; direct table anon blocked
-- We expose via SECURITY DEFINER function get_license_for_validation
ALTER TABLE public.school_licenses ENABLE ROW LEVEL SECURITY;

-- RPC for clients to validate their own license without exposing all rows
CREATE OR REPLACE FUNCTION public.get_license_for_validation(p_license_key TEXT)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  rec RECORD;
BEGIN
  SELECT * INTO rec FROM public.school_licenses WHERE license_key = upper(trim(p_license_key)) LIMIT 1;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('found', false);
  END IF;
  RETURN jsonb_build_object(
    'found', true,
    'license_key', rec.license_key,
    'school_name', rec.school_name,
    'status', rec.status,
    'is_locked', rec.is_locked,
    'days_remaining', rec.days_remaining,
    'max_students', rec.max_students,
    'trial_started_at', rec.trial_started_at,
    'trial_ends_at', rec.trial_ends_at,
    'is_timer_visible', rec.is_timer_visible,
    'bound_device_id', rec.bound_device_id,
    'bound_at', rec.bound_at
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_license_for_validation(TEXT) TO anon, authenticated, service_role;

-- RPC to migrate legacy courses LIC:% rows into school_licenses
CREATE OR REPLACE FUNCTION public.migrate_legacy_licenses()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r RECORD;
  payload jsonb;
  migrated int := 0;
  skipped int := 0;
BEGIN
  FOR r IN SELECT * FROM public.courses WHERE code LIKE 'LIC:%' LOOP
    BEGIN
      payload := r.description::jsonb;
    EXCEPTION WHEN OTHERS THEN
      payload := '{}'::jsonb;
    END;
    INSERT INTO public.school_licenses (
      license_key, school_name, contact_person, email, phone, status, is_locked,
      days_remaining, max_students, trial_started_at, trial_ends_at, is_timer_visible,
      bound_device_id, bound_at, notes
    ) VALUES (
      COALESCE(payload->>'license_key', payload->>'licenseKey', replace(r.code, 'LIC:', '')),
      COALESCE(payload->>'school_name', payload->>'schoolName', regexp_replace(r.name, '\s*\[.*\]', '')),
      COALESCE(payload->>'contact_person', payload->>'contactPerson', 'Principal / Administrator'),
      COALESCE(payload->>'email', ''),
      COALESCE(payload->>'phone', ''),
      CASE WHEN COALESCE(payload->>'is_locked', payload->>'isLocked', 'false') = 'true' OR r.is_active = false THEN 'suspended' ELSE COALESCE(payload->>'status', 'trial_active') END,
      COALESCE((payload->>'is_locked')::boolean, (payload->>'isLocked')::boolean, NOT r.is_active, false),
      COALESCE((payload->>'days_remaining')::int, (payload->>'daysRemaining')::int, 30),
      COALESCE((payload->>'max_students')::int, (payload->>'maxStudents')::int, 200),
      COALESCE((payload->>'trial_started_at')::timestamptz, (payload->>'trialStartedAt')::timestamptz, r.created_at),
      COALESCE((payload->>'trial_ends_at')::timestamptz, (payload->>'trialEndsAt')::timestamptz, r.created_at + INTERVAL '30 days'),
      COALESCE((payload->>'is_timer_visible')::boolean, (payload->>'isTimerVisible')::boolean, true),
      COALESCE(payload->>'bound_device_id', payload->>'activated_device_id', NULL),
      COALESCE((payload->>'bound_at')::timestamptz, NULL),
      COALESCE(payload->>'notes', '')
    ) ON CONFLICT (license_key) DO NOTHING;
    IF FOUND THEN migrated := migrated + 1; ELSE skipped := skipped + 1; END IF;
  END LOOP;
  RETURN jsonb_build_object('migrated', migrated, 'skipped', skipped);
END;
$$;

GRANT EXECUTE ON FUNCTION public.migrate_legacy_licenses() TO service_role;

-- Enable realtime for instant sync to EXE/APK
ALTER PUBLICATION supabase_realtime ADD TABLE public.school_licenses;

-- Grant selects
GRANT SELECT ON public.school_licenses TO authenticated;
GRANT SELECT ON public.school_licenses TO service_role;

NOTIFY pgrst, 'reload schema';
