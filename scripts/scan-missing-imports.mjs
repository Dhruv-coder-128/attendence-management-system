import fs from 'fs';
import path from 'path';

const files = [];

function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory() && entry.name !== 'node_modules' && entry.name !== '.git') {
      walk(full);
    } else if (entry.isFile() && (entry.name.endsWith('.jsx') || entry.name.endsWith('.js'))) {
      files.push(full);
    }
  }
}

walk('src');

const hooks = ['useState', 'useEffect', 'useMemo', 'useCallback', 'useRef', 'useContext', 'useReducer'];

for (const f of files) {
  const content = fs.readFileSync(f, 'utf-8');
  // Find react import
  const reactImportMatch = content.match(/import\s+(?:React\s*,\s*)?\{([^}]+)\}\s+from\s+['"]react['"]/);
  const imported = new Set();
  if (reactImportMatch) {
    reactImportMatch[1].split(',').forEach(item => imported.add(item.trim()));
  }
  const defaultReact = /import\s+React\s+from\s+['"]react['"]/.test(content);

  for (const h of hooks) {
    const regex = new RegExp(`\\b${h}\\b`);
    // Check if used directly (not React.useX)
    const directUses = (content.match(new RegExp(`(?<!React\\.)${h}\\s*\\(`, 'g')) || []).length;
    if (directUses > 0 && !imported.has(h)) {
      console.log(`MISSING IMPORT in ${f}: '${h}' used ${directUses} times but not imported from 'react'!`);
    }
  }
}
console.log('Scan completed.');
