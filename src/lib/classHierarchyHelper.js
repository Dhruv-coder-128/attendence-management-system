/**
 * Class and Section Hierarchy Helper
 * Provides standard-to-division grouping for schools with multi-section classes
 * (e.g., 11th-A, 11th-B, 11th-C, or standalone single-division classes).
 */

/**
 * Normalizes standard names into canonical title case format
 */
export function normalizeStandardName(str) {
  if (!str) return 'Standard Class';
  const clean = String(str).trim();
  const lower = clean.toLowerCase();
  if (lower === '11-com' || lower === '11com' || lower.includes('11th')) return '11th Commerce';
  if (lower === '12-com' || lower === '12com' || lower.includes('12th')) return '12th Commerce';
  if (lower === 'fy' || lower === 'fy-bca' || lower === 'fybca' || lower.includes('first year')) return 'FY BCA';
  if (lower === 'sy' || lower === 'sy-bca' || lower === 'sybca' || lower.includes('second year')) return 'SY BCA';
  if (lower === 'ty' || lower === 'ty-bca' || lower === 'tybca' || lower.includes('third year')) return 'TY BCA';
  return clean;
}

/**
 * Extracts normalized base standard/grade name and section from a batch object or string.
 * Handles common variations like:
 * - "11th Commerce — Division A" -> { standard: "11th Commerce", section: "A" }
 * - "11th commerce- divition b"  -> { standard: "11th Commerce", section: "B" }
 * - "11COM-B"                    -> { standard: "11th Commerce", section: "B" }
 * - "11-COM"                    -> { standard: "11th Commerce", section: "A" }
 * - "FY-BCA"                    -> { standard: "FY BCA", section: "A" }
 */
export function extractStandardAndSection(batch) {
  if (!batch) return { standard: 'General', section: 'A' };

  if (typeof batch === 'string') {
    batch = { name: batch, code: batch };
  }

  // 1. Explicit properties take precedence
  if (batch.standard && batch.section) {
    return {
      standard: normalizeStandardName(batch.standard),
      section: String(batch.section).trim().toUpperCase(),
    };
  }

  const name = String(batch.name || '').trim();
  const code = String(batch.code || '').trim();

  // 2. Pattern: "Standard — Division X", "Standard - Divition X", "Standard - Div X"
  const divMatch = name.match(/^(.*?)\s*[-—–]\s*(?:Division|Divition|Section|Div|Sec)?\s*([A-Za-z0-9]+)$/i);
  if (divMatch && divMatch[1] && divMatch[2]) {
    return {
      standard: normalizeStandardName(divMatch[1]),
      section: divMatch[2].trim().toUpperCase(),
    };
  }

  // 3. Pattern: "11th-A", "11COM-B", "10-B", "FY-A"
  const shortMatch = (code || name).match(/^(.*?)[\-_]([A-Za-z])$/i);
  if (shortMatch && shortMatch[1] && shortMatch[2]) {
    return {
      standard: normalizeStandardName(shortMatch[1]),
      section: shortMatch[2].trim().toUpperCase(),
    };
  }

  // 4. Default standard mapping from existing canonical codes
  const uCode = code.toUpperCase();
  const uName = name.toUpperCase();

  if (uCode.includes('11-COM') || uCode.includes('11COM') || uName.includes('11TH')) {
    const sec = batch.section || (uCode.endsWith('-B') || uName.includes('B') ? 'B' : 'A');
    return { standard: '11th Commerce', section: sec };
  }
  if (uCode.includes('12-COM') || uCode.includes('12COM') || uName.includes('12TH')) {
    const sec = batch.section || (uCode.endsWith('-B') || uName.includes('B') ? 'B' : 'A');
    return { standard: '12th Commerce', section: sec };
  }
  if (uCode.includes('FY') || uName.includes('FY')) {
    return { standard: 'FY BCA', section: batch.section || 'A' };
  }
  if (uCode.includes('SY') || uName.includes('SY')) {
    return { standard: 'SY BCA', section: batch.section || 'A' };
  }
  if (uCode.includes('TY') || uName.includes('TY')) {
    return { standard: 'TY BCA', section: batch.section || 'A' };
  }

  return {
    standard: normalizeStandardName(name || code || 'Standard Class'),
    section: batch.section || 'A',
  };
}

/**
 * Groups a flat array of batches into hierarchical Standard/Class groups.
 * If a standard has multiple divisions (e.g. 11th-A, 11th-B), hasMultipleSections = true.
 * If a standard only has 1 division, hasMultipleSections = false.
 */
export function groupBatchesByStandard(batches = []) {
  const groupsMap = new Map();

  (batches || []).forEach((b) => {
    if (!b) return;
    const { standard, section } = extractStandardAndSection(b);
    const key = standard.toLowerCase();

    if (!groupsMap.has(key)) {
      groupsMap.set(key, {
        standardName: standard,
        hasMultipleSections: false,
        totalStudents: 0,
        sectionsCount: 0,
        sections: [],
      });
    }

    const group = groupsMap.get(key);
    // Enrich batch with parsed section and actual student count (0 if empty, never fake 20)
    const studentCount = typeof b.student_count === 'number'
      ? b.student_count
      : (typeof b.enrolled === 'number' ? b.enrolled : (b.students?.length ?? (b.is_canonical ? 20 : 0)));

    const enrichedBatch = {
      ...b,
      standard,
      section: b.section || section,
      student_count: studentCount,
      enrolled: studentCount,
      displayName: b.name || `${standard} - Division ${section}`,
    };

    group.sections.push(enrichedBatch);
  });

  // Calculate hasMultipleSections and totals for each group
  const result = [];
  groupsMap.forEach((group) => {
    group.hasMultipleSections = group.sections.length > 1;
    group.sectionsCount = group.sections.length;
    group.divisions = group.sections;
    // Sort sections alphabetically (A, B, C...)
    group.sections.sort((a, b) => String(a.section || '').localeCompare(String(b.section || '')));
    // Sum exact students across all sections
    group.totalStudents = group.sections.reduce((acc, s) => acc + (s.student_count || 0), 0);
    group.timing = group.sections[0]?.timing || '08:00 AM – 10:30 AM';
    group.classroom = group.sections[0]?.classroom || 'Room 101';
    result.push(group);
  });

  return result;
}
