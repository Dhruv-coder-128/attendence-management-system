-- =====================================================================
-- RUPAREL ATTENDANCE ERP — PHASE 5: EXAM MANAGEMENT & REPORT CARDS
-- Migration: 20261009000005_exams_and_report_cards.sql
-- Description: Creates exams table and exam_marks table with relationships,
--              constraints, performance indexes, triggers, and RLS policies.
-- =====================================================================

-- 1. EXAMS TABLE
CREATE TABLE IF NOT EXISTS public.exams (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    exam_type VARCHAR(50) NOT NULL DEFAULT 'Unit Test' 
        CHECK (exam_type IN ('Unit Test', 'Mid-Term', 'Prelim', 'Final', 'Quiz', 'Other')),
    course_id UUID NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
    batch_id UUID REFERENCES public.batches(id) ON DELETE SET NULL,
    subject VARCHAR(100),
    exam_date DATE NOT NULL DEFAULT CURRENT_DATE,
    total_marks DECIMAL(6, 2) NOT NULL DEFAULT 100.00 CHECK (total_marks > 0),
    passing_marks DECIMAL(6, 2) NOT NULL DEFAULT 35.00 CHECK (passing_marks >= 0 AND passing_marks <= total_marks),
    description TEXT,
    academic_year VARCHAR(50) NOT NULL DEFAULT '2026-27',
    is_published BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 2. EXAM_MARKS TABLE
CREATE TABLE IF NOT EXISTS public.exam_marks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    exam_id UUID NOT NULL REFERENCES public.exams(id) ON DELETE CASCADE,
    student_id UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
    marks_obtained DECIMAL(6, 2) CHECK (marks_obtained IS NULL OR (marks_obtained >= 0)),
    is_absent BOOLEAN NOT NULL DEFAULT false,
    remarks TEXT,
    notified_guardians BOOLEAN NOT NULL DEFAULT false,
    notified_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    CONSTRAINT uq_exam_student UNIQUE (exam_id, student_id)
);

-- 3. PERFORMANCE INDEXES
CREATE INDEX IF NOT EXISTS idx_exams_course ON public.exams(course_id);
CREATE INDEX IF NOT EXISTS idx_exams_batch ON public.exams(batch_id);
CREATE INDEX IF NOT EXISTS idx_exams_date ON public.exams(exam_date);
CREATE INDEX IF NOT EXISTS idx_exam_marks_exam ON public.exam_marks(exam_id);
CREATE INDEX IF NOT EXISTS idx_exam_marks_student ON public.exam_marks(student_id);

-- 4. AUTO-UPDATE TIMESTAMPS TRIGGER
DROP TRIGGER IF EXISTS trigger_exams_updated_at ON public.exams;
CREATE TRIGGER trigger_exams_updated_at BEFORE UPDATE ON public.exams
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS trigger_exam_marks_updated_at ON public.exam_marks;
CREATE TRIGGER trigger_exam_marks_updated_at BEFORE UPDATE ON public.exam_marks
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 5. ROW LEVEL SECURITY (RLS) POLICIES
ALTER TABLE public.exams ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exam_marks ENABLE ROW LEVEL SECURITY;

-- Exams policies
DROP POLICY IF EXISTS "Authenticated users can select exams" ON public.exams;
CREATE POLICY "Authenticated users can select exams"
    ON public.exams FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Authenticated users can insert exams" ON public.exams;
CREATE POLICY "Authenticated users can insert exams"
    ON public.exams FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "Authenticated users can update exams" ON public.exams;
CREATE POLICY "Authenticated users can update exams"
    ON public.exams FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Authenticated users can delete exams" ON public.exams;
CREATE POLICY "Authenticated users can delete exams"
    ON public.exams FOR DELETE TO authenticated USING (true);

-- Exam Marks policies
DROP POLICY IF EXISTS "Authenticated users can select exam_marks" ON public.exam_marks;
CREATE POLICY "Authenticated users can select exam_marks"
    ON public.exam_marks FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Authenticated users can insert exam_marks" ON public.exam_marks;
CREATE POLICY "Authenticated users can insert exam_marks"
    ON public.exam_marks FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "Authenticated users can update exam_marks" ON public.exam_marks;
CREATE POLICY "Authenticated users can update exam_marks"
    ON public.exam_marks FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Authenticated users can delete exam_marks" ON public.exam_marks;
CREATE POLICY "Authenticated users can delete exam_marks"
    ON public.exam_marks FOR DELETE TO authenticated USING (true);

-- Allow public read of published exams if needed for parents/verification
DROP POLICY IF EXISTS "Anon can view published exams" ON public.exams;
CREATE POLICY "Anon can view published exams"
    ON public.exams FOR SELECT TO anon USING (is_published = true);

-- Reload PostgREST schema cache
NOTIFY pgrst, 'reload schema';
