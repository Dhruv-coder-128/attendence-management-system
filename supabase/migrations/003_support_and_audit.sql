-- Migration 003: Support contact in academy_settings + audit log

-- Add support contact JSON to academy_settings for dynamic branding
ALTER TABLE public.academy_settings ADD COLUMN IF NOT EXISTS support_contact JSONB DEFAULT NULL;
-- Example: {"name":"Support Team","email":"support@school.edu","phone":"+91 ...","whatsapp":"+91 ..."}

-- Audit log for license changes
CREATE TABLE IF NOT EXISTS public.license_audit_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    license_key TEXT NOT NULL,
    action TEXT NOT NULL, -- create, update_days, lock, unlock, capacity_change, unbind, delete
    old_value JSONB,
    new_value JSONB,
    performed_by TEXT, -- email of admin who performed action
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);
CREATE INDEX IF NOT EXISTS idx_license_audit_key ON public.license_audit_log(license_key);
CREATE INDEX IF NOT EXISTS idx_license_audit_created ON public.license_audit_log(created_at DESC);

ALTER TABLE public.license_audit_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated can read audit log" ON public.license_audit_log;
CREATE POLICY "Authenticated can read audit log"
    ON public.license_audit_log FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Service role writes audit log" ON public.license_audit_log;
CREATE POLICY "Service role writes audit log"
    ON public.license_audit_log FOR ALL TO service_role USING (true) WITH CHECK (true);

GRANT SELECT ON public.license_audit_log TO authenticated, service_role;
GRANT INSERT ON public.license_audit_log TO service_role;

-- Extend academy_settings support contact update policy to allow service_role
-- (academy_settings already has anon SELECT, we keep it)

NOTIFY pgrst, 'reload schema';
