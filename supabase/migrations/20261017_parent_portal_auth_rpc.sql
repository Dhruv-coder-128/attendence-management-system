-- =====================================================================
-- SMS — STUDENT MANAGEMENT SYSTEM
-- Migration: 20261017_parent_portal_auth_rpc.sql
-- Secure RPC Function for Parent Portal Public Authentication
-- =====================================================================

CREATE OR REPLACE FUNCTION public.parent_portal_authenticate(
    p_phone TEXT,
    p_identifier TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER -- Runs with elevated table access while keeping RLS intact
SET search_path = public
AS $$
DECLARE
    v_clean_phone TEXT;
    v_clean_ident TEXT;
    v_parent RECORD;
    v_students JSONB;
    v_active_student_id UUID;
BEGIN
    -- 1. Normalize phone to last 10 digits
    v_clean_phone := right(regexp_replace(coalesce(p_phone, ''), '[^0-9]', '', 'g'), 10);
    v_clean_ident := lower(trim(coalesce(p_identifier, '')));

    IF length(v_clean_phone) < 10 THEN
        RETURN jsonb_build_object(
            'ok', false,
            'error', 'Please enter a valid 10-digit registered mobile number.'
        );
    END IF;

    -- 2. Lookup parent by clean phone
    SELECT * INTO v_parent
    FROM public.parents
    WHERE right(regexp_replace(phone, '[^0-9]', '', 'g'), 10) = v_clean_phone
    LIMIT 1;

    -- If not found in parents, check if phone exists directly on students
    IF v_parent.id IS NULL THEN
        SELECT 
            gen_random_uuid() AS id,
            s.full_name || ' Parent' AS full_name,
            v_clean_phone AS phone,
            'Parent' AS relationship
        INTO v_parent
        FROM public.students s
        WHERE right(regexp_replace(coalesce(s.phone, ''), '[^0-9]', '', 'g'), 10) = v_clean_phone
        LIMIT 1;
    END IF;

    IF v_parent.id IS NULL THEN
        RETURN jsonb_build_object(
            'ok', false,
            'error', 'No registered parent found with this mobile number. Please contact academy office.'
        );
    END IF;

    -- 3. Resolve all linked student wards (multi-child sibling resolution)
    SELECT jsonb_agg(
        jsonb_build_object(
            'id', s.id,
            'admission_no', s.admission_no,
            'full_name', s.full_name,
            'roll_no', s.roll_no,
            'gender', s.gender,
            'phone', s.phone,
            'status', s.status,
            'enrollment_date', s.enrollment_date,
            'batches', jsonb_build_object(
                'id', b.id,
                'name', b.name,
                'code', b.code,
                'timing', b.timing,
                'classroom', b.classroom
            ),
            'courses', jsonb_build_object(
                'id', c.id,
                'name', c.name,
                'code', c.code,
                'level', c.level
            )
        )
    )
    INTO v_students
    FROM public.parent_students ps
    JOIN public.students s ON s.id = ps.student_id
    LEFT JOIN public.batches b ON b.id = s.batch_id
    LEFT JOIN public.courses c ON c.id = s.course_id
    WHERE ps.parent_id = v_parent.id;

    -- Fallback: check students matching phone directly if junction is empty
    IF v_students IS NULL OR jsonb_array_length(v_students) = 0 THEN
        SELECT jsonb_agg(
            jsonb_build_object(
                'id', s.id,
                'admission_no', s.admission_no,
                'full_name', s.full_name,
                'roll_no', s.roll_no,
                'gender', s.gender,
                'phone', s.phone,
                'status', s.status,
                'enrollment_date', s.enrollment_date,
                'batches', jsonb_build_object(
                    'id', b.id,
                    'name', b.name,
                    'code', b.code,
                    'timing', b.timing,
                    'classroom', b.classroom
                ),
                'courses', jsonb_build_object(
                    'id', c.id,
                    'name', c.name,
                    'code', c.code,
                    'level', c.level
                )
            )
        )
        INTO v_students
        FROM public.students s
        LEFT JOIN public.batches b ON b.id = s.batch_id
        LEFT JOIN public.courses c ON c.id = s.course_id
        WHERE right(regexp_replace(coalesce(s.phone, ''), '[^0-9]', '', 'g'), 10) = v_clean_phone;
    END IF;

    IF v_students IS NULL OR jsonb_array_length(v_students) = 0 THEN
        RETURN jsonb_build_object(
            'ok', false,
            'error', 'No student records are linked to this parent phone number.'
        );
    END IF;

    -- 4. Validate identifier if supplied
    IF v_clean_ident != '' THEN
        SELECT (elem->>'id')::UUID INTO v_active_student_id
        FROM jsonb_array_elements(v_students) elem
        WHERE lower(trim(elem->>'admission_no')) = v_clean_ident
           OR lower(trim(elem->>'roll_no')) = v_clean_ident
        LIMIT 1;

        IF v_active_student_id IS NULL THEN
            RETURN jsonb_build_object(
                'ok', false,
                'error', 'Mobile number verified, but student roll number / admission number does not match.'
            );
        END IF;
    ELSE
        v_active_student_id := (v_students->0->>'id')::UUID;
    END IF;

    -- 5. Return authenticated payload
    RETURN jsonb_build_object(
        'ok', true,
        'parent', jsonb_build_object(
            'id', v_parent.id,
            'full_name', v_parent.full_name,
            'phone', v_clean_phone,
            'relationship', coalesce(v_parent.relationship, 'Parent')
        ),
        'students', v_students,
        'selectedStudentId', v_active_student_id,
        'authenticatedAt', timezone('utc'::text, now())
    );
END;
$$;

-- Grant execution to public anon and authenticated roles
GRANT EXECUTE ON FUNCTION public.parent_portal_authenticate(TEXT, TEXT) TO anon, authenticated;
