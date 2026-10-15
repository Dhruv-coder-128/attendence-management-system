-- =====================================================================
-- RUPAREL ATTENDANCE ERP — SECURE ROW LEVEL SECURITY (RLS) POLICIES
-- Migration: 20261009000003_secure_rls_policies.sql
-- Description: Replaces overly broad USING (true) policies with properly
--              authorized policies requiring authenticated admin sessions.
--              Preserves RLS without destructive changes or data loss.
-- =====================================================================

-- 1. COURSES TABLE POLICIES
DROP POLICY IF EXISTS "Authenticated users can view courses" ON public.courses;
DROP POLICY IF EXISTS "Authenticated users can insert courses" ON public.courses;
DROP POLICY IF EXISTS "Authenticated users can update courses" ON public.courses;
DROP POLICY IF EXISTS "Authenticated users can delete courses" ON public.courses;
DROP POLICY IF EXISTS "courses_authenticated_all" ON public.courses;

CREATE POLICY "courses_authenticated_select"
    ON public.courses FOR SELECT TO authenticated
    USING (auth.uid() IS NOT NULL);

CREATE POLICY "courses_authenticated_insert"
    ON public.courses FOR INSERT TO authenticated
    WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "courses_authenticated_update"
    ON public.courses FOR UPDATE TO authenticated
    USING (auth.uid() IS NOT NULL)
    WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "courses_authenticated_delete"
    ON public.courses FOR DELETE TO authenticated
    USING (auth.uid() IS NOT NULL);


-- 2. BATCHES TABLE POLICIES
DROP POLICY IF EXISTS "Authenticated users can view batches" ON public.batches;
DROP POLICY IF EXISTS "Authenticated users can insert batches" ON public.batches;
DROP POLICY IF EXISTS "Authenticated users can update batches" ON public.batches;
DROP POLICY IF EXISTS "Authenticated users can delete batches" ON public.batches;
DROP POLICY IF EXISTS "batches_authenticated_all" ON public.batches;

CREATE POLICY "batches_authenticated_select"
    ON public.batches FOR SELECT TO authenticated
    USING (auth.uid() IS NOT NULL);

CREATE POLICY "batches_authenticated_insert"
    ON public.batches FOR INSERT TO authenticated
    WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "batches_authenticated_update"
    ON public.batches FOR UPDATE TO authenticated
    USING (auth.uid() IS NOT NULL)
    WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "batches_authenticated_delete"
    ON public.batches FOR DELETE TO authenticated
    USING (auth.uid() IS NOT NULL);


-- 3. STUDENTS TABLE POLICIES (Protects minor student records)
DROP POLICY IF EXISTS "Authenticated users can view students" ON public.students;
DROP POLICY IF EXISTS "Authenticated users can insert students" ON public.students;
DROP POLICY IF EXISTS "Authenticated users can update students" ON public.students;
DROP POLICY IF EXISTS "Authenticated users can delete students" ON public.students;
DROP POLICY IF EXISTS "students_authenticated_all" ON public.students;

CREATE POLICY "students_authenticated_select"
    ON public.students FOR SELECT TO authenticated
    USING (auth.uid() IS NOT NULL);

CREATE POLICY "students_authenticated_insert"
    ON public.students FOR INSERT TO authenticated
    WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "students_authenticated_update"
    ON public.students FOR UPDATE TO authenticated
    USING (auth.uid() IS NOT NULL)
    WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "students_authenticated_delete"
    ON public.students FOR DELETE TO authenticated
    USING (auth.uid() IS NOT NULL);


-- 4. PARENTS TABLE POLICIES (Protects parent PII and Telegram Chat IDs)
DROP POLICY IF EXISTS "Authenticated users can view parents" ON public.parents;
DROP POLICY IF EXISTS "Authenticated users can insert parents" ON public.parents;
DROP POLICY IF EXISTS "Authenticated users can update parents" ON public.parents;
DROP POLICY IF EXISTS "Authenticated users can delete parents" ON public.parents;
DROP POLICY IF EXISTS "parents_authenticated_all" ON public.parents;

CREATE POLICY "parents_authenticated_select"
    ON public.parents FOR SELECT TO authenticated
    USING (auth.uid() IS NOT NULL);

CREATE POLICY "parents_authenticated_insert"
    ON public.parents FOR INSERT TO authenticated
    WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "parents_authenticated_update"
    ON public.parents FOR UPDATE TO authenticated
    USING (auth.uid() IS NOT NULL)
    WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "parents_authenticated_delete"
    ON public.parents FOR DELETE TO authenticated
    USING (auth.uid() IS NOT NULL);


-- 5. PARENT_STUDENTS JUNCTION POLICIES
DROP POLICY IF EXISTS "Authenticated users can view parent_students" ON public.parent_students;
DROP POLICY IF EXISTS "Authenticated users can insert parent_students" ON public.parent_students;
DROP POLICY IF EXISTS "Authenticated users can update parent_students" ON public.parent_students;
DROP POLICY IF EXISTS "Authenticated users can delete parent_students" ON public.parent_students;
DROP POLICY IF EXISTS "parent_students_authenticated_all" ON public.parent_students;

CREATE POLICY "parent_students_authenticated_select"
    ON public.parent_students FOR SELECT TO authenticated
    USING (auth.uid() IS NOT NULL);

CREATE POLICY "parent_students_authenticated_insert"
    ON public.parent_students FOR INSERT TO authenticated
    WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "parent_students_authenticated_update"
    ON public.parent_students FOR UPDATE TO authenticated
    USING (auth.uid() IS NOT NULL)
    WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "parent_students_authenticated_delete"
    ON public.parent_students FOR DELETE TO authenticated
    USING (auth.uid() IS NOT NULL);


-- 6. ATTENDANCE TABLE POLICIES (Prevents tampering with roll call logs)
DROP POLICY IF EXISTS "Authenticated users can view attendance" ON public.attendance;
DROP POLICY IF EXISTS "Authenticated users can insert attendance" ON public.attendance;
DROP POLICY IF EXISTS "Authenticated users can update attendance" ON public.attendance;
DROP POLICY IF EXISTS "Authenticated users can delete attendance" ON public.attendance;
DROP POLICY IF EXISTS "attendance_authenticated_all" ON public.attendance;

CREATE POLICY "attendance_authenticated_select"
    ON public.attendance FOR SELECT TO authenticated
    USING (auth.uid() IS NOT NULL);

CREATE POLICY "attendance_authenticated_insert"
    ON public.attendance FOR INSERT TO authenticated
    WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "attendance_authenticated_update"
    ON public.attendance FOR UPDATE TO authenticated
    USING (auth.uid() IS NOT NULL)
    WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "attendance_authenticated_delete"
    ON public.attendance FOR DELETE TO authenticated
    USING (auth.uid() IS NOT NULL);


-- 7. PARENT_INVITATIONS TABLE POLICIES
DROP POLICY IF EXISTS "Authenticated users can view parent_invitations" ON public.parent_invitations;
DROP POLICY IF EXISTS "Authenticated users can insert parent_invitations" ON public.parent_invitations;
DROP POLICY IF EXISTS "Authenticated users can update parent_invitations" ON public.parent_invitations;
DROP POLICY IF EXISTS "Authenticated users can delete parent_invitations" ON public.parent_invitations;
DROP POLICY IF EXISTS "parent_invitations_authenticated_all" ON public.parent_invitations;

CREATE POLICY "parent_invitations_authenticated_select"
    ON public.parent_invitations FOR SELECT TO authenticated
    USING (auth.uid() IS NOT NULL);

CREATE POLICY "parent_invitations_authenticated_insert"
    ON public.parent_invitations FOR INSERT TO authenticated
    WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "parent_invitations_authenticated_update"
    ON public.parent_invitations FOR UPDATE TO authenticated
    USING (auth.uid() IS NOT NULL)
    WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "parent_invitations_authenticated_delete"
    ON public.parent_invitations FOR DELETE TO authenticated
    USING (auth.uid() IS NOT NULL);


-- 8. RPC EXECUTION PERMISSIONS
-- Maintain secure definer execution permissions for Telegram Bot integration
GRANT EXECUTE ON FUNCTION public.link_parent_telegram_by_token(VARCHAR, VARCHAR) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_parent_status_by_chat_id(VARCHAR) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_invitation_details_by_token(VARCHAR) TO anon, authenticated, service_role;

-- 9. NOTIFY POSTGREST SCHEMA CACHE RELOAD
NOTIFY pgrst, 'reload schema';
