-- =====================================================================
-- RUPAREL ATTENDANCE ERP — RBAC: OWNER, ADMIN & MODERATOR ROLES
-- Migration: 20261009000006_roles_and_permissions.sql
-- Description: Creates public.user_profiles table, auto-seeds the first user
--              as Owner, sets up role-based access policies and triggers.
-- =====================================================================

-- 1. USER PROFILES TABLE
CREATE TABLE IF NOT EXISTS public.user_profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email VARCHAR(255) NOT NULL,
    full_name VARCHAR(255),
    role VARCHAR(20) NOT NULL DEFAULT 'moderator' CHECK (role IN ('owner', 'admin', 'moderator')),
    permissions JSONB NOT NULL DEFAULT '{
      "view_students": true,
      "edit_students": false,
      "delete_students": false,
      "view_attendance": true,
      "mark_attendance": true,
      "manage_batches": false,
      "manage_fees": false,
      "manage_exams": false,
      "manage_parents": false,
      "send_notifications": false,
      "export_data": false,
      "manage_users": false,
      "manage_settings": false
    }'::jsonb,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_user_profiles_role ON public.user_profiles(role);
CREATE INDEX IF NOT EXISTS idx_user_profiles_email ON public.user_profiles(email);

-- Updated at trigger
DROP TRIGGER IF EXISTS trigger_user_profiles_updated_at ON public.user_profiles;
CREATE TRIGGER trigger_user_profiles_updated_at BEFORE UPDATE ON public.user_profiles
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2. AUTOMATIC PROFILE PROVISIONING TRIGGER ON AUTH.USERS
CREATE OR REPLACE FUNCTION public.handle_new_user_profile()
RETURNS TRIGGER AS $$
DECLARE
    v_owner_count INTEGER;
    v_initial_role VARCHAR(20);
    v_initial_perms JSONB;
BEGIN
    -- Check how many owners currently exist
    SELECT count(*) INTO v_owner_count FROM public.user_profiles WHERE role = 'owner' AND is_active = true;
    
    -- If no active owner exists, the first user is guaranteed to become the Owner
    IF v_owner_count = 0 THEN
        v_initial_role := 'owner';
        v_initial_perms := '{
            "view_students": true,
            "edit_students": true,
            "delete_students": true,
            "view_attendance": true,
            "mark_attendance": true,
            "manage_batches": true,
            "manage_fees": true,
            "manage_exams": true,
            "manage_parents": true,
            "send_notifications": true,
            "export_data": true,
            "manage_users": true,
            "manage_settings": true
        }'::jsonb;
    ELSE
        -- Subsequent accounts default to moderator with conservative access
        v_initial_role := 'moderator';
        v_initial_perms := '{
            "view_students": true,
            "edit_students": false,
            "delete_students": false,
            "view_attendance": true,
            "mark_attendance": true,
            "manage_batches": false,
            "manage_fees": false,
            "manage_exams": false,
            "manage_parents": false,
            "send_notifications": false,
            "export_data": false,
            "manage_users": false,
            "manage_settings": false
        }'::jsonb;
    END IF;

    INSERT INTO public.user_profiles (id, email, full_name, role, permissions, is_active)
    VALUES (
        NEW.id,
        NEW.email,
        coalesce(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
        v_initial_role,
        v_initial_perms,
        true
    )
    ON CONFLICT (id) DO UPDATE SET
        email = EXCLUDED.email,
        full_name = coalesce(EXCLUDED.full_name, public.user_profiles.full_name);

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to hook on auth.users
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user_profile();

-- 3. SEED EXISTING USERS IN AUTH.USERS INTO USER_PROFILES
DO $$
DECLARE
    r RECORD;
    v_first BOOLEAN := true;
    v_has_owner BOOLEAN := false;
BEGIN
    SELECT EXISTS (SELECT 1 FROM public.user_profiles WHERE role = 'owner') INTO v_has_owner;

    FOR r IN SELECT id, email, raw_user_meta_data FROM auth.users ORDER BY created_at ASC LOOP
        IF NOT v_has_owner AND v_first THEN
            INSERT INTO public.user_profiles (id, email, full_name, role, permissions, is_active)
            VALUES (
                r.id,
                r.email,
                coalesce(r.raw_user_meta_data->>'full_name', 'System Owner'),
                'owner',
                '{"view_students": true, "edit_students": true, "delete_students": true, "view_attendance": true, "mark_attendance": true, "manage_batches": true, "manage_fees": true, "manage_exams": true, "manage_parents": true, "send_notifications": true, "export_data": true, "manage_users": true, "manage_settings": true}'::jsonb,
                true
            )
            ON CONFLICT (id) DO UPDATE SET role = 'owner';
            v_first := false;
            v_has_owner := true;
        ELSE
            INSERT INTO public.user_profiles (id, email, full_name, role, permissions, is_active)
            VALUES (
                r.id,
                r.email,
                coalesce(r.raw_user_meta_data->>'full_name', 'Staff Member'),
                'moderator',
                '{"view_students": true, "edit_students": false, "delete_students": false, "view_attendance": true, "mark_attendance": true, "manage_batches": false, "manage_fees": false, "manage_exams": false, "manage_parents": false, "send_notifications": false, "export_data": false, "manage_users": false, "manage_settings": false}'::jsonb,
                true
            )
            ON CONFLICT (id) DO NOTHING;
        END IF;
    END LOOP;
END $$;

-- 4. ROW LEVEL SECURITY POLICIES
ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;

-- Allow all authenticated users to read profiles (needed for UI session & displaying staff names)
DROP POLICY IF EXISTS "Authenticated users can view user_profiles" ON public.user_profiles;
CREATE POLICY "Authenticated users can view user_profiles"
    ON public.user_profiles FOR SELECT TO authenticated USING (true);

-- Allow users to update their own display name, or allow service_role / owner to update
DROP POLICY IF EXISTS "Users can update own display profile" ON public.user_profiles;
CREATE POLICY "Users can update own display profile"
    ON public.user_profiles FOR UPDATE TO authenticated
    USING (id = auth.uid() OR EXISTS (
        SELECT 1 FROM public.user_profiles p WHERE p.id = auth.uid() AND p.role = 'owner'
    ));

-- Allow service_role to insert/delete user profiles
DROP POLICY IF EXISTS "Service role manages user profiles" ON public.user_profiles;
CREATE POLICY "Service role manages user profiles"
    ON public.user_profiles FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Reload PostgREST schema cache
NOTIFY pgrst, 'reload schema';
