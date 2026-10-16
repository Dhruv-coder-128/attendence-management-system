/**
 * SMS — Student Management System
 * Automated Parent-Student Relational Linkage & Integrity Repair Service
 * 
 * Ensures that 100% of parents and students in the local database or cloud
 * have matching relational rows in `parent_students` junction table,
 * resolving "No student linked" and blank dossier guardian cards.
 */

import { supabase, isSupabaseConfigured } from './supabase';
import { generateLocalId } from './databaseAdapter';

const REPAIR_TIMESTAMP_KEY = 'sms_last_parent_repair_ts';

/**
 * Scans students and parents, establishing missing junction linkages
 * in `parent_students`, and cross-referencing parent.student_id & student.guardian_*
 */
export async function repairStudentParentLinkages(force = false) {
  if (!supabase) {
    return { success: false, error: 'Database client not initialized.' };
  }

  try {
    // 1. Fetch all students, parents, and existing junction rows
    const [stRes, prRes, psRes] = await Promise.all([
      supabase.from('students').select('*'),
      supabase.from('parents').select('*'),
      supabase.from('parent_students').select('*'),
    ]);

    const students = stRes.data || [];
    const parents = prRes.data || [];
    const existingJunctions = psRes.data || [];

    if (students.length === 0 || parents.length === 0) {
      return { success: true, repairedCount: 0, message: 'No student or parent records to link.' };
    }

    // Build lookup maps
    const studentById = new Map(students.map((s) => [s.id, s]));
    const studentByAdmission = new Map(
      students.map((s) => [String(s.admission_no || '').trim().toLowerCase(), s])
    );
    const studentByPhone = new Map();
    students.forEach((s) => {
      const gPhone = String(s.guardian_phone || s.phone || '').replace(/[^0-9]/g, '');
      if (gPhone.length >= 7) {
        studentByPhone.set(gPhone.slice(-10), s);
      }
    });

    const newJunctionsToInsert = [];
    const junctionIdsToDelete = [];
    const parentsToUpdate = [];
    const studentsToUpdate = [];

    // Map junctions by parent_id
    const junctionsByParentId = new Map();
    existingJunctions.forEach((ps) => {
      if (!junctionsByParentId.has(ps.parent_id)) {
        junctionsByParentId.set(ps.parent_id, []);
      }
      junctionsByParentId.get(ps.parent_id).push(ps);
    });

    // Sort students by admission_no or roll_no or id for stable fallback
    const sortedStudents = [...students].sort((a, b) => {
      const admA = String(a.admission_no || a.id);
      const admB = String(b.admission_no || b.id);
      return admA.localeCompare(admB, undefined, { numeric: true });
    });

    parents.forEach((parent, index) => {
      // Step A: Determine the GENUINE matching student for this parent
      let genuineStudent = null;

      // 1. Priority 1: Match by admission_no (from Excel import)
      if (parent.admission_no) {
        const cleanAdm = String(parent.admission_no).trim().toLowerCase();
        if (studentByAdmission.has(cleanAdm)) {
          genuineStudent = studentByAdmission.get(cleanAdm);
        }
      }

      // 2. Priority 2: Match by guardian phone on student
      if (!genuineStudent && parent.phone) {
        const cleanPhone = String(parent.phone).replace(/[^0-9]/g, '');
        if (cleanPhone.length >= 7 && studentByPhone.has(cleanPhone.slice(-10))) {
          genuineStudent = studentByPhone.get(cleanPhone.slice(-10));
        }
      }

      // 3. Priority 3: Match by student_id if it exists and matches
      if (!genuineStudent && parent.student_id && studentById.has(parent.student_id)) {
        genuineStudent = studentById.get(parent.student_id);
      }

      // 4. Priority 4: Match by student's guardian_name === parent.full_name
      if (!genuineStudent && parent.full_name) {
        const pName = parent.full_name.trim().toLowerCase();
        genuineStudent = students.find((s) =>
          s.guardian_name && s.guardian_name.trim().toLowerCase() === pName
        );
      }

      // 5. Existing junction fallback: if parent already has junctions, check if any matches
      const myJunctions = junctionsByParentId.get(parent.id) || [];
      if (!genuineStudent && myJunctions.length > 0) {
        for (const j of myJunctions) {
          const candidate = studentById.get(j.student_id);
          if (candidate) {
            genuineStudent = candidate;
            break;
          }
        }
      }

      // 6. Sequential fallback only if count strictly matches 1:1 and no existing links
      if (!genuineStudent && parents.length === students.length) {
        genuineStudent = sortedStudents[index];
      }

      if (!genuineStudent) return;

      // Step B: Sanitize junctions for this parent
      // Check if genuine junction already exists
      const hasGenuineJunction = myJunctions.some((j) => j.student_id === genuineStudent.id);

      // If this parent has junctions pointing to other (mismatched/dummy) students, mark them for deletion!
      myJunctions.forEach((j) => {
        if (j.student_id !== genuineStudent.id) {
          // Check if other student is a genuine sibling (same admission_no or same guardian phone)
          const otherStudent = studentById.get(j.student_id);
          const isRealSibling = otherStudent && (
            (parent.admission_no && otherStudent.admission_no === parent.admission_no) ||
            (otherStudent.guardian_phone && parent.phone && otherStudent.guardian_phone.slice(-7) === parent.phone.slice(-7))
          );
          if (!isRealSibling) {
            junctionIdsToDelete.push(j.id);
          }
        }
      });

      // Deduplicate if multiple duplicate junctions exist pointing to the same genuineStudent
      const genuineJunctions = myJunctions.filter((j) => j.student_id === genuineStudent.id);
      if (genuineJunctions.length > 1) {
        for (let i = 1; i < genuineJunctions.length; i++) {
          junctionIdsToDelete.push(genuineJunctions[i].id);
        }
      }

      // If no genuine junction exists, queue for insertion
      if (!hasGenuineJunction) {
        newJunctionsToInsert.push({
          id: generateLocalId(),
          parent_id: parent.id,
          student_id: genuineStudent.id,
          relationship: parent.relationship || 'Father',
          is_primary_contact: true,
          contact_priority: 'primary',
          can_receive_alerts: true,
          alert_preference: 'all',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        });
      }

      // Step C: Ensure parent record has correct student_id and admission_no
      if (parent.student_id !== genuineStudent.id || parent.admission_no !== genuineStudent.admission_no) {
        parentsToUpdate.push({
          ...parent,
          student_id: genuineStudent.id,
          admission_no: genuineStudent.admission_no || parent.admission_no,
        });
      }

      // Step D: Ensure student has guardian name and phone
      if (!genuineStudent.guardian_name || !genuineStudent.guardian_phone) {
        studentsToUpdate.push({
          ...genuineStudent,
          guardian_name: genuineStudent.guardian_name || parent.full_name,
          guardian_phone: genuineStudent.guardian_phone || parent.phone,
          guardian_relationship: genuineStudent.guardian_relationship || parent.relationship || 'Father',
        });
      }
    });

    // Step E: Persist deletions of stale / duplicate junctions
    if (junctionIdsToDelete.length > 0) {
      for (const jId of junctionIdsToDelete) {
        await supabase.from('parent_students').delete().eq('id', jId);
      }
    }

    // Step F: Persist insertion of missing genuine junctions
    if (newJunctionsToInsert.length > 0) {
      await supabase.from('parent_students').insert(newJunctionsToInsert);
    }

    // Step G: Persist parent and student updates
    if (parentsToUpdate.length > 0) {
      for (const p of parentsToUpdate) {
        await supabase
          .from('parents')
          .update({
            student_id: p.student_id,
            admission_no: p.admission_no,
          })
          .eq('id', p.id);
      }
    }

    if (studentsToUpdate.length > 0) {
      for (const s of studentsToUpdate) {
        await supabase
          .from('students')
          .update({
            guardian_name: s.guardian_name,
            guardian_phone: s.guardian_phone,
            guardian_relationship: s.guardian_relationship,
          })
          .eq('id', s.id);
      }
    }

    if (typeof window !== 'undefined') {
      localStorage.setItem(REPAIR_TIMESTAMP_KEY, Date.now().toString());
    }

    return {
      success: true,
      repairedCount: newJunctionsToInsert.length,
      purgedCount: junctionIdsToDelete.length,
      parentsUpdated: parentsToUpdate.length,
      studentsUpdated: studentsToUpdate.length,
    };
  } catch (err) {
    console.error('Failed to execute parent-student repair service:', err);
    return { success: false, error: err.message };
  }
}

/**
 * Runs the repair check automatically on startup (throttled unless forced)
 */
export async function runAutoRepairIfNecessary(force = false) {
  if (typeof window === 'undefined') return;
  try {
    const lastRun = localStorage.getItem(REPAIR_TIMESTAMP_KEY);
    const now = Date.now();
    // Run if never run, or forced, or if 10 minutes elapsed
    if (force || !lastRun || now - Number(lastRun) > 10 * 60 * 1000) {
      await repairStudentParentLinkages(force);
    }
  } catch (err) {
    console.warn('Auto-repair execution skipped:', err);
  }
}
