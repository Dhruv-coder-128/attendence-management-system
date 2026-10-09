/**
 * Course Identifier & Name Resolver for ERP Bulk Importer
 * Aligned with public.courses schema in Supabase PostgreSQL.
 * 
 * Stored Course Codes in database:
 * - 11TH-SCI  (11th Standard — Science)
 * - 12TH-SCI  (12th Standard — Science)
 * - 11TH-COM  (11th Standard — Commerce)
 * - 12TH-COM  (12th Standard — Commerce)
 * - FY-BCA    (First Year — Bachelor of Computer Applications)
 * - SY-BCA    (Second Year — Bachelor of Computer Applications)
 * - TY-BCA    (Third Year — Bachelor of Computer Applications)
 */

/**
 * Normalizes string by stripping non-alphanumeric characters and converting to uppercase
 */
export function cleanAlphaNumeric(str) {
  if (!str) return '';
  return String(str)
    .replace(/[^a-zA-Z0-9]/g, '')
    .toUpperCase();
}

/**
 * Extracts significant uppercase word tokens from string
 */
export function extractSignificantTokens(str) {
  if (!str) return [];
  const stopWords = new Set(['AND', 'THE', 'OF', 'FOR', 'IN', 'STANDARD', 'STD', 'BATCH', 'COURSE', 'STREAM']);
  return String(str)
    .toUpperCase()
    .replace(/[^A-Z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 0 && !stopWords.has(w));
}

/**
 * Resolves a course reference against existing database courses.
 * 
 * Order of Precedence:
 * 1. Stable Course UUID match (id)
 * 2. Exact Course Code match (code)
 * 3. Clean Alphanumeric Code match (e.g. "FY BCA" -> "FY-BCA", "11TH SCI" -> "11TH-SCI")
 * 4. Exact Course Name match (name)
 * 5. Clean Alphanumeric Name match
 * 6. Semantic Token Matching (Unambiguous only)
 * 
 * Returns: {
 *   success: boolean,
 *   course: Object | null,
 *   course_id: string | null,
 *   course_code: string | null,
 *   matchedBy: string | null, // 'id' | 'code' | 'clean_code' | 'name' | 'clean_name' | 'unambiguous_tokens'
 *   error: string | null,
 *   candidates: Array<Object>
 * }
 */
export function resolveCourseReference(inputRaw, availableCourses = []) {
  if (!inputRaw || !String(inputRaw).trim()) {
    return {
      success: false,
      course: null,
      course_id: null,
      course_code: null,
      matchedBy: null,
      error: 'Course reference is required.',
      candidates: [],
    };
  }

  const trimmed = String(inputRaw).trim();
  const upper = trimmed.toUpperCase();
  const cleanInput = cleanAlphaNumeric(trimmed);
  const inputTokens = extractSignificantTokens(trimmed);

  if (!availableCourses || availableCourses.length === 0) {
    return {
      success: false,
      course: null,
      course_id: null,
      course_code: null,
      matchedBy: null,
      error: `No courses found in database. Please configure courses in public.courses first.`,
      candidates: [],
    };
  }

  // 1. Stable Course UUID match (id)
  const byId = availableCourses.find(
    (c) => c.id && String(c.id).toLowerCase() === trimmed.toLowerCase()
  );
  if (byId) {
    return {
      success: true,
      course: byId,
      course_id: byId.id,
      course_code: byId.code,
      matchedBy: 'id',
      error: null,
      candidates: [byId],
    };
  }

  // 2. Exact Course Code match (code)
  const byCode = availableCourses.find(
    (c) => c.code && c.code.toUpperCase() === upper
  );
  if (byCode) {
    return {
      success: true,
      course: byCode,
      course_id: byCode.id,
      course_code: byCode.code,
      matchedBy: 'code',
      error: null,
      candidates: [byCode],
    };
  }

  // 3. Clean Alphanumeric Code match (e.g. "FY BCA" -> "FY-BCA", "11TH SCI" -> "11TH-SCI")
  const byCleanCode = availableCourses.filter(
    (c) => c.code && cleanAlphaNumeric(c.code) === cleanInput
  );
  if (byCleanCode.length === 1) {
    return {
      success: true,
      course: byCleanCode[0],
      course_id: byCleanCode[0].id,
      course_code: byCleanCode[0].code,
      matchedBy: 'clean_code',
      error: null,
      candidates: byCleanCode,
    };
  }

  // 4. Exact Course Name match (name)
  const byName = availableCourses.find(
    (c) => c.name && c.name.toLowerCase().trim() === trimmed.toLowerCase()
  );
  if (byName) {
    return {
      success: true,
      course: byName,
      course_id: byName.id,
      course_code: byName.code,
      matchedBy: 'name',
      error: null,
      candidates: [byName],
    };
  }

  // 5. Clean Alphanumeric Name match
  const byCleanName = availableCourses.filter(
    (c) => c.name && cleanAlphaNumeric(c.name) === cleanInput
  );
  if (byCleanName.length === 1) {
    return {
      success: true,
      course: byCleanName[0],
      course_id: byCleanName[0].id,
      course_code: byCleanName[0].code,
      matchedBy: 'clean_name',
      error: null,
      candidates: byCleanName,
    };
  }

  // 6. Semantic Token Matching (Unambiguous only)
  // Handles common variations like "11TH SCIENCE", "12TH SCIENCE", "FY BCA", "11TH COMMERCE"
  const tokenMatches = [];

  for (const course of availableCourses) {
    const courseTokens = new Set([
      ...extractSignificantTokens(course.code),
      ...extractSignificantTokens(course.name),
      ...extractSignificantTokens(course.level),
      // Map domain abbreviations
      ...(course.code?.toUpperCase().includes('SCI') ? ['SCIENCE', 'SCI'] : []),
      ...(course.code?.toUpperCase().includes('COM') ? ['COMMERCE', 'COM'] : []),
      ...(course.name?.toUpperCase().includes('SCIENCE') ? ['SCIENCE', 'SCI'] : []),
      ...(course.name?.toUpperCase().includes('COMMERCE') ? ['COMMERCE', 'COM'] : []),
      ...(course.name?.toUpperCase().includes('COMPUTER APPLICATIONS') ? ['BCA'] : []),
    ]);

    // Check if all input tokens are matched in course tokens
    const allInputTokensMatched =
      inputTokens.length > 0 &&
      inputTokens.every((t) => {
        if (courseTokens.has(t)) return true;
        if (t === 'SCIENCE' && courseTokens.has('SCI')) return true;
        if (t === 'SCI' && courseTokens.has('SCIENCE')) return true;
        if (t === 'COMMERCE' && courseTokens.has('COM')) return true;
        if (t === 'COM' && courseTokens.has('COMMERCE')) return true;
        return Array.from(courseTokens).some((ct) => ct.includes(t) || t.includes(ct));
      });

    if (allInputTokensMatched) {
      tokenMatches.push(course);
    }
  }

  if (tokenMatches.length === 1) {
    const matched = tokenMatches[0];
    return {
      success: true,
      course: matched,
      course_id: matched.id,
      course_code: matched.code,
      matchedBy: 'unambiguous_tokens',
      error: null,
      candidates: tokenMatches,
    };
  }

  if (tokenMatches.length > 1) {
    const candidateList = tokenMatches
      .map((c) => `"${c.code} (${c.name})"`)
      .join(', ');
    return {
      success: false,
      course: null,
      course_id: null,
      course_code: null,
      matchedBy: null,
      error: `Ambiguous course reference "${trimmed}". Matches multiple courses: ${candidateList}. Please specify exact course code (e.g., ${tokenMatches[0].code}).`,
      candidates: tokenMatches,
    };
  }

  // 0 matches found
  const validCodes = availableCourses.map((c) => c.code).join(', ');
  return {
    success: false,
    course: null,
    course_id: null,
    course_code: null,
    matchedBy: null,
    error: `Referenced course "${trimmed}" does not match any course in database. Valid course codes: ${validCodes}.`,
    candidates: [],
  };
}
