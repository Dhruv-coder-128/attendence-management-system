/**
 * Today's date as YYYY-MM-DD in the device's LOCAL time.
 * new Date().toISOString() is UTC, so in India (UTC+5:30) it still says "yesterday" until 5:30 AM:
 * early classes would be saved under the wrong date.
 */
/** "2026-27": the academic year that today falls in (a new year starts in June). */
export function currentAcademicYear(now = new Date()) {
  const y = now.getFullYear();
  const start = now.getMonth() >= 5 ? y : y - 1;
  return `${start}-${String((start + 1) % 100).padStart(2, '0')}`;
}

export function todayLocal(now = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`;
}
