-- =====================================================================
-- SMS — Role-based Row Level Security
-- Before: every logged-in user (including anyone who self-signs-up) could read and
-- write every table, and could promote themselves to owner.
-- After: access follows user_profiles.role / permissions, only for ACTIVE staff.
-- Mirrors the client rule in src/lib/authService.js hasPermission(): owner/admin = everything,
-- moderators = their permission flags.
-- Safe to run more than once.
-- =====================================================================

BEGIN;

-- 1. Helpers (SECURITY DEFINER so policies on user_profiles do not recurse)
CREATE OR REPLACE FUNCTION public.staff_role() RETURNS TEXT
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    SELECT role FROM public.user_profiles WHERE id = auth.uid() AND is_active = true
$$;

CREATE OR REPLACE FUNCTION public.staff_can(perm TEXT) RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.user_profiles
        WHERE id = auth.uid() AND is_active = true
          AND (role IN ('owner', 'admin') OR coalesce((permissions->>perm)::boolean, false))
    )
$$;

REVOKE ALL ON FUNCTION public.staff_role() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.staff_can(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.staff_role() TO authenticated;
GRANT EXECUTE ON FUNCTION public.staff_can(TEXT) TO authenticated;

-- 2. Self sign-ups after the first owner start INACTIVE until the owner approves them.
--    (Staff created by the owner through /api/manage-users are upserted with is_active = true.)
CREATE OR REPLACE FUNCTION public.handle_new_user_profile()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_is_first BOOLEAN;
BEGIN
    SELECT NOT EXISTS (SELECT 1 FROM public.user_profiles WHERE role = 'owner' AND is_active = true) INTO v_is_first;

    INSERT INTO public.user_profiles (id, email, full_name, role, permissions, is_active)
    VALUES (
        NEW.id,
        NEW.email,
        coalesce(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
        CASE WHEN v_is_first THEN 'owner' ELSE 'moderator' END,
        CASE WHEN v_is_first
            THEN '{"view_students":true,"edit_students":true,"delete_students":true,"view_attendance":true,"mark_attendance":true,"manage_batches":true,"manage_fees":true,"manage_exams":true,"manage_parents":true,"send_notifications":true,"export_data":true,"manage_users":true,"manage_settings":true}'::jsonb
            ELSE '{"view_students":true,"view_attendance":true,"mark_attendance":true}'::jsonb
        END,
        v_is_first
    )
    ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email;
    RETURN NEW;
END $$;

-- 3. Drop every existing policy on the data tables, then recreate role-based ones.
DO $$
DECLARE
    pol RECORD;
BEGIN
    FOR pol IN
        SELECT policyname, tablename FROM pg_policies
        WHERE schemaname = 'public' AND tablename IN (
            'courses', 'batches', 'students', 'parents', 'parent_students', 'parent_invitations',
            'attendance', 'student_fees', 'exams', 'exam_marks', 'academy_settings', 'user_profiles'
        )
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', pol.policyname, pol.tablename);
    END LOOP;
END $$;

-- Helper to create the 4 policies for one table: (table, read check, write check, delete check)
CREATE OR REPLACE FUNCTION pg_temp.secure_table(t TEXT, read_sql TEXT, write_sql TEXT, delete_sql TEXT) RETURNS VOID
LANGUAGE plpgsql AS $$
BEGIN
    IF to_regclass('public.' || t) IS NULL THEN RETURN; END IF;
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (%s)', t || '_read', t, read_sql);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR INSERT TO authenticated WITH CHECK (%s)', t || '_insert', t, write_sql);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR UPDATE TO authenticated USING (%s) WITH CHECK (%s)', t || '_update', t, write_sql, write_sql);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR DELETE TO authenticated USING (%s)', t || '_delete', t, delete_sql);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR ALL TO service_role USING (true) WITH CHECK (true)', t || '_service', t);
END $$;

SELECT pg_temp.secure_table('courses',            'public.staff_role() IS NOT NULL',      'public.staff_can(''manage_batches'')',  'public.staff_can(''manage_batches'')');
SELECT pg_temp.secure_table('batches',            'public.staff_role() IS NOT NULL',      'public.staff_can(''manage_batches'')',  'public.staff_can(''manage_batches'')');
SELECT pg_temp.secure_table('students',           'public.staff_can(''view_students'')',  'public.staff_can(''edit_students'')',   'public.staff_can(''delete_students'')');
SELECT pg_temp.secure_table('parents',            'public.staff_can(''view_students'')',  'public.staff_can(''manage_parents'')',  'public.staff_can(''manage_parents'')');
SELECT pg_temp.secure_table('parent_students',    'public.staff_can(''view_students'')',  'public.staff_can(''manage_parents'')',  'public.staff_can(''manage_parents'')');
SELECT pg_temp.secure_table('parent_invitations', 'public.staff_can(''manage_parents'')', 'public.staff_can(''manage_parents'')',  'public.staff_can(''manage_parents'')');
SELECT pg_temp.secure_table('attendance',         'public.staff_can(''view_attendance'')','public.staff_can(''mark_attendance'')', 'public.staff_can(''mark_attendance'')');
SELECT pg_temp.secure_table('student_fees',       'public.staff_can(''manage_fees'')',    'public.staff_can(''manage_fees'')',     'public.staff_can(''manage_fees'')');
SELECT pg_temp.secure_table('exams',              'public.staff_role() IS NOT NULL',      'public.staff_can(''manage_exams'')',    'public.staff_can(''manage_exams'')');
SELECT pg_temp.secure_table('exam_marks',         'public.staff_role() IS NOT NULL',      'public.staff_can(''manage_exams'')',    'public.staff_can(''manage_exams'')');
SELECT pg_temp.secure_table('academy_settings',   'true',                                 'public.staff_can(''manage_settings'')', 'public.staff_can(''manage_settings'')');
SELECT pg_temp.secure_table('user_profiles',      'public.staff_role() IS NOT NULL OR id = auth.uid()', 'public.staff_role() = ''owner''', 'public.staff_role() = ''owner''');

-- Branding (school name / logo) is public so the parent portal login screen can show it.
DO $$
BEGIN
    IF to_regclass('public.academy_settings') IS NOT NULL THEN
        DROP POLICY IF EXISTS academy_settings_public_read ON public.academy_settings;
        CREATE POLICY academy_settings_public_read ON public.academy_settings FOR SELECT TO anon USING (true);
    END IF;
END $$;

-- 4. Parent portal: the anonymous phone-number lookup RPC is replaced by /api/parent-portal-auth (Telegram OTP).
DO $$
BEGIN
    IF to_regprocedure('public.parent_portal_authenticate(text, text)') IS NOT NULL THEN
        REVOKE EXECUTE ON FUNCTION public.parent_portal_authenticate(TEXT, TEXT) FROM PUBLIC, anon, authenticated;
    END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.parent_portal_otps (
    phone VARCHAR(10) PRIMARY KEY,
    code_hash TEXT NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    attempts INTEGER NOT NULL DEFAULT 0
);
ALTER TABLE public.parent_portal_otps ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.parent_portal_otps FROM anon, authenticated;
DROP POLICY IF EXISTS parent_portal_otps_service ON public.parent_portal_otps;
CREATE POLICY parent_portal_otps_service ON public.parent_portal_otps FOR ALL TO service_role USING (true) WITH CHECK (true);

COMMIT;
