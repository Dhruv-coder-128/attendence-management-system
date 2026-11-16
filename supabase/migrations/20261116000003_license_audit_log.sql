-- =====================================================================
-- SMS — Admin panel audit log
-- Every change made in the /admin panel (create / edit / lock / extend / delete ...) is recorded here.
-- Server-only: no access for anon or logged-in school users. Safe to run more than once.
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.license_audit_log (
    id BIGSERIAL PRIMARY KEY,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    action TEXT NOT NULL,          -- create | update | set_days | set_lock | set_timer | set_tier | reset_device | delete
    license_key TEXT,
    school_name TEXT,              -- copied at write time so the entry stays readable after a delete
    details JSONB NOT NULL DEFAULT '{}'::jsonb,
    ip TEXT
);

CREATE INDEX IF NOT EXISTS idx_license_audit_created ON public.license_audit_log (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_license_audit_key ON public.license_audit_log (license_key);

ALTER TABLE public.license_audit_log ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.license_audit_log FROM anon, authenticated;
REVOKE ALL ON SEQUENCE public.license_audit_log_id_seq FROM anon, authenticated;
DROP POLICY IF EXISTS license_audit_service ON public.license_audit_log;
CREATE POLICY license_audit_service ON public.license_audit_log FOR ALL TO service_role USING (true) WITH CHECK (true);
