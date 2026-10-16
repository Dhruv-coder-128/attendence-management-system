/**
 * Smart Batch Identifier & Name Resolver for ERP Bulk Importer
 * Resolves spreadsheet batch columns to the correct batch in public.batches.
 * Prevents misassignment where students are accidentally assigned to the first batch.
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
 * Extracts uppercase word tokens, filtering out generic school stop words
 */
export function extractBatchTokens(str) {
  if (!str) return [];
  const stopWords = new Set(['AND', 'THE', 'OF', 'FOR', 'IN', 'BATCH', 'COHORT', 'DIVISION', 'DIV', 'SECTION', 'SEC', 'CLASS', 'ROOM']);
  return String(str)
    .toUpperCase()
    .replace(/[^A-Z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 0 && !stopWords.has(w));
}

/**
 * Resolves a batch reference against available database batches.
 * 
 * Order of Precedence:
 * 1. Exact Batch UUID match (id)
 * 2. Exact Batch Code match (code) e.g. "B11", "BFY", "B12"
 * 3. Exact Batch Name match (name) e.g. "11th Commerce", "FY", "SY", "12th Commerce"
 * 4. Clean Alphanumeric Code match e.g. "B-11" -> "B11"
 * 5. Clean Alphanumeric Name match e.g. "11TH COMMERCE" -> "11th Commerce"
 * 6. Code prefix / suffix match e.g. input "11" matches code "B11"
 * 7. Semantic Token Matching (e.g. input "11 Commerce" matches "11th Commerce")
 * 8. Course-aware batch matching (matches a batch linked to studentCourseId)
 * 9. Safe fallback
 * 
 * Returns: {
 *   success: boolean,
 *   batch: Object | null,
 *   batch_id: string | null,
 *   batch_code: string | null,
 *   batch_name: string | null,
 *   matchedBy: string | null,
 *   warning: string | null
 * }
 */
export function resolveBatchReference(inputRaw, availableBatches = [], studentCourseId = null) {
  if (!availableBatches || availableBatches.length === 0) {
    return {
      success: false,
      batch: null,
      batch_id: null,
      batch_code: null,
      batch_name: null,
      matchedBy: null,
      warning: 'No batches found in database.',
    };
  }

  const trimmed = inputRaw ? String(inputRaw).trim() : '';
  const upper = trimmed.toUpperCase();
  const cleanInput = cleanAlphaNumeric(trimmed);
  const inputTokens = extractBatchTokens(trimmed);

  // If input is non-empty, try high-confidence matches
  if (trimmed) {
    // 1. Exact UUID match
    const byId = availableBatches.find(
      (b) => b.id && String(b.id).toLowerCase() === trimmed.toLowerCase()
    );
    if (byId) {
      return {
        success: true,
        batch: byId,
        batch_id: byId.id,
        batch_code: byId.code,
        batch_name: byId.name,
        matchedBy: 'id',
        warning: null,
      };
    }

    // 2. Exact Batch Code match
    const byCode = availableBatches.find(
      (b) => (b.code || '').toUpperCase() === upper
    );
    if (byCode) {
      return {
        success: true,
        batch: byCode,
        batch_id: byCode.id,
        batch_code: byCode.code,
        batch_name: byCode.name,
        matchedBy: 'code',
        warning: null,
      };
    }

    // 3. Exact Batch Name match
    const byName = availableBatches.find(
      (b) => (b.name || '').toUpperCase() === upper
    );
    if (byName) {
      return {
        success: true,
        batch: byName,
        batch_id: byName.id,
        batch_code: byName.code,
        batch_name: byName.name,
        matchedBy: 'name',
        warning: null,
      };
    }

    // 4. Clean Alphanumeric Code match
    const byCleanCode = availableBatches.find(
      (b) => cleanAlphaNumeric(b.code) === cleanInput
    );
    if (byCleanCode) {
      return {
        success: true,
        batch: byCleanCode,
        batch_id: byCleanCode.id,
        batch_code: byCleanCode.code,
        batch_name: byCleanCode.name,
        matchedBy: 'clean_code',
        warning: null,
      };
    }

    // 5. Clean Alphanumeric Name match
    const byCleanName = availableBatches.find(
      (b) => cleanAlphaNumeric(b.name) === cleanInput
    );
    if (byCleanName) {
      return {
        success: true,
        batch: byCleanName,
        batch_id: byCleanName.id,
        batch_code: byCleanName.code,
        batch_name: byCleanName.name,
        matchedBy: 'clean_name',
        warning: null,
      };
    }

    // 6. Common prefix/suffix matching: e.g. "B11" vs "11", "BFY" vs "FY", "BSY" vs "SY", "BTY" vs "TY", "B12" vs "12"
    const byCodeAffix = availableBatches.find((b) => {
      const bCode = (b.code || '').toUpperCase();
      const bClean = cleanAlphaNumeric(bCode);
      return (
        bClean === `B${cleanInput}` ||
        cleanInput === `B${bClean}` ||
        (cleanInput.length >= 2 && bClean.includes(cleanInput)) ||
        (bClean.length >= 2 && cleanInput.includes(bClean))
      );
    });
    if (byCodeAffix) {
      return {
        success: true,
        batch: byCodeAffix,
        batch_id: byCodeAffix.id,
        batch_code: byCodeAffix.code,
        batch_name: byCodeAffix.name,
        matchedBy: 'code_affix',
        warning: null,
      };
    }

    // 7. Token Matching (e.g. input "11 Commerce" matches "11th Commerce", "FY BCA" matches "FY")
    if (inputTokens.length > 0) {
      let bestMatch = null;
      let highestTokenScore = 0;

      for (const b of availableBatches) {
        const bTokens = extractBatchTokens(`${b.name} ${b.code}`);
        const matchedTokens = inputTokens.filter((token) =>
          bTokens.some((bt) => bt.includes(token) || token.includes(bt))
        );
        const score = matchedTokens.length;
        if (score > highestTokenScore) {
          highestTokenScore = score;
          bestMatch = b;
        }
      }

      if (bestMatch && highestTokenScore >= Math.min(2, inputTokens.length)) {
        return {
          success: true,
          batch: bestMatch,
          batch_id: bestMatch.id,
          batch_code: bestMatch.code,
          batch_name: bestMatch.name,
          matchedBy: 'tokens',
          warning: null,
        };
      }
    }
  }

  // 8. Course-aware batch matching: if student has a course_id, match an active batch for that course
  if (studentCourseId) {
    const courseBatch = availableBatches.find(
      (b) => b.course_id && String(b.course_id).toLowerCase() === String(studentCourseId).toLowerCase()
    );
    if (courseBatch) {
      return {
        success: true,
        batch: courseBatch,
        batch_id: courseBatch.id,
        batch_code: courseBatch.code,
        batch_name: courseBatch.name,
        matchedBy: 'course_id',
        warning: trimmed ? `Batch "${trimmed}" not found; matched batch "${courseBatch.name}" by course.` : null,
      };
    }
  }

  // 9. Fallback: if input was given but unmatched, provide first batch with clear warning
  const fallbackBatch = availableBatches[0];
  return {
    success: false,
    batch: fallbackBatch,
    batch_id: fallbackBatch.id,
    batch_code: fallbackBatch.code,
    batch_name: fallbackBatch.name,
    matchedBy: 'fallback',
    warning: trimmed
      ? `Batch "${trimmed}" was not recognized, defaulted to "${fallbackBatch.name}".`
      : `Batch omitted, defaulted to "${fallbackBatch.name}".`,
  };
}
