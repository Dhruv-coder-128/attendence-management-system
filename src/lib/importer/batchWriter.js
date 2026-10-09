import { supabase } from '../supabase';

const BATCH_CHUNK_SIZE = 25;

/**
 * Safely writes validated import records into Supabase in chunks
 * Handles fallback to row-by-row insertion if a batch fails, preventing cascade failures.
 */
export async function executeBatchImport(entityId, validRows, onProgress) {
  if (!validRows || validRows.length === 0) {
    return {
      total: 0,
      successCount: 0,
      failedCount: 0,
      failedRows: [],
    };
  }

  let successCount = 0;
  const failedRows = [];

  const total = validRows.length;
  const chunks = [];
  for (let i = 0; i < total; i += BATCH_CHUNK_SIZE) {
    chunks.push(validRows.slice(i, i + BATCH_CHUNK_SIZE));
  }

  for (let cIdx = 0; cIdx < chunks.length; cIdx++) {
    const chunk = chunks[cIdx];

    if (onProgress) {
      const percentage = Math.round(((cIdx * BATCH_CHUNK_SIZE) / total) * 100);
      onProgress({
        current: cIdx * BATCH_CHUNK_SIZE,
        total,
        percentage,
        currentChunk: cIdx + 1,
        totalChunks: chunks.length,
      });
    }

    if (entityId === 'parents') {
      // Parents require two-step insertion: public.parents + public.parent_students
      for (const row of chunk) {
        try {
          await writeSingleParentWithJunction(row.resolvedData);
          successCount++;
        } catch (err) {
          failedRows.push({
            rowNumber: row.rowNumber,
            errors: [err.message || 'Database insert error for guardian'],
            rawData: row.rawData,
          });
        }
      }
    } else {
      // Bulk insert for courses, batches, and students
      const payloads = chunk.map((r) => formatPayloadForEntity(entityId, r.resolvedData));

      const tableName = entityId === 'courses' ? 'courses' : entityId === 'batches' ? 'batches' : 'students';

      const { data, error } = await supabase.from(tableName).insert(payloads).select();

      if (error) {
        // Fall back to row-by-row insertion for this specific chunk
        console.warn(`Chunk ${cIdx + 1} failed (${error.message}). Retrying row-by-row...`);
        for (const row of chunk) {
          const singlePayload = formatPayloadForEntity(entityId, row.resolvedData);
          const { error: singleErr } = await supabase.from(tableName).insert([singlePayload]);
          if (singleErr) {
            failedRows.push({
              rowNumber: row.rowNumber,
              errors: [singleErr.message || 'Insert constraint error'],
              rawData: row.rawData,
            });
          } else {
            successCount++;
          }
        }
      } else {
        successCount += chunk.length;
      }
    }
  }

  if (onProgress) {
    onProgress({
      current: total,
      total,
      percentage: 100,
      currentChunk: chunks.length,
      totalChunks: chunks.length,
    });
  }

  return {
    total,
    successCount,
    failedCount: failedRows.length,
    failedRows,
  };
}

/**
 * Formats payload according to database columns
 */
function formatPayloadForEntity(entityId, data) {
  if (entityId === 'courses') {
    return {
      code: data.code,
      name: data.name,
      level: data.level,
      description: data.description || null,
      is_active: data.is_active !== undefined ? data.is_active : true,
    };
  }

  if (entityId === 'batches') {
    return {
      code: data.code,
      name: data.name,
      course_id: data.course_id,
      academic_year: data.academic_year || '2026-27',
      shift: data.shift || 'Morning',
      timing: data.timing || null,
      classroom: data.classroom || null,
      max_capacity: Number(data.max_capacity) || 60,
      is_active: data.is_active !== undefined ? data.is_active : true,
    };
  }

  if (entityId === 'students') {
    return {
      admission_no: data.admission_no,
      full_name: data.full_name,
      roll_no: data.roll_no || null,
      batch_id: data.batch_id,
      course_id: data.course_id,
      gender: data.gender || null,
      dob: data.dob || null,
      phone: data.phone || null,
      email: data.email || null,
      blood_group: data.blood_group || null,
      address: data.address || null,
      enrollment_date: data.enrollment_date || new Date().toISOString().split('T')[0],
      status: data.status || 'active',
    };
  }

  return data;
}

/**
 * Writes parent record and links to student via public.parent_students junction
 */
async function writeSingleParentWithJunction(data) {
  // 1. Insert parent
  const parentPayload = {
    full_name: data.full_name,
    phone: data.phone,
    email: data.email || null,
    relationship: data.relationship || 'Parent',
    telegram_chat_id: data.telegram_chat_id || null,
    preferred_notification_channel: data.preferred_notification_channel || 'telegram',
    is_verified: false,
  };

  const { data: parentRecord, error: parentErr } = await supabase
    .from('parents')
    .insert([parentPayload])
    .select('id')
    .single();

  if (parentErr) throw parentErr;

  // 2. Insert junction into parent_students
  if (data.student_id && parentRecord?.id) {
    const junctionPayload = {
      parent_id: parentRecord.id,
      student_id: data.student_id,
      relationship: data.relationship || 'Parent',
      is_primary_contact: data.is_primary_contact !== undefined ? data.is_primary_contact : true,
      can_receive_alerts: true,
    };

    const { error: junctionErr } = await supabase
      .from('parent_students')
      .insert([junctionPayload]);

    if (junctionErr) {
      console.warn('Junction insert warning:', junctionErr);
    }
  }
}
