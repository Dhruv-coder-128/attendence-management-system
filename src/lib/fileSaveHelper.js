/**
 * SMS — Student Management System
 * Native File Explorer Save-As Helper
 * 
 * Uses the modern File System Access API (window.showSaveFilePicker) when available
 * to display the operating system's native file explorer dialog. Allows the user to
 * choose their target directory (e.g. Desktop, Documents, External Drive) and rename
 * the file before saving, rather than forcing a blind download into Downloads.
 * 
 * Gracefully falls back to browser anchor download if unsupported.
 */

/**
 * Resolves file picker filter types based on extension
 */
function getPickerTypes(filename, mimeType) {
  const ext = (filename.split('.').pop() || '').toLowerCase();
  
  if (ext === 'xlsx') {
    return [
      {
        description: 'Excel Spreadsheet (*.xlsx)',
        accept: {
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
        },
      },
    ];
  }

  if (ext === 'csv') {
    return [
      {
        description: 'CSV Spreadsheet (*.csv)',
        accept: {
          'text/csv': ['.csv'],
        },
      },
    ];
  }

  if (ext === 'pdf') {
    return [
      {
        description: 'PDF Document (*.pdf)',
        accept: {
          'application/pdf': ['.pdf'],
        },
      },
    ];
  }

  if (ext === 'smsdb' || ext === 'json') {
    return [
      {
        description: 'SMS Universal Database Backup (*.smsdb, *.json)',
        accept: {
          'application/json': ['.smsdb', '.json'],
        },
      },
    ];
  }

  if (ext === 'png') {
    return [
      {
        description: 'PNG Image (*.png)',
        accept: {
          'image/png': ['.png'],
        },
      },
    ];
  }

  if (ext === 'jpg' || ext === 'jpeg') {
    return [
      {
        description: 'JPEG Image (*.jpg, *.jpeg)',
        accept: {
          'image/jpeg': ['.jpg', '.jpeg'],
        },
      },
    ];
  }

  if (ext === 'mp4') {
    return [
      {
        description: 'MP4 Video (*.mp4)',
        accept: {
          'video/mp4': ['.mp4'],
        },
      },
    ];
  }

  const effectiveMime = mimeType || 'application/octet-stream';
  return [
    {
      description: `${ext ? ext.toUpperCase() : 'Custom'} File (*.${ext || 'dat'})`,
      accept: {
        [effectiveMime]: ext ? [`.${ext}`] : ['.dat'],
      },
    },
  ];
}

/**
 * Saves a Blob to disk using the native File Explorer Save-As picker when supported,
 * or standard anchor download as fallback.
 * 
 * @param {Blob} blob - The file content blob
 * @param {string} defaultFilename - Suggested filename
 * @param {string} [mimeType] - Optional explicit MIME type
 * @returns {Promise<{ ok: boolean, saved?: boolean, cancelled?: boolean, native?: boolean }>}
 */
export async function saveFileWithPicker(blob, defaultFilename, mimeType = '') {
  if (!blob) {
    return { ok: false, error: 'No file blob provided.' };
  }

  const cleanFilename = (defaultFilename || 'download').trim();
  const types = getPickerTypes(cleanFilename, mimeType || blob.type);

  // 1. Try modern Native Save File Picker (Edge, Chrome, Brave, Tauri WebView2)
  if (typeof window !== 'undefined' && typeof window.showSaveFilePicker === 'function') {
    try {
      const handle = await window.showSaveFilePicker({
        suggestedName: cleanFilename,
        types,
      });

      const writable = await handle.createWritable();
      await writable.write(blob);
      await writable.close();
      return { ok: true, saved: true, native: true };
    } catch (err) {
      if (err && err.name === 'AbortError') {
        // User deliberately cancelled the file explorer dialog — respect cancellation
        return { ok: true, cancelled: true };
      }
      console.warn('Native showSaveFilePicker failed, proceeding to fallback:', err);
    }
  }

  // 2. Fallback to classic anchor download
  try {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = cleanFilename;
    anchor.style.visibility = 'hidden';
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    setTimeout(() => URL.revokeObjectURL(url), 2500);
    return { ok: true, saved: true, native: false };
  } catch (fallbackErr) {
    console.error('Fallback file download failed:', fallbackErr);
    return { ok: false, error: fallbackErr.message };
  }
}

/**
 * Saves a Data URL (base64 or remote URL) to disk with the native File Explorer picker.
 * 
 * @param {string} dataUrl - Base64 Data URL or resource URL
 * @param {string} defaultFilename - Suggested filename
 * @returns {Promise<{ ok: boolean, saved?: boolean, cancelled?: boolean }>}
 */
export async function saveDataUrlWithPicker(dataUrl, defaultFilename) {
  if (!dataUrl) {
    return { ok: false, error: 'Empty data URL.' };
  }

  try {
    const res = await fetch(dataUrl);
    const blob = await res.blob();
    return await saveFileWithPicker(blob, defaultFilename);
  } catch (fetchErr) {
    console.warn('Could not fetch Data URL as Blob for picker, falling back to direct anchor:', fetchErr);
    const anchor = document.createElement('a');
    anchor.href = dataUrl;
    anchor.download = defaultFilename || 'attachment';
    anchor.target = '_blank';
    anchor.rel = 'noreferrer';
    anchor.style.visibility = 'hidden';
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    return { ok: true, fallback: true };
  }
}
