import { execSync } from 'child_process';

const knownGlobals = new Set([
  'window', 'document', 'navigator', 'localStorage', 'sessionStorage',
  'console', 'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval',
  'fetch', 'Headers', 'Request', 'Response', 'URL', 'URLSearchParams',
  'Blob', 'File', 'FileReader', 'FormData', 'crypto', 'location',
  'history', 'alert', 'confirm', 'prompt', 'Event', 'CustomEvent',
  'MouseEvent', 'KeyboardEvent', 'HTMLElement', 'process', 'import',
  'Intl', 'AbortController', 'Image', 'Audio', 'Notification',
  'MutationObserver', 'ResizeObserver', 'IntersectionObserver',
  'HTMLVideoElement', 'HTMLCanvasElement', 'btoa', 'atob',
  'requestAnimationFrame', 'cancelAnimationFrame', 'indexedDB',
  'open', 'close', 'screen', 'performance', 'Math', 'Date',
  'JSON', 'Array', 'Object', 'String', 'Number', 'Boolean',
  'RegExp', 'Map', 'Set', 'Promise', 'Error', 'TypeError', 'RangeError',
  'parseInt', 'parseFloat', 'isNaN', 'isFinite', 'encodeURIComponent',
  'decodeURIComponent', 'encodeURI', 'decodeURI', 'ClipboardItem'
]);

let stdout = '';
try {
  stdout = execSync('npx oxlint -D no-undef -f json src/', { encoding: 'utf8', maxBuffer: 30 * 1024 * 1024 });
} catch (e) {
  stdout = e.stdout;
}

if (!stdout) {
  console.error('❌ Failed to run oxlint');
  process.exit(1);
}

const data = JSON.parse(stdout);
const realErrors = [];
for (const diag of (data.diagnostics || [])) {
  if (diag.code === 'eslint(no-undef)') {
    const match = diag.message.match(/'([^']+)' is not defined/);
    if (match) {
      const id = match[1];
      if (!knownGlobals.has(id)) {
        realErrors.push({
          file: diag.filename,
          identifier: id,
          message: diag.message
        });
      }
    }
  }
}

if (realErrors.length > 0) {
  console.error('❌ Found', realErrors.length, 'undeclared identifiers:');
  console.error(JSON.stringify(realErrors, null, 2));
  process.exit(1);
}

console.log('✓ VERDICT: PASS — 0 undeclared identifiers across all source files!');
