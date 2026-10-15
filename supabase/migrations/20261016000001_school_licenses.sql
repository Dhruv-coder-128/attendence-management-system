-- =====================================================================
-- SMS — STUDENT MANAGEMENT SYSTEM — SCHOOL LICENSING & MULTI-TENANCY
-- Migration: 20261016000001_school_licenses.sql
-- Description: Central server registry for school license keys, 30-day
-- trial lifecycle tracking, and school-specific Supabase database mappings.
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.school_licenses (
    id VARCHAR(64) PRIMARY KEY, -- e.g. 'SMS-SCH-2026-001'
    school_name VARCHAR(255) NOT NULL,
    license_key VARCHAR(128) NOT NULL UNIQUE, -- Unique cryptographic activation key
    school_supabase_url TEXT NOT NULL, -- School's individual Supabase URL
    school_supabase_anon_key TEXT NOT NULL, -- School's individual publishable/anon key (NEVER service_role!)
    is_activated BOOLEAN NOT NULL DEFAULT FALSE,
    trial_started_at TIMESTAMPTZ,
    trial_ends_at TIMESTAMPTZ,
    status VARCHAR(32) NOT NULL DEFAULT 'pending', -- 'pending', 'trial_active', 'trial_expired', 'licensed', 'suspended'
    activated_device_id TEXT,
    grace_period_hours INTEGER NOT NULL DEFAULT 24,
    last_validated_at TIMESTAMPTZ,
    contact_developer JSONB NOT NULL DEFAULT '{
        "name": "Dhruv Shah",
        "email": "dushah2007@gmail.com",
        "phone": "+91 98765 43210",
        "whatsapp": "+91 98765 43210"
    }'::jsonb,
    notes TEXT DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- Index on license_key for rapid server-side lookup
CREATE INDEX IF NOT EXISTS idx_school_licenses_key ON public.school_licenses (license_key);
CREATE INDEX IF NOT EXISTS idx_school_licenses_status ON public.school_licenses (status);

-- Enable Row Level Security (RLS)
ALTER TABLE public.school_licenses ENABLE ROW LEVEL SECURITY;

-- Security Policy:
-- Deny all direct client access (anon and authenticated).
-- Only trusted backend processes using service_role can read and update licenses.
DROP POLICY IF EXISTS "Deny all public direct access to school_licenses" ON public.school_licenses;
CREATE POLICY "Deny all public direct access to school_licenses"
    ON public.school_licenses FOR ALL TO anon, authenticated USING (false);

DROP POLICY IF EXISTS "Service role has full access to school_licenses" ON public.school_licenses;
CREATE POLICY "Service role has full access to school_licenses"
    ON public.school_licenses FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Insert Default/Primary School License if not exists
INSERT INTO public.school_licenses (
    id,
    school_name,
    license_key,
    school_supabase_url,
    school_supabase_anon_key,
    is_activated,
    trial_started_at,
    trial_ends_at,
    status,
    notes
) VALUES (
    'SMS-SCH-DEFAULT',
    'Ruparel / SMS Central Academy',
    'SMS-TRIAL-RUPAREL-2026',
    'https://uugvudqbwoyywzbjrfol.supabase.co',
    'sb_publishable_pd2n3DRFhFgn79-SW6FEPw_vqRz2Jut',
    TRUE,
    timezone('utc'::text, now()),
    timezone('utc'::text, now() + interval '30 days'),
    'trial_active',
    'Default school license for primary production deployment'
) ON CONFLICT (id) DO NOTHING;
