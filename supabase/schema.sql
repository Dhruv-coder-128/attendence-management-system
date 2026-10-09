-- =====================================================================
-- RUPAREL ATTENDANCE ERP — COMPLETE SUPABASE DATABASE SCHEMA
-- Path: supabase/schema.sql
-- Run this in your Supabase Dashboard -> SQL Editor -> New Query
-- =====================================================================

-- 0. Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- =====================================================================
-- 1. COURSES TABLE
-- Supports: 11th, 12th, FY, SY, TY, BCA, B.Sc, Commerce, and Arts
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.courses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code VARCHAR(50) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    level VARCHAR(50) NOT NULL, -- e.g., '11th', '12th', 'FY', 'SY', 'TY', 'BCA', 'Other'
    description TEXT,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- =====================================================================
-- 2. BATCHES TABLE
-- Groups students within a course into specific timing and room cohorts
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.batches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    course_id UUID NOT NULL REFERENCES public.courses(id) ON DELETE RESTRICT,
    name VARCHAR(255) NOT NULL,
    code VARCHAR(50) UNIQUE NOT NULL,
    academic_year VARCHAR(50) NOT NULL DEFAULT '2026-27',
    shift VARCHAR(50) DEFAULT 'Morning', -- e.g., 'Morning', 'Afternoon', 'Evening'
    timing VARCHAR(100),                -- e.g., '07:30 AM - 10:30 AM'
    classroom VARCHAR(100),             -- e.g., 'Room 101', 'LH-2'
    max_capacity INTEGER NOT NULL DEFAULT 60 CHECK (max_capacity > 0),
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- =====================================================================
-- 3. STUDENTS TABLE
-- Core student registry linked to Course and Batch
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.students (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    admission_no VARCHAR(50) UNIQUE NOT NULL,
    full_name VARCHAR(255) NOT NULL,
    roll_no VARCHAR(50),
    course_id UUID NOT NULL REFERENCES public.courses(id) ON DELETE RESTRICT,
    batch_id UUID NOT NULL REFERENCES public.batches(id) ON DELETE RESTRICT,
    gender VARCHAR(20) CHECK (gender IN ('Male', 'Female', 'Other')),
    dob DATE,
    email VARCHAR(255),
    phone VARCHAR(50),
    blood_group VARCHAR(10),
    address TEXT,
    enrollment_date DATE NOT NULL DEFAULT CURRENT_DATE,
    status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'suspended', 'graduated')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- =====================================================================
-- 4. PARENTS / GUARDIANS TABLE
-- Private guardian registry with Telegram chat ID integration support
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.parents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    full_name VARCHAR(255) NOT NULL,
    phone VARCHAR(50) NOT NULL,
    email VARCHAR(255),
    relationship VARCHAR(50) NOT NULL DEFAULT 'Parent', -- e.g., 'Father', 'Mother', 'Guardian'
    telegram_chat_id VARCHAR(100),                      -- Strictly private: for server-side alert routing
    preferred_notification_channel VARCHAR(20) NOT NULL DEFAULT 'telegram' 
        CHECK (preferred_notification_channel IN ('telegram', 'sms', 'whatsapp', 'email')),
    is_verified BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    CONSTRAINT uq_parents_phone_relationship UNIQUE(phone, relationship)
);

-- =====================================================================
-- 5. PARENT_STUDENTS (JUNCTION TABLE)
-- Supports 1 student linked to multiple parents (Father, Mother, Guardian)
-- and parents with multiple student wards
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.parent_students (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    parent_id UUID NOT NULL REFERENCES public.parents(id) ON DELETE CASCADE,
    student_id UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
    relationship VARCHAR(50) NOT NULL DEFAULT 'Parent',
    is_primary_contact BOOLEAN NOT NULL DEFAULT false,
    can_receive_alerts BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    CONSTRAINT uq_parent_student UNIQUE (parent_id, student_id)
);

-- =====================================================================
-- 6. ATTENDANCE TABLE
-- Daily roll call with constraint preventing duplicates per student/date/session
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.attendance (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
    batch_id UUID NOT NULL REFERENCES public.batches(id) ON DELETE RESTRICT,
    date DATE NOT NULL DEFAULT CURRENT_DATE,
    session_name VARCHAR(50) NOT NULL DEFAULT 'Regular', -- e.g., 'Regular', 'Morning Lecture', 'Lab'
    status VARCHAR(20) NOT NULL CHECK (status IN ('Present', 'Absent', 'Late', 'Excused')),
    time_in TIME,
    remarks TEXT,
    marked_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    telegram_notified BOOLEAN NOT NULL DEFAULT false,
    telegram_notified_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    -- Uniqueness constraint: prevents duplicate attendance record for same student, batch, date & session
    CONSTRAINT uq_student_attendance_session UNIQUE (student_id, batch_id, date, session_name)
);

-- =====================================================================
-- 7. PERFORMANCE INDEXES
-- =====================================================================
CREATE INDEX IF NOT EXISTS idx_batches_course_id ON public.batches(course_id);
CREATE INDEX IF NOT EXISTS idx_students_batch_id ON public.students(batch_id);
CREATE INDEX IF NOT EXISTS idx_students_course_id ON public.students(course_id);
CREATE INDEX IF NOT EXISTS idx_students_admission_no ON public.students(admission_no);
CREATE INDEX IF NOT EXISTS idx_attendance_batch_date ON public.attendance(batch_id, date);
CREATE INDEX IF NOT EXISTS idx_attendance_student_date ON public.attendance(student_id, date);
CREATE INDEX IF NOT EXISTS idx_parent_students_parent ON public.parent_students(parent_id);
CREATE INDEX IF NOT EXISTS idx_parent_students_student ON public.parent_students(student_id);
CREATE INDEX IF NOT EXISTS idx_parents_phone ON public.parents(phone);

-- =====================================================================
-- 8. AUTO-UPDATE TIMESTAMPS TRIGGER
-- =====================================================================
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = timezone('utc'::text, now());
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_courses_updated_at ON public.courses;
CREATE TRIGGER trigger_courses_updated_at BEFORE UPDATE ON public.courses
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS trigger_batches_updated_at ON public.batches;
CREATE TRIGGER trigger_batches_updated_at BEFORE UPDATE ON public.batches
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS trigger_students_updated_at ON public.students;
CREATE TRIGGER trigger_students_updated_at BEFORE UPDATE ON public.students
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS trigger_parents_updated_at ON public.parents;
CREATE TRIGGER trigger_parents_updated_at BEFORE UPDATE ON public.parents
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS trigger_attendance_updated_at ON public.attendance;
CREATE TRIGGER trigger_attendance_updated_at BEFORE UPDATE ON public.attendance
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =====================================================================
-- 9. ROW LEVEL SECURITY (RLS) POLICIES
-- Zero access for anonymous ('anon') users.
-- Full access for authenticated staff/admin users ('authenticated').
-- =====================================================================

-- Enable RLS on all 6 tables
ALTER TABLE public.courses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.students ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.parents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.parent_students ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attendance ENABLE ROW LEVEL SECURITY;

-- COURSES POLICIES
CREATE POLICY "Authenticated users can view courses"
    ON public.courses FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert courses"
    ON public.courses FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update courses"
    ON public.courses FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated users can delete courses"
    ON public.courses FOR DELETE TO authenticated USING (true);

-- BATCHES POLICIES
CREATE POLICY "Authenticated users can view batches"
    ON public.batches FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert batches"
    ON public.batches FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update batches"
    ON public.batches FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated users can delete batches"
    ON public.batches FOR DELETE TO authenticated USING (true);

-- STUDENTS POLICIES (Strictly inaccessible to anon users)
CREATE POLICY "Authenticated users can view students"
    ON public.students FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert students"
    ON public.students FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update students"
    ON public.students FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated users can delete students"
    ON public.students FOR DELETE TO authenticated USING (true);

-- PARENTS POLICIES (Protects phone numbers and private Telegram Chat IDs)
CREATE POLICY "Authenticated users can view parents"
    ON public.parents FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert parents"
    ON public.parents FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update parents"
    ON public.parents FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated users can delete parents"
    ON public.parents FOR DELETE TO authenticated USING (true);

-- PARENT_STUDENTS JUNCTION POLICIES
CREATE POLICY "Authenticated users can view parent_students"
    ON public.parent_students FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert parent_students"
    ON public.parent_students FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update parent_students"
    ON public.parent_students FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated users can delete parent_students"
    ON public.parent_students FOR DELETE TO authenticated USING (true);

-- ATTENDANCE POLICIES
CREATE POLICY "Authenticated users can view attendance"
    ON public.attendance FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert attendance"
    ON public.attendance FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update attendance"
    ON public.attendance FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated users can delete attendance"
    ON public.attendance FOR DELETE TO authenticated USING (true);

-- =====================================================================
-- 10. REFERENCE DATA: STANDARD COURSES & LEVELS
-- Adds common academic streams if not already existing
-- =====================================================================
INSERT INTO public.courses (code, name, level, description)
VALUES 
    ('11TH-SCI', '11th Standard — Science', '11th', 'Higher Secondary Science (Physics, Chemistry, Math/Bio)'),
    ('12TH-SCI', '12th Standard — Science', '12th', 'Higher Secondary Science Board & Competitive Prep'),
    ('11TH-COM', '11th Standard — Commerce', '11th', 'Higher Secondary Commerce with Accountancy & Math'),
    ('12TH-COM', '12th Standard — Commerce', '12th', 'Higher Secondary Commerce Board Examination'),
    ('FY-BCA', 'First Year — Bachelor of Computer Applications', 'FY', 'Undergraduate Computer Applications (Sem I & II)'),
    ('SY-BCA', 'Second Year — Bachelor of Computer Applications', 'SY', 'Undergraduate Computer Applications (Sem III & IV)'),
    ('TY-BCA', 'Third Year — Bachelor of Computer Applications', 'TY', 'Undergraduate Computer Applications (Sem V & VI)')
ON CONFLICT (code) DO NOTHING;

-- =====================================================================
-- 11. PARENT INVITATIONS & SECURE TELEGRAM LINKING
-- Supports bulk parent invitations, time-limited tokens, and atomic linking
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.parent_invitations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    parent_id UUID NOT NULL REFERENCES public.parents(id) ON DELETE CASCADE,
    token VARCHAR(64) UNIQUE NOT NULL,
    invitation_channel VARCHAR(20) NOT NULL DEFAULT 'telegram' CHECK (invitation_channel IN ('telegram', 'whatsapp', 'sms', 'manual')),
    invitation_status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (invitation_status IN ('pending', 'sent', 'failed', 'delivered')),
    linking_status VARCHAR(20) NOT NULL DEFAULT 'unlinked' CHECK (linking_status IN ('unlinked', 'linked', 'expired', 'revoked')),
    expires_at TIMESTAMPTZ NOT NULL DEFAULT (timezone('utc'::text, now()) + INTERVAL '7 days'),
    sent_at TIMESTAMPTZ,
    linked_at TIMESTAMPTZ,
    last_error TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_parent_invitations_parent_id ON public.parent_invitations(parent_id);
CREATE INDEX IF NOT EXISTS idx_parent_invitations_token ON public.parent_invitations(token);
CREATE INDEX IF NOT EXISTS idx_parent_invitations_linking_status ON public.parent_invitations(linking_status);
CREATE INDEX IF NOT EXISTS idx_parent_invitations_expires_at ON public.parent_invitations(expires_at);

ALTER TABLE public.parents ADD COLUMN IF NOT EXISTS linking_token VARCHAR(64);
ALTER TABLE public.parents ADD COLUMN IF NOT EXISTS linking_token_expires_at TIMESTAMPTZ;
ALTER TABLE public.parents ADD COLUMN IF NOT EXISTS invitation_status VARCHAR(20) DEFAULT 'uninvited';
ALTER TABLE public.parents ADD COLUMN IF NOT EXISTS invitation_sent_at TIMESTAMPTZ;

ALTER TABLE public.attendance ADD COLUMN IF NOT EXISTS telegram_error TEXT;
ALTER TABLE public.attendance ADD COLUMN IF NOT EXISTS telegram_delivery_status VARCHAR(20) DEFAULT 'unnotified';

ALTER TABLE public.parent_invitations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can view parent_invitations" ON public.parent_invitations;
CREATE POLICY "Authenticated users can view parent_invitations"
    ON public.parent_invitations FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Authenticated users can insert parent_invitations" ON public.parent_invitations;
CREATE POLICY "Authenticated users can insert parent_invitations"
    ON public.parent_invitations FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "Authenticated users can update parent_invitations" ON public.parent_invitations;
CREATE POLICY "Authenticated users can update parent_invitations"
    ON public.parent_invitations FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Authenticated users can delete parent_invitations" ON public.parent_invitations;
CREATE POLICY "Authenticated users can delete parent_invitations"
    ON public.parent_invitations FOR DELETE TO authenticated USING (true);

CREATE OR REPLACE FUNCTION public.link_parent_telegram_by_token(
    p_token VARCHAR(64),
    p_chat_id VARCHAR(100)
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_invitation RECORD;
    v_parent RECORD;
BEGIN
    SELECT * INTO v_invitation
    FROM public.parent_invitations
    WHERE token = p_token
    FOR UPDATE;

    IF NOT FOUND THEN
        SELECT id, full_name, linking_token_expires_at INTO v_parent
        FROM public.parents
        WHERE linking_token = p_token
        FOR UPDATE;

        IF NOT FOUND THEN
            RETURN jsonb_build_object(
                'success', false,
                'error_code', 'INVALID_TOKEN',
                'error', 'Invalid linking token. Please ensure you clicked the complete link provided by Ruparel Academy.'
            );
        END IF;

        IF v_parent.linking_token_expires_at IS NOT NULL AND v_parent.linking_token_expires_at < now() THEN
            RETURN jsonb_build_object(
                'success', false,
                'error_code', 'EXPIRED_TOKEN',
                'error', 'This invitation link has expired. Please request a new invitation from Ruparel Academy.'
            );
        END IF;

        UPDATE public.parents
        SET telegram_chat_id = p_chat_id,
            is_verified = true,
            preferred_notification_channel = 'telegram',
            invitation_status = 'linked',
            linking_token = NULL,
            updated_at = now()
        WHERE id = v_parent.id;

        RETURN jsonb_build_object(
            'success', true,
            'parent_id', v_parent.id,
            'parent_name', v_parent.full_name
        );
    END IF;

    IF v_invitation.linking_status = 'linked' THEN
        RETURN jsonb_build_object(
            'success', false,
            'error_code', 'ALREADY_LINKED',
            'error', 'This invitation token has already been used and cannot be reused.'
        );
    END IF;

    IF v_invitation.expires_at < now() THEN
        UPDATE public.parent_invitations
        SET linking_status = 'expired', updated_at = now()
        WHERE id = v_invitation.id;

        RETURN jsonb_build_object(
            'success', false,
            'error_code', 'EXPIRED_TOKEN',
            'error', 'This invitation link has expired. Please request a fresh invitation from Ruparel Academy.'
        );
    END IF;

    IF v_invitation.linking_status = 'revoked' THEN
        RETURN jsonb_build_object(
            'success', false,
            'error_code', 'REVOKED_TOKEN',
            'error', 'This invitation link has been revoked.'
        );
    END IF;

    SELECT id, full_name INTO v_parent
    FROM public.parents
    WHERE id = v_invitation.parent_id;

    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'success', false,
            'error_code', 'PARENT_NOT_FOUND',
            'error', 'Guardian account associated with this token was not found.'
        );
    END IF;

    UPDATE public.parents
    SET telegram_chat_id = p_chat_id,
        is_verified = true,
        preferred_notification_channel = 'telegram',
        invitation_status = 'linked',
        updated_at = now()
    WHERE id = v_invitation.parent_id;

    UPDATE public.parent_invitations
    SET linking_status = 'linked',
        invitation_status = 'delivered',
        linked_at = now(),
        updated_at = now()
    WHERE id = v_invitation.id;

    RETURN jsonb_build_object(
        'success', true,
        'parent_id', v_parent.id,
        'parent_name', v_parent.full_name
    );
END;
$$;

-- Grant execution permissions on the linking function
GRANT EXECUTE ON FUNCTION public.link_parent_telegram_by_token(VARCHAR, VARCHAR) TO anon, authenticated, service_role;

-- 12. PARENT STATUS INSPECTOR RPC (SECURITY DEFINER)
-- Allows the Telegram Bot to query linked student wards safely by chat ID
CREATE OR REPLACE FUNCTION public.get_parent_status_by_chat_id(
    p_chat_id VARCHAR(100)
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_parent RECORD;
    v_wards jsonb;
BEGIN
    SELECT id, full_name INTO v_parent
    FROM public.parents
    WHERE telegram_chat_id = p_chat_id
    LIMIT 1;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('found', false);
    END IF;

    SELECT coalesce(jsonb_agg(
        jsonb_build_object(
            'full_name', s.full_name,
            'admission_no', s.admission_no,
            'batch_code', b.code,
            'batch_name', b.name
        )
    ), '[]'::jsonb) INTO v_wards
    FROM public.parent_students ps
    JOIN public.students s ON s.id = ps.student_id
    LEFT JOIN public.batches b ON b.id = s.batch_id
    WHERE ps.parent_id = v_parent.id;

    RETURN jsonb_build_object(
        'found', true,
        'parent_id', v_parent.id,
        'parent_name', v_parent.full_name,
        'wards', v_wards
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_parent_status_by_chat_id(VARCHAR) TO anon, authenticated, service_role;

-- 13. REFRESH SCHEMA CACHE
-- Signals PostgREST to immediately reload schema cache
NOTIFY pgrst, 'reload schema';
