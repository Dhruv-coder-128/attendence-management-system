import { supabase } from '../supabase.js';

/**
 * SMS — Student Management System
 * Universal SQL Script Importer
 * 
 * Safely parses standard SQL INSERT statements from .sql dumps / backups
 * and applies them directly into Supabase via client-side batch inserts.
 * Supports: students, batches, courses, parents, fees, exams.
 */

// Supported tables in insertion dependency order
const ALLOWED_TABLES = [
  'courses',
  'batches',
  'students',
  'parents',
  'parent_students',
  'student_fees',
  'exams',
  'exam_marks',
  'attendance',
];

/**
 * Cleans SQL comments and splits into individual statements
 */
export function cleanAndSplitSql(sqlText) {
  if (!sqlText || typeof sqlText !== 'string') return [];

  // Remove multi-line comments /* ... */
  let cleaned = sqlText.replace(/\/\*[\s\S]*?\*\//g, '');

  // Remove single-line comments -- ...
  cleaned = cleaned.replace(/--.*$/gm, '');

  // Split by semicolon (ignoring semicolons inside single quotes)
  const statements = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < cleaned.length; i++) {
    const char = cleaned[i];
    if (char === "'") {
      // Check for escaped single quote ''
      if (inQuotes && cleaned[i + 1] === "'") {
        current += "''";
        i++;
        continue;
      }
      inQuotes = !inQuotes;
      current += char;
    } else if (char === ';' && !inQuotes) {
      const trimmed = current.trim();
      if (trimmed) statements.push(trimmed);
      current = '';
    } else {
      current += char;
    }
  }

  const remainder = current.trim();
  if (remainder) statements.push(remainder);

  return statements;
}

/**
 * Parses a single SQL value literal ('string', 123, NULL, TRUE, FALSE)
 */
function parseSqlLiteral(rawVal) {
  const val = rawVal.trim();
  if (/^null$/i.test(val)) return null;
  if (/^true$/i.test(val)) return true;
  if (/^false$/i.test(val)) return false;

  // Single-quoted string
  if (val.startsWith("'") && val.endsWith("'")) {
    return val.slice(1, -1).replace(/''/g, "'");
  }

  // Numeric
  if (!isNaN(Number(val)) && val !== '') {
    return Number(val);
  }

  // Default clean string
  return val;
}

/**
 * Parses individual tuple: (val1, val2, val3)
 */
function parseTupleValues(tupleStr) {
  const inside = tupleStr.trim().replace(/^\(|\)$/g, '').trim();
  const values = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < inside.length; i++) {
    const char = inside[i];
    if (char === "'") {
      if (inQuotes && inside[i + 1] === "'") {
        current += "''";
        i++;
        continue;
      }
      inQuotes = !inQuotes;
      current += char;
    } else if (char === ',' && !inQuotes) {
      values.push(parseSqlLiteral(current));
      current = '';
    } else {
      current += char;
    }
  }

  if (current.trim().length > 0 || inside.endsWith(',')) {
    values.push(parseSqlLiteral(current));
  }

  return values;
}

/**
 * Parses an INSERT INTO statement into a structured object:
 * { table: 'students', columns: ['full_name', 'roll_no'], rows: [[...], [...]] }
 */
export function parseInsertStatement(stmt) {
  // Regex: INSERT INTO (public.)?<table> (<cols>) VALUES <values>
  const match = stmt.match(/insert\s+into\s+(?:public\.)?([a-zA-Z0-9_]+)\s*(?:\(([^)]+)\))?\s*values\s*([\s\S]+)/i);
  if (!match) return null;

  const table = match[1].toLowerCase();
  if (!ALLOWED_TABLES.includes(table)) {
    return { error: `Table '${table}' is not supported for client import.` };
  }

  const colString = match[2];
  const columns = colString
    ? colString.split(',').map((c) => c.trim().replace(/["`]/g, ''))
    : null;

  const rawValues = match[3].trim();

  // Extract all ( ... ) tuples from VALUES
  const tuples = [];
  let currentTuple = '';
  let depth = 0;
  let inQuotes = false;

  for (let i = 0; i < rawValues.length; i++) {
    const char = rawValues[i];
    if (char === "'") {
      if (inQuotes && rawValues[i + 1] === "'") {
        currentTuple += "''";
        i++;
        continue;
      }
      inQuotes = !inQuotes;
      currentTuple += char;
    } else if (char === '(' && !inQuotes) {
      depth++;
      currentTuple += char;
    } else if (char === ')' && !inQuotes) {
      depth--;
      currentTuple += char;
      if (depth === 0) {
        tuples.push(currentTuple.trim());
        currentTuple = '';
      }
    } else {
      if (depth > 0) {
        currentTuple += char;
      }
    }
  }

  if (tuples.length === 0) {
    return { error: 'No valid VALUES tuples found in INSERT statement.' };
  }

  const rows = tuples.map((t) => parseTupleValues(t));

  return { table, columns, rows };
}

/**
 * Executes a parsed SQL file or script into Supabase
 */
export async function executeSqlImport(sqlText, onProgress) {
  const statements = cleanAndSplitSql(sqlText);
  if (statements.length === 0) {
    return { ok: false, error: 'No executable SQL statements found in file.' };
  }

  let totalParsed = 0;
  let totalInserted = 0;
  const errors = [];
  const tableStats = {};

  for (let i = 0; i < statements.length; i++) {
    const stmt = statements[i];
    if (!stmt.toLowerCase().startsWith('insert')) {
      continue;
    }

    const parsed = parseInsertStatement(stmt);
    if (!parsed) continue;

    if (parsed.error) {
      errors.push(`Statement ${i + 1}: ${parsed.error}`);
      continue;
    }

    const { table, columns, rows } = parsed;
    if (!tableStats[table]) tableStats[table] = 0;

    // Convert rows to key-value objects
    const objectsToInsert = rows.map((rowVals) => {
      const obj = {};
      if (columns) {
        columns.forEach((col, idx) => {
          if (rowVals[idx] !== undefined) {
            obj[col] = rowVals[idx];
          }
        });
      }
      return obj;
    });

    totalParsed += objectsToInsert.length;

    // Insert in chunks of 50 to avoid payload size limit
    const chunkSize = 50;
    for (let c = 0; c < objectsToInsert.length; c += chunkSize) {
      const chunk = objectsToInsert.slice(c, c + chunkSize);
      try {
        const { error: insertErr } = await supabase.from(table).insert(chunk);
        if (insertErr) {
          errors.push(`Table ${table} error: ${insertErr.message}`);
        } else {
          totalInserted += chunk.length;
          tableStats[table] += chunk.length;
        }
      } catch (err) {
        errors.push(`Table ${table} error: ${err.message}`);
      }

      if (onProgress) {
        onProgress({
          totalStatements: statements.length,
          currentStatement: i + 1,
          totalParsed,
          totalInserted,
        });
      }
    }
  }

  return {
    ok: totalInserted > 0 || errors.length === 0,
    totalParsed,
    totalInserted,
    tableStats,
    errors,
  };
}
