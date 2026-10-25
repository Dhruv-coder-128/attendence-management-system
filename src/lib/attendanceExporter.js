/**
 * SMS — Student Management System — Attendance Export Engine
 * Generates formatted Excel (.xlsx) and CSV reports for Daily & Monthly Registers
 */

/**
 * Formats a date into a clean Indian standard date string
 */
function formatDateIndian(dateStr) {
  if (!dateStr) return '—';
  try {
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  } catch {
    return dateStr;
  }
}

import { saveFileWithPicker } from './fileSaveHelper.js';

/**
 * Triggers native or browser download of a CSV file using a Blob
 */
async function downloadCSV(csvContent, filename) {
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  return await saveFileWithPicker(blob, filename);
}

async function saveWorkbook(workbook, filename, xlsxModule) {
  const XLSX = xlsxModule || (await import('xlsx'));
  const wbout = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
  const blob = new Blob([wbout], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  return await saveFileWithPicker(blob, filename);
}

/**
 * Exports Monthly Batch Attendance Register to Excel (.xlsx)
 */
export async function exportMonthlyRegisterToExcel({
  batch,
  year,
  monthIndex, // 0-11
  monthName,
  daysInMonth,
  sessionDates = [],
  students = [],
  monthlyAttendanceMap = {}, // { [studentId]: { [dateStr]: status } }
  threshold = 75,
  academyName = 'SMS — Student Management System',
}) {
  const XLSX = await import('xlsx');

  const rows = [];

  // 1. Academy & Batch Title Banner
  rows.push([academyName.toUpperCase()]);
  rows.push([`MONTHLY ATTENDANCE REGISTER — ${batch?.name || 'Academic Cohort'} (${batch?.code || 'N/A'})`]);
  rows.push([
    `Academic Month: ${monthName} ${year}`,
    `Shift: ${batch?.shift || 'Morning'}`,
    `Timing: ${batch?.timing || 'Regular Schedule'}`,
    `Classroom: ${batch?.classroom || 'Main Study Wing'}`,
  ]);
  rows.push([
    `Generated On: ${new Date().toLocaleString('en-IN')}`,
    `Minimum Standard Threshold: ${threshold}%`,
    `Total Enrolled: ${students.length} Students`,
    `Sessions Held This Month: ${sessionDates.length} Days`,
  ]);
  rows.push([]); // Spacer row

  // 2. Build Column Header Row
  const dateHeaders = [];
  for (let day = 1; day <= daysInMonth; day++) {
    const dayStr = String(day).padStart(2, '0');
    dateHeaders.push(`Day ${dayStr}`);
  }

  const headerRow = [
    'Sr.',
    'Roll No',
    'Admission No',
    'Student Name',
    ...dateHeaders,
    'Total Sessions Held',
    'Present (P)',
    'Late (L)',
    'Absent (A)',
    'Excused (E)',
    'Attendance %',
    'Eligibility Status',
  ];
  rows.push(headerRow);

  // 3. Populate Student Attendance Rows
  students.forEach((student, index) => {
    const studentMap = monthlyAttendanceMap[student.id] || {};
    let presentCount = 0;
    let lateCount = 0;
    let absentCount = 0;
    let excusedCount = 0;

    const dayCells = [];
    for (let day = 1; day <= daysInMonth; day++) {
      const dayStr = String(day).padStart(2, '0');
      const mStr = String(monthIndex + 1).padStart(2, '0');
      const dateKey = `${year}-${mStr}-${dayStr}`;

      const status = studentMap[dateKey];
      if (status === 'Present') {
        presentCount++;
        dayCells.push('P');
      } else if (status === 'Late') {
        lateCount++;
        dayCells.push('L');
      } else if (status === 'Absent') {
        absentCount++;
        dayCells.push('A');
      } else if (status === 'Excused') {
        excusedCount++;
        dayCells.push('E');
      } else {
        // No session or unrecorded
        dayCells.push(sessionDates.includes(dateKey) ? '—' : '-');
      }
    }

    const totalHeld = sessionDates.length;
    const attended = presentCount + lateCount;
    const attendancePct = totalHeld > 0 ? Math.round((attended / totalHeld) * 100) : 100;
    const isDefaulter = totalHeld > 0 && attendancePct < threshold;

    rows.push([
      index + 1,
      student.roll_no || '—',
      student.admission_no,
      student.full_name,
      ...dayCells,
      totalHeld,
      presentCount,
      lateCount,
      absentCount,
      excusedCount,
      `${attendancePct}%`,
      isDefaulter ? `DEFICIENT (<${threshold}%)` : 'REGULAR',
    ]);
  });

  // 4. Summary Row (Batch Totals per Day)
  rows.push([]);
  const summaryPresentRow = ['SUMMARY', '', '', 'Batch Present Count'];
  for (let day = 1; day <= daysInMonth; day++) {
    const dayStr = String(day).padStart(2, '0');
    const mStr = String(monthIndex + 1).padStart(2, '0');
    const dateKey = `${year}-${mStr}-${dayStr}`;

    if (!sessionDates.includes(dateKey)) {
      summaryPresentRow.push('-');
    } else {
      let count = 0;
      students.forEach((s) => {
        const st = (monthlyAttendanceMap[s.id] || {})[dateKey];
        if (st === 'Present' || st === 'Late') count++;
      });
      summaryPresentRow.push(count);
    }
  }
  summaryPresentRow.push('', '', '', '', '', '', '');
  rows.push(summaryPresentRow);

  // 5. Convert Array of Arrays to Sheet
  const worksheet = XLSX.utils.aoa_to_sheet(rows);

  // Intelligent Column Widths
  const colWidths = [
    { wch: 6 },  // Sr.
    { wch: 10 }, // Roll No
    { wch: 16 }, // Admission No
    { wch: 28 }, // Student Name
  ];

  // Add width 5 for each day column
  for (let i = 0; i < daysInMonth; i++) {
    colWidths.push({ wch: 7 });
  }

  // Summary columns
  colWidths.push({ wch: 16 }); // Total Sessions
  colWidths.push({ wch: 12 }); // Present
  colWidths.push({ wch: 10 }); // Late
  colWidths.push({ wch: 12 }); // Absent
  colWidths.push({ wch: 12 }); // Excused
  colWidths.push({ wch: 14 }); // Attendance %
  colWidths.push({ wch: 20 }); // Status

  worksheet['!cols'] = colWidths;

  const workbook = XLSX.utils.book_new();
  const sheetTitle = `${batch?.code || 'Batch'}_${monthName}`.substring(0, 31);
  XLSX.utils.book_append_sheet(workbook, worksheet, sheetTitle);

  const cleanBatch = (batch?.code || 'Batch').replace(/[^a-zA-Z0-9-_]/g, '_');
  const filename = `Attendance_Monthly_${cleanBatch}_${monthName}_${year}.xlsx`;
  await saveWorkbook(workbook, filename, XLSX);
}

/**
 * Exports Monthly Batch Attendance Register to CSV
 */
export function exportMonthlyRegisterToCSV({
  batch,
  year,
  monthIndex,
  monthName,
  daysInMonth,
  sessionDates = [],
  students = [],
  monthlyAttendanceMap = {},
  threshold = 75,
}) {
  const lines = [];

  // Header line
  const dateCols = [];
  for (let day = 1; day <= daysInMonth; day++) {
    dateCols.push(`Day ${String(day).padStart(2, '0')}`);
  }

  lines.push([
    'Sr No',
    'Roll No',
    'Admission No',
    'Student Name',
    ...dateCols,
    'Total Sessions Held',
    'Present',
    'Late',
    'Absent',
    'Excused',
    'Attendance Pct',
    'Status',
  ].join(','));

  // Rows
  students.forEach((student, index) => {
    const studentMap = monthlyAttendanceMap[student.id] || {};
    let presentCount = 0;
    let lateCount = 0;
    let absentCount = 0;
    let excusedCount = 0;

    const dayCells = [];
    for (let day = 1; day <= daysInMonth; day++) {
      const dayStr = String(day).padStart(2, '0');
      const mStr = String(monthIndex + 1).padStart(2, '0');
      const dateKey = `${year}-${mStr}-${dayStr}`;

      const status = studentMap[dateKey];
      if (status === 'Present') {
        presentCount++;
        dayCells.push('P');
      } else if (status === 'Late') {
        lateCount++;
        dayCells.push('L');
      } else if (status === 'Absent') {
        absentCount++;
        dayCells.push('A');
      } else if (status === 'Excused') {
        excusedCount++;
        dayCells.push('E');
      } else {
        dayCells.push(sessionDates.includes(dateKey) ? '—' : '-');
      }
    }

    const totalHeld = sessionDates.length;
    const attended = presentCount + lateCount;
    const attendancePct = totalHeld > 0 ? Math.round((attended / totalHeld) * 100) : 100;
    const isDefaulter = totalHeld > 0 && attendancePct < threshold;

    const escapeCSV = (val) => `"${String(val ?? '').replace(/"/g, '""')}"`;

    lines.push([
      index + 1,
      escapeCSV(student.roll_no || ''),
      escapeCSV(student.admission_no),
      escapeCSV(student.full_name),
      ...dayCells,
      totalHeld,
      presentCount,
      lateCount,
      absentCount,
      excusedCount,
      `"${attendancePct}%"`,
      isDefaulter ? '"DEFICIENT"' : '"REGULAR"',
    ].join(','));
  });

  const cleanBatch = (batch?.code || 'Batch').replace(/[^a-zA-Z0-9-_]/g, '_');
  const filename = `Attendance_Monthly_${cleanBatch}_${monthName}_${year}.csv`;
  downloadCSV(lines.join('\n'), filename);
}

/**
 * Exports Daily Roll Call Register to Excel (.xlsx)
 */
export async function exportDailyRegisterToExcel({
  batch,
  date,
  students = [],
  attendanceMap = {},
  academyName = 'SMS — Student Management System',
}) {
  const XLSX = await import('xlsx');

  const rows = [];
  rows.push([academyName.toUpperCase()]);
  rows.push([`DAILY ROLL CALL REGISTER — ${batch?.name || 'Cohort'} (${batch?.code || 'N/A'})`]);
  rows.push([
    `Roll Call Date: ${formatDateIndian(date)}`,
    `Shift: ${batch?.shift || 'Morning'}`,
    `Timing: ${batch?.timing || 'Regular Schedule'}`,
    `Classroom: ${batch?.classroom || 'Main Study Wing'}`,
  ]);
  rows.push([
    `Generated On: ${new Date().toLocaleString('en-IN')}`,
    `Total Enrolled: ${students.length} Students`,
  ]);
  rows.push([]);

  // Column Headers
  rows.push([
    'Sr.',
    'Admission No',
    'Student Name',
    'Roll No',
    'Attendance Status',
    'Time In',
    'Remarks',
    'Guardian Contact',
    'Telegram Linked',
    'Telegram Alert Dispatched',
  ]);

  let presentCount = 0;
  let absentCount = 0;
  let lateCount = 0;
  let excusedCount = 0;

  students.forEach((student, index) => {
    const record = attendanceMap[student.id];
    const status = record?.status || 'Unmarked';
    const parent = student.parent_students?.[0]?.parents;

    if (status === 'Present') presentCount++;
    else if (status === 'Absent') absentCount++;
    else if (status === 'Late') lateCount++;
    else if (status === 'Excused') excusedCount++;

    rows.push([
      index + 1,
      student.admission_no,
      student.full_name,
      student.roll_no || '—',
      status,
      record?.time_in || '—',
      record?.remarks || '—',
      parent?.phone || '—',
      parent?.is_verified && parent?.telegram_chat_id ? 'Linked' : 'Not Linked',
      record?.telegram_notified ? `Sent at ${record.telegram_notified_at || 'Today'}` : 'Not Dispatched',
    ]);
  });

  // Summary at bottom
  rows.push([]);
  rows.push(['METRICS SUMMARY']);
  rows.push(['Total Enrolled', students.length]);
  rows.push(['Present', presentCount]);
  rows.push(['Absent', absentCount]);
  rows.push(['Late', lateCount]);
  rows.push(['Excused', excusedCount]);
  const rate = students.length > 0 ? Math.round(((presentCount + lateCount) / students.length) * 100) : 0;
  rows.push(['Attendance Rate', `${rate}%`]);

  const worksheet = XLSX.utils.aoa_to_sheet(rows);
  worksheet['!cols'] = [
    { wch: 6 },  // Sr
    { wch: 16 }, // Admission No
    { wch: 28 }, // Student Name
    { wch: 10 }, // Roll No
    { wch: 16 }, // Status
    { wch: 12 }, // Time In
    { wch: 24 }, // Remarks
    { wch: 16 }, // Guardian Contact
    { wch: 16 }, // Telegram Linked
    { wch: 24 }, // Alert Dispatched
  ];

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Daily Roll Call');

  const cleanBatch = (batch?.code || 'Batch').replace(/[^a-zA-Z0-9-_]/g, '_');
  const filename = `Attendance_Daily_${cleanBatch}_${date}.xlsx`;
  await saveWorkbook(workbook, filename, XLSX);
}
