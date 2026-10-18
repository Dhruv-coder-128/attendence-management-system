import fs from 'fs';
import path from 'path';

const filePath = path.resolve('src/data/attendance_sync.json');
const dbPath = path.resolve('src/data/school_database.json');
const db = JSON.parse(fs.readFileSync(dbPath, 'utf8'));
const batches = db.batches || [];

function getCanonicalBatch(rawId) {
  if (!rawId) return null;
  const clean = String(rawId).replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
  for (const b of batches) {
    if (b.id && b.id.toLowerCase() === String(rawId).toLowerCase()) return b;
    if (b.code && b.code.replace(/[^a-zA-Z0-9]/g, '').toLowerCase() === clean) return b;
    if (b.name && b.name.replace(/[^a-zA-Z0-9]/g, '').toLowerCase() === clean) return b;
  }
  return null;
}

const rawData = JSON.parse(fs.readFileSync(filePath, 'utf8'));
const cleanObj = {};

for (const [key, session] of Object.entries(rawData)) {
  const parts = key.split('_');
  const date = parts.slice(1).join('_') || session.date || '2026-10-18';
  const rawBatchId = parts[0] || session.batch_id;
  
  const matchedBatch = getCanonicalBatch(rawBatchId) || getCanonicalBatch(session.batch_code) || getCanonicalBatch(session.batch_name);
  const canonicalId = matchedBatch ? matchedBatch.id : rawBatchId;
  const canonicalCode = matchedBatch ? matchedBatch.code : (session.batch_code || canonicalId);
  const canonicalName = matchedBatch ? matchedBatch.name : (session.batch_name || '');

  const cleanKey = canonicalId + '_' + date;
  if (!cleanObj[cleanKey]) {
    cleanObj[cleanKey] = {
      batch_id: canonicalId,
      batch_code: canonicalCode,
      batch_name: canonicalName,
      date: date,
      savedAt: session.savedAt || new Date().toISOString(),
      records: []
    };
  }

  // Merge records deduplicating by admission_no / student_id
  const existingMap = new Map(cleanObj[cleanKey].records.map(r => [r.admission_no || r.student_id, r]));
  (session.records || []).forEach(r => {
    const sKey = r.admission_no || r.student_id;
    if (sKey) {
      existingMap.set(sKey, {
        ...r,
        admission_no: r.admission_no || sKey,
        student_id: r.student_id || sKey
      });
    }
  });
  cleanObj[cleanKey].records = Array.from(existingMap.values());
}

fs.writeFileSync(filePath, JSON.stringify(cleanObj, null, 2), 'utf8');
console.log('Sanitized attendance_sync.json successfully!');
console.log('Clean keys:', Object.keys(cleanObj));
for (const [k, v] of Object.entries(cleanObj)) {
  console.log(k, 'records count:', v.records.length);
}
