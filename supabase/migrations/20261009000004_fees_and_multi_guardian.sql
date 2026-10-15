-- =====================================================================
-- RUPAREL ATTENDANCE ERP — PHASE 4: FEES & MULTI-GUARDIAN PREFERENCES
-- Migration: 20261009000004_fees_and_multi_guardian.sql
-- Description: Adds student_fees table for tuition tracking and installment
--              schedules, extends parent_students with multi-guardian
--              alert preferences and contact priority, and adds fee columns
--              to students for direct querying.
-- =====================================================================

-- 1. EXTEND PARENT_STUDENTS WITH MULTI-GUARDIAN PREFERENCES
ALTER TABLE public.parent_students 
ADD COLUMN IF NOT EXISTS alert_preference VARCHAR(30) DEFAULT 'all';

ALTER TABLE public.parent_students 
ADD COLUMN IF NOT EXISTS contact_priority VARCHAR(20) DEFAULT 'primary';

-- Ensure constraints on parent_students preferences
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'chk_parent_students_alert_preference'
    ) THEN
        ALTER TABLE public.parent_students 
        ADD CONSTRAINT chk_parent_students_alert_preference 
        CHECK (alert_preference IN ('all', 'emergency_only', 'none'));
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'chk_parent_students_contact_priority'
    ) THEN
        ALTER TABLE public.parent_students 
        ADD CONSTRAINT chk_parent_students_contact_priority 
        CHECK (contact_priority IN ('primary', 'secondary', 'emergency'));
    END IF;
END $$;

-- 2. EXTEND STUDENTS TABLE WITH CONVENIENCE FEE COLUMNS
ALTER TABLE public.students 
ADD COLUMN IF NOT EXISTS tuition_fee DECIMAL(10, 2) DEFAULT 0.00;

ALTER TABLE public.students 
ADD COLUMN IF NOT EXISTS fee_paid DECIMAL(10, 2) DEFAULT 0.00;

ALTER TABLE public.students 
ADD COLUMN IF NOT EXISTS fee_status VARCHAR(20) DEFAULT 'pending';

ALTER TABLE public.students 
ADD COLUMN IF NOT EXISTS fee_due_date DATE;

-- 3. STUDENT_FEES TABLE (DETAILED INSTALLMENT TRACKING)
CREATE TABLE IF NOT EXISTS public.student_fees (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
    academic_year VARCHAR(50) NOT NULL DEFAULT '2026-27',
    total_amount DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
    paid_amount DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
    pending_amount DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
    status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('paid', 'partial', 'pending', 'overdue')),
    installment_schedule JSONB DEFAULT '[]'::jsonb,
    next_due_date DATE,
    last_reminder_sent_at TIMESTAMPTZ,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    CONSTRAINT uq_student_academic_year_fee UNIQUE (student_id, academic_year)
);

-- 4. PERFORMANCE INDEXES
CREATE INDEX IF NOT EXISTS idx_student_fees_student ON public.student_fees(student_id);
CREATE INDEX IF NOT EXISTS idx_student_fees_status ON public.student_fees(status);
CREATE INDEX IF NOT EXISTS idx_student_fees_due_date ON public.student_fees(next_due_date);
CREATE INDEX IF NOT EXISTS idx_parent_students_alert_pref ON public.parent_students(alert_preference);

-- 5. AUTO-UPDATE TIMESTAMPS TRIGGER
DROP TRIGGER IF EXISTS trigger_student_fees_updated_at ON public.student_fees;
CREATE TRIGGER trigger_student_fees_updated_at BEFORE UPDATE ON public.student_fees
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 6. ROW LEVEL SECURITY (RLS) POLICIES
ALTER TABLE public.student_fees ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can view student_fees" ON public.student_fees;
CREATE POLICY "Authenticated users can view student_fees"
    ON public.student_fees FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Authenticated users can insert student_fees" ON public.student_fees;
CREATE POLICY "Authenticated users can insert student_fees"
    ON public.student_fees FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "Authenticated users can update student_fees" ON public.student_fees;
CREATE POLICY "Authenticated users can update student_fees"
    ON public.student_fees FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Authenticated users can delete student_fees" ON public.student_fees;
CREATE POLICY "Authenticated users can delete student_fees"
    ON public.student_fees FOR DELETE TO authenticated USING (true);
