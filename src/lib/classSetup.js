// Small pure helpers for the setup wizard (kept separate so they can be unit-tested).

/** Short unique batch code from a name: "11th Commerce A" -> "11CA". */
export function codeFromName(name, taken = new Set()) {
  const words = String(name).replace(/[^A-Za-z0-9 ]/g, ' ').split(/\s+/).filter(Boolean);
  let base = words.length > 1 ? words.map((w) => (/^\d+/.test(w) ? w.match(/^\d+/)[0] : w[0])).join('') : words[0] || 'B';
  base = base.toUpperCase().slice(0, 10) || 'B';
  let code = base;
  for (let i = 2; taken.has(code); i++) code = `${base}${i}`;
  return code;
}

/** Turns the lines the school typed into classes to create (blank lines and duplicates dropped). */
export function parseClassLines(text) {
  const seen = new Set();
  return String(text || '')
    .split(/\r?\n|,/)
    .map((l) => l.trim().replace(/\s+/g, ' '))
    .filter((l) => l && !seen.has(l.toLowerCase()) && seen.add(l.toLowerCase()));
}
