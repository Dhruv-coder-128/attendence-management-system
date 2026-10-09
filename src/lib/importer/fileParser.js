/**
 * Normalizes a header string for fuzzy/alias matching
 * e.g., "Student Full Name" -> "studentfullname"
 */
export function normalizeHeader(header) {
  if (!header) return '';
  return String(header)
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

/**
 * Parses an Excel (.xlsx, .xls) or CSV file into structured sheet objects
 * Returns { fileName, fileSize, sheetNames, activeSheet, headers, rawRows, rowCount }
 */
export async function parseImportFile(file, targetSheetName = null) {
  if (!file) throw new Error('No file provided.');

  const XLSX = await import('xlsx');
  const isCSV = file.name.toLowerCase().endsWith('.csv');
  const buffer = await file.arrayBuffer();

  const workbook = XLSX.read(buffer, {
    type: 'array',
    cellDates: true,
    cellNF: false,
    cellText: false,
  });

  const sheetNames = workbook.SheetNames || [];
  if (sheetNames.length === 0) {
    throw new Error('The uploaded spreadsheet does not contain any readable sheets.');
  }

  const selectedSheetName =
    targetSheetName && sheetNames.includes(targetSheetName)
      ? targetSheetName
      : sheetNames[0];

  const worksheet = workbook.Sheets[selectedSheetName];
  if (!worksheet) {
    throw new Error(`Sheet "${selectedSheetName}" could not be opened.`);
  }

  // Convert to array of arrays to safely extract headers
  const aoa = XLSX.utils.sheet_to_json(worksheet, {
    header: 1,
    defval: '',
    blankrows: false,
  });

  if (!aoa || aoa.length === 0) {
    return {
      fileName: file.name,
      fileSize: file.size,
      sheetNames,
      activeSheet: selectedSheetName,
      headers: [],
      rawRows: [],
      rowCount: 0,
      isEmpty: true,
    };
  }

  // Row 0 is the headers
  const rawHeaders = aoa[0].map((h) => String(h || '').trim()).filter((h) => h.length > 0);

  // Convert to array of objects using rawHeaders
  const rawRows = [];
  for (let i = 1; i < aoa.length; i++) {
    const rowValues = aoa[i];
    // Check if row has at least one non-empty value
    const hasValue = rowValues.some(
      (v) => v !== null && v !== undefined && String(v).trim().length > 0
    );
    if (!hasValue) continue;

    const rowObj = {};
    rawHeaders.forEach((header, idx) => {
      let val = rowValues[idx];
      if (val instanceof Date) {
        // Convert to YYYY-MM-DD
        const y = val.getFullYear();
        const m = String(val.getMonth() + 1).padStart(2, '0');
        const d = String(val.getDate()).padStart(2, '0');
        val = `${y}-${m}-${d}`;
      } else if (typeof val === 'string') {
        val = val.trim();
      }
      rowObj[header] = val !== undefined ? val : '';
    });
    rawRows.push({
      _rowNum: i + 1, // Excel row number (1-based, header is 1)
      ...rowObj,
    });
  }

  return {
    fileName: file.name,
    fileSize: file.size,
    isCSV,
    sheetNames,
    activeSheet: selectedSheetName,
    headers: rawHeaders,
    rawRows,
    rowCount: rawRows.length,
    isEmpty: rawRows.length === 0,
  };
}

/**
 * Generates initial automated column mapping based on entity schema and file headers
 * Returns { [schemaFieldName]: matchedFileHeader || '' }
 */
export function autoMapColumns(schema, fileHeaders) {
  if (!schema || !schema.fields || !fileHeaders) return {};

  const mapping = {};
  const normalizedFileHeaders = fileHeaders.map((header) => ({
    original: header,
    normalized: normalizeHeader(header),
  }));

  schema.fields.forEach((field) => {
    const fieldNameNorm = normalizeHeader(field.name);
    const fieldLabelNorm = normalizeHeader(field.label);
    const aliasesNorm = (field.aliases || []).map((a) => normalizeHeader(a));

    // 1. Try exact normalized match with field name or label
    let match = normalizedFileHeaders.find(
      (h) => h.normalized === fieldNameNorm || h.normalized === fieldLabelNorm
    );

    // 2. Try match against alias list (exact)
    if (!match) {
      match = normalizedFileHeaders.find((h) => aliasesNorm.includes(h.normalized));
    }

    // 3. Try partial substring match against name, label, or aliases
    if (!match) {
      match = normalizedFileHeaders.find(
        (h) =>
          h.normalized.includes(fieldNameNorm) ||
          fieldNameNorm.includes(h.normalized) ||
          (fieldLabelNorm && h.normalized.includes(fieldLabelNorm)) ||
          aliasesNorm.some((a) => a.length >= 4 && (h.normalized.includes(a) || a.includes(h.normalized)))
      );
    }

    mapping[field.name] = match ? match.original : '';
  });

  return mapping;
}
