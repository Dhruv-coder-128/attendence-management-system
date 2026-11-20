/**
 * Prints one document (receipt, report card, dossier, report) on its own.
 * The element is copied into a clean top-level container first, so it never comes out blank
 * (hidden modal parents) or cut off after one page (scrolling popups).
 */
export function printDocument(elementId) {
  const source = document.getElementById(elementId);
  if (!source) return;
  document.getElementById('sms-print-root')?.remove();
  const root = document.createElement('div');
  root.id = 'sms-print-root';
  const copy = source.cloneNode(true);
  copy.removeAttribute('id');
  root.appendChild(copy);
  document.body.appendChild(root);
  document.body.classList.add('sms-printing');

  const cleanup = () => {
    document.body.classList.remove('sms-printing');
    root.remove();
    window.removeEventListener('afterprint', cleanup);
  };
  window.addEventListener('afterprint', cleanup);
  // If afterprint never fires, the copy stays hidden on screen and is replaced on the next print.
  window.print();
}
