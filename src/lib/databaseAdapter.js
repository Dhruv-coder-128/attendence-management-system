/**
 * SMS — Student Management System
 * Dual-Mode Unified Database Storage Engine
 * 
 * Supports:
 * 1. 100% Offline On-Device Local Storage (IndexedDB) for Desktop EXE & Web
 * 2. Dedicated Cloud Supabase PostgreSQL
 * 3. 1-Click Database Backup (.smsdb / JSON) & Restore
 * 4. Transparent Supabase Query Builder Compatibility
 */

const DB_NAME = 'sms_offline_db';
const DB_VERSION = 1;
const STORAGE_MODE_KEY = 'sms_storage_mode';

const ALL_TABLES = [
  'courses',
  'batches',
  'students',
  'parents',
  'parent_students',
  'parent_invitations',
  'attendance',
  'fee_records',
  'fee_installments',
  'student_fees',
  'exams',
  'exam_marks',
  'academy_settings',
  'user_profiles',
];

/**
 * Resolves current storage mode ('offline' or 'cloud')
 */
export function getStorageMode() {
  if (typeof window === 'undefined') return 'offline';
  try {
    const saved = localStorage.getItem(STORAGE_MODE_KEY);
    if (saved === 'cloud' || saved === 'offline') return saved;
    // Default to offline in desktop if no explicit cloud is configured
    return 'offline';
  } catch {
    return 'offline';
  }
}

/**
 * Sets current storage mode
 */
export function setStorageMode(mode) {
  if (typeof window === 'undefined') return;
  const clean = mode === 'cloud' ? 'cloud' : 'offline';
  localStorage.setItem(STORAGE_MODE_KEY, clean);
}

/**
 * Initializes IndexedDB
 */
function openOfflineDB() {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || !window.indexedDB) {
      return reject(new Error('IndexedDB is not supported on this platform.'));
    }

    const request = window.indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      ALL_TABLES.forEach((tableName) => {
        if (!db.objectStoreNames.contains(tableName)) {
          const store = db.createObjectStore(tableName, { keyPath: 'id' });
          if (tableName === 'students') {
            store.createIndex('batch_id', 'batch_id', { unique: false });
            store.createIndex('roll_no', 'roll_no', { unique: false });
          } else if (tableName === 'attendance') {
            store.createIndex('date', 'date', { unique: false });
            store.createIndex('batch_id', 'batch_id', { unique: false });
          } else if (tableName === 'parents') {
            store.createIndex('phone', 'phone', { unique: false });
          }
        }
      });
    };

    request.onsuccess = (event) => resolve(event.target.result);
    request.onerror = (event) => reject(event.target.error);
  });
}

/**
 * Generates UUID v4 or random hex ID
 */
export function generateLocalId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return 'id_' + Math.random().toString(36).substring(2, 11) + Date.now().toString(36);
}

/**
 * Helper to perform read transaction
 */
async function getAllFromStore(tableName) {
  const db = await openOfflineDB();
  return new Promise((resolve, reject) => {
    if (!db.objectStoreNames.contains(tableName)) {
      return resolve([]);
    }
    const tx = db.transaction(tableName, 'readonly');
    const store = tx.objectStore(tableName);
    const req = store.getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

/**
 * Helper to perform bulk upsert transaction
 */
async function putRecordsInStore(tableName, records) {
  const db = await openOfflineDB();
  return new Promise((resolve, reject) => {
    if (!db.objectStoreNames.contains(tableName)) {
      return resolve(Array.isArray(records) ? records : [records]);
    }
    const tx = db.transaction(tableName, 'readwrite');
    const store = tx.objectStore(tableName);
    const list = Array.isArray(records) ? records : [records];

    list.forEach((rec) => {
      const item = { ...rec };
      if (!item.id) {
        item.id = generateLocalId();
      }
      if (!item.created_at) {
        item.created_at = new Date().toISOString();
      }
      item.updated_at = new Date().toISOString();
      store.put(item);
    });

    tx.oncomplete = () => resolve(list);
    tx.onerror = () => reject(tx.error);
  });
}

/**
 * Helper to delete by ID or filter
 */
async function deleteRecordsFromStore(tableName, idsToDelete) {
  const db = await openOfflineDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(tableName, 'readwrite');
    const store = tx.objectStore(tableName);
    idsToDelete.forEach((id) => store.delete(id));
    tx.oncomplete = () => resolve(true);
    tx.onerror = () => reject(tx.error);
  });
}

/**
 * Creates an offline query builder matching Supabase API syntax
 */
export function createLocalTableQueryBuilder(tableName) {
  const state = {
    tableName,
    operation: 'select', // 'select' | 'insert' | 'update' | 'delete' | 'upsert'
    payload: null,
    selectCols: '*',
    countType: null,
    headOnly: false,
    filters: [], // { type: 'eq' | 'neq' | 'in' | 'like', col, val }
    sortCol: null,
    sortAscending: true,
    limitCount: null,
    isSingle: false,
    isMaybeSingle: false,
  };

  const builder = {
    select(columns = '*', options = {}) {
      if (state.operation !== 'insert' && state.operation !== 'upsert' && state.operation !== 'update') {
        state.operation = 'select';
      }
      state.selectCols = columns;
      if (options.count) state.countType = options.count;
      if (options.head) state.headOnly = true;
      return builder;
    },

    insert(data) {
      state.operation = 'insert';
      state.payload = data;
      return builder;
    },

    update(data) {
      state.operation = 'update';
      state.payload = data;
      return builder;
    },

    upsert(data) {
      state.operation = 'upsert';
      state.payload = data;
      return builder;
    },

    delete() {
      state.operation = 'delete';
      return builder;
    },

    eq(col, val) {
      state.filters.push({ type: 'eq', col, val });
      return builder;
    },

    neq(col, val) {
      state.filters.push({ type: 'neq', col, val });
      return builder;
    },

    in(col, valArray) {
      state.filters.push({ type: 'in', col, val: valArray });
      return builder;
    },

    like(col, pattern) {
      state.filters.push({ type: 'like', col, val: pattern });
      return builder;
    },

    ilike(col, pattern) {
      state.filters.push({ type: 'ilike', col, val: pattern });
      return builder;
    },

    gte(col, val) {
      state.filters.push({ type: 'gte', col, val });
      return builder;
    },

    lte(col, val) {
      state.filters.push({ type: 'lte', col, val });
      return builder;
    },

    gt(col, val) {
      state.filters.push({ type: 'gt', col, val });
      return builder;
    },

    lt(col, val) {
      state.filters.push({ type: 'lt', col, val });
      return builder;
    },

    order(col, options = {}) {
      state.sortCol = col;
      state.sortAscending = options.ascending !== false;
      return builder;
    },

    limit(n) {
      state.limitCount = n;
      return builder;
    },

    single() {
      state.isSingle = true;
      return builder;
    },

    maybeSingle() {
      state.isMaybeSingle = true;
      return builder;
    },

    // Promise execution
    then(resolve, reject) {
      executeLocalQuery(state)
        .then((res) => resolve(res))
        .catch((err) => (reject ? reject(err) : resolve({ data: null, error: err, count: 0 })));
    },
  };

  return builder;
}

/**
 * Executes a local IndexedDB query
 */
async function executeLocalQuery(state) {
  try {
    let rows = await getAllFromStore(state.tableName);

    // 1. Handle INSERT / UPSERT
    if (state.operation === 'insert' || state.operation === 'upsert') {
      const items = Array.isArray(state.payload) ? state.payload : [state.payload];
      const inserted = items.map((item) => ({
        ...item,
        id: item.id || generateLocalId(),
        created_at: item.created_at || new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }));

      await putRecordsInStore(state.tableName, inserted);

      return {
        data: state.isSingle ? (inserted[0] || null) : (Array.isArray(state.payload) ? inserted : (inserted[0] || inserted)),
        error: null,
        count: inserted.length,
      };
    }

    // 2. Apply Filters
    let filtered = rows.filter((row) => {
      for (const f of state.filters) {
        if (f.type === 'eq' && row[f.col] !== f.val) return false;
        if (f.type === 'neq' && row[f.col] === f.val) return false;
        if (f.type === 'in' && Array.isArray(f.val) && !f.val.includes(row[f.col])) return false;
        if (f.type === 'gte') {
          if (row[f.col] === undefined || row[f.col] === null || String(row[f.col]) < String(f.val)) return false;
        }
        if (f.type === 'lte') {
          if (row[f.col] === undefined || row[f.col] === null || String(row[f.col]) > String(f.val)) return false;
        }
        if (f.type === 'gt') {
          if (row[f.col] === undefined || row[f.col] === null || String(row[f.col]) <= String(f.val)) return false;
        }
        if (f.type === 'lt') {
          if (row[f.col] === undefined || row[f.col] === null || String(row[f.col]) >= String(f.val)) return false;
        }
        if (f.type === 'like' || f.type === 'ilike') {
          const str = String(row[f.col] || '');
          const cleanPattern = String(f.val).replace(/%/g, '');
          if (f.type === 'ilike') {
            if (!str.toLowerCase().includes(cleanPattern.toLowerCase())) return false;
          } else {
            if (!str.includes(cleanPattern)) return false;
          }
        }
      }
      return true;
    });

    // 3. Handle DELETE
    if (state.operation === 'delete') {
      const idsToDelete = filtered.map((r) => r.id);
      await deleteRecordsFromStore(state.tableName, idsToDelete);
      return { data: filtered, error: null, count: idsToDelete.length };
    }

    // 4. Handle UPDATE
    if (state.operation === 'update') {
      const updated = filtered.map((r) => ({
        ...r,
        ...state.payload,
        updated_at: new Date().toISOString(),
      }));
      await putRecordsInStore(state.tableName, updated);
      return {
        data: state.isSingle ? updated[0] || null : updated,
        error: null,
        count: updated.length,
      };
    }

    // 5. Handle SELECT
    const totalCount = filtered.length;

    // Sorting
    if (state.sortCol) {
      filtered.sort((a, b) => {
        const valA = a[state.sortCol];
        const valB = b[state.sortCol];
        if (valA === valB) return 0;
        if (valA === null || valA === undefined) return 1;
        if (valB === null || valB === undefined) return -1;
        if (state.sortAscending) {
          return valA > valB ? 1 : -1;
        }
        return valA < valB ? 1 : -1;
      });
    }

    // Limit
    if (state.limitCount !== null) {
      filtered = filtered.slice(0, state.limitCount);
    }

    // Head only (e.g. { count: 'exact', head: true })
    if (state.headOnly) {
      return { data: null, error: null, count: totalCount };
    }

    // Relational auto-resolution for standard joins
    if (typeof state.selectCols === 'string' && state.selectCols.includes('(')) {
      filtered = await resolveRelations(state.tableName, filtered, state.selectCols);
    }

    if (state.isSingle) {
      return {
        data: filtered.length > 0 ? filtered[0] : null,
        error: filtered.length === 0 ? { message: 'Row not found', code: 'PGRST116' } : null,
        count: totalCount,
      };
    }

    if (state.isMaybeSingle) {
      return {
        data: filtered.length > 0 ? filtered[0] : null,
        error: null,
        count: totalCount,
      };
    }

    return {
      data: filtered,
      error: null,
      count: state.countType ? totalCount : null,
    };
  } catch (err) {
    return { data: null, error: err, count: 0 };
  }
}

/**
 * Resolves standard joins locally (e.g. students -> batches, attendance -> students)
 */
async function resolveRelations(tableName, records, selectString) {
  try {
    if (tableName === 'attendance') {
      const allStudents = await getAllFromStore('students');
      const allBatches = await getAllFromStore('batches');
      const studentMap = new Map(allStudents.map((s) => [s.id, s]));
      const batchMap = new Map(allBatches.map((b) => [b.id, b]));

      return records.map((rec) => ({
        ...rec,
        students: studentMap.get(rec.student_id) || null,
        batches: batchMap.get(rec.batch_id) || null,
      }));
    }

    if (tableName === 'batches') {
      const allCourses = await getAllFromStore('courses');
      const allStudents = await getAllFromStore('students');
      const courseMap = new Map(allCourses.map((c) => [c.id, c]));

      return records.map((rec) => {
        const studentCount = allStudents.filter((s) => s.batch_id === rec.id).length;
        return {
          ...rec,
          courses: courseMap.get(rec.course_id) || null,
          students: [{ count: studentCount }],
        };
      });
    }

    if (tableName === 'students') {
      const allBatches = await getAllFromStore('batches');
      const allCourses = await getAllFromStore('courses');
      const allParents = await getAllFromStore('parents');

      const batchMap = new Map(allBatches.map((b) => [b.id, b]));
      const courseMap = new Map(allCourses.map((c) => [c.id, c]));

      return records.map((rec) => {
        const parent = allParents.find((p) => p.student_id === rec.id || p.admission_no === rec.admission_no);
        return {
          ...rec,
          batches: batchMap.get(rec.batch_id) || null,
          courses: courseMap.get(rec.course_id) || null,
          parents: parent || null,
        };
      });
    }

    return records;
  } catch {
    return records;
  }
}

/**
 * Exports the entire local offline database into a downloadable backup file (.smsdb / JSON)
 */
export async function exportDatabaseBackup() {
  const backup = {
    version: '1.0',
    exportedAt: new Date().toISOString(),
    system: 'SMS — Student Management System',
    tables: {},
  };

  for (const table of ALL_TABLES) {
    try {
      backup.tables[table] = await getAllFromStore(table);
    } catch {
      backup.tables[table] = [];
    }
  }

  const jsonStr = JSON.stringify(backup, null, 2);
  const blob = new Blob([jsonStr], { type: 'application/json;charset=utf-8;' });
  const filename = `sms_database_backup_${new Date().toISOString().split('T')[0]}.smsdb`;

  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 2000);

  return { ok: true, filename, backupSummary: Object.fromEntries(Object.entries(backup.tables).map(([k, v]) => [k, v.length])) };
}

/**
 * Restores the local database from a backup file (.smsdb / JSON)
 */
export async function importDatabaseBackup(jsonStringOrObject) {
  try {
    const data = typeof jsonStringOrObject === 'string' ? JSON.parse(jsonStringOrObject) : jsonStringOrObject;
    if (!data || !data.tables) {
      throw new Error('Invalid backup file format: missing tables definition.');
    }

    const summary = {};

    for (const [table, records] of Object.entries(data.tables)) {
      if (ALL_TABLES.includes(table) && Array.isArray(records)) {
        // Clear existing store
        const existing = await getAllFromStore(table);
        if (existing.length > 0) {
          await deleteRecordsFromStore(table, existing.map((r) => r.id));
        }
        // Write backup records
        if (records.length > 0) {
          await putRecordsInStore(table, records);
        }
        summary[table] = records.length;
      }
    }

    return { ok: true, summary };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

/**
 * Clears all tables in the local database
 */
export async function resetLocalDatabase() {
  for (const table of ALL_TABLES) {
    try {
      const records = await getAllFromStore(table);
      if (records.length > 0) {
        await deleteRecordsFromStore(table, records.map((r) => r.id));
      }
    } catch {
      // Continue
    }
  }
  return { ok: true };
}
