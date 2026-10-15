-- =====================================================================
-- RUPAREL ATTENDANCE ERP — ACADEMY BRANDING & INSTITUTION SETTINGS
-- Migration: 20261009000007_academy_branding.sql
-- Description: Creates public.academy_settings table to store white-label
--              academy profile, branch, contact info, logo, and policies.
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.academy_settings (
    id VARCHAR(50) PRIMARY KEY DEFAULT 'default',
    academy_name VARCHAR(255) NOT NULL DEFAULT 'Ruparel Attendance ERP Academy',
    branch_name VARCHAR(255) NOT NULL DEFAULT 'Central Campus — Main Wing',
    address TEXT DEFAULT '123 Education Hub, MG Road, Mumbai, Maharashtra 400001',
    phone VARCHAR(50) DEFAULT '+91 98765 43210',
    email VARCHAR(255) DEFAULT 'contact@ruparel.edu',
    logo_url TEXT DEFAULT '',
    tagline VARCHAR(255) DEFAULT 'Excellence in Higher Secondary & College Education • Estd. 2018',
    academic_year VARCHAR(50) DEFAULT 'AY 2026-27 (Term 1)',
    min_attendance_threshold INTEGER DEFAULT 75,
    late_grace_minutes INTEGER DEFAULT 15,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- Trigger for updated_at
DROP TRIGGER IF EXISTS trigger_academy_settings_updated_at ON public.academy_settings;
CREATE TRIGGER trigger_academy_settings_updated_at BEFORE UPDATE ON public.academy_settings
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Enable Row Level Security
ALTER TABLE public.academy_settings ENABLE ROW LEVEL SECURITY;

-- Allow all authenticated users and anon to read academy branding (needed for report cards, fee receipts, and login)
DROP POLICY IF EXISTS "Anyone can view academy settings" ON public.academy_settings;
CREATE POLICY "Anyone can view academy settings"
    ON public.academy_settings FOR SELECT TO authenticated, anon USING (true);

-- Allow service_role or Owner to update academy branding
DROP POLICY IF EXISTS "Owners and service_role can update academy settings" ON public.academy_settings;
CREATE POLICY "Owners and service_role can update academy settings"
    ON public.academy_settings FOR ALL TO authenticated, service_role
    USING (
        auth.role() = 'service_role' OR EXISTS (
            SELECT 1 FROM public.user_profiles p WHERE p.id = auth.uid() AND p.role = 'owner'
        )
    )
    WITH CHECK (
        auth.role() = 'service_role' OR EXISTS (
            SELECT 1 FROM public.user_profiles p WHERE p.id = auth.uid() AND p.role = 'owner'
        )
    );

-- Grant permissions
GRANT SELECT, INSERT, UPDATE ON public.academy_settings TO anon, authenticated, service_role;

-- Seed default initial row
INSERT INTO public.academy_settings (id, academy_name, branch_name, address, phone, email, tagline)
VALUES (
    'default',
    'Ruparel Attendance ERP Academy',
    'Central Campus — Main Wing',
    '123 Education Hub, MG Road, Mumbai, Maharashtra 400001',
    '+91 98765 43210',
    'contact@ruparel.edu',
    'Excellence in Higher Secondary & College Education • Estd. 2018'
)
ON CONFLICT (id) DO NOTHING;

-- Reload schema cache
NOTIFY pgrst, 'reload schema';
