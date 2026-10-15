/**
 * Student Directory Exporter (Excel & CSV)
 * Exports full or filtered student records with academic and financial details
 */

/**
 * Triggers browser download of a Blob
 */
function triggerBlobDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/**
 * Formats a student record into flat object for export
 */
export function formatStudentForExport(student) {
  const courseName = student.courses?.name
    ? `${student.courses.name} (${student.courses.code || ''})`
    : student.courses?.code || '';

  const batchName = student.batches?.name
    ? `${student.batches.name} (${student.batches.code || ''})`
    : student.batches?.code || '';

  const tuitionFee = Number(student.tuition_fee) || 0;
  const feePaid = Number(student.fee_paid) || 0;
  const feePending = Math.max(0, tuitionFee - feePaid);

  let feeStatus = student.fee_status;
  if (!feeStatus) {
    if (tuitionFee > 0 && feePaid >= tuitionFee) feeStatus = 'Paid';
    else if (feePaid > 0) feeStatus = 'Partial';
    else feeStatus = 'Pending';
  } else {
    feeStatus = feeStatus.charAt(0).toUpperCase() + feeStatus.slice(1);
  }

  return {
    'Admission No': student.admission_no || '',
    'Full Name': student.full_name || '',
    'Roll No': student.roll_no || '',
    'Course': courseName,
    'Batch': batchName,
    'Phone': student.phone || '',
    'Email': student.email || '',
    'Gender': student.gender || '',
    'Date of Birth': student.dob || '',
    'Blood Group': student.blood_group || '',
    'Address': student.address || '',
    'Enrollment Date': student.enrollment_date || '',
    'Tuition Fee': tuitionFee,
    'Fee Paid': feePaid,
    'Fee Pending': feePending,
    'Fee Status': feeStatus,
    'Enrollment Status': student.status ? student.status.toUpperCase() : 'ACTIVE',
  };
}

/**
 * Converts array of flat objects to standard CSV string
 */
function convertToCSV(records) {
  if (!records || records.length === 0) return '';
  const headers = Object.keys(records[0]);
  const headerLine = headers.map((h) => `"${String(h).replace(/"/g, '""')}"`).join(',');

  const dataLines = records.map((row) =>
    headers
      .map((header) => {
        const val = row[header] !== undefined && row[header] !== null ? String(row[header]) : '';
        return `"${val.replace(/"/g, '""')}"`;
      })
      .join(',')
  );

  return [headerLine, ...dataLines].join('\r\n');
}

/**
 * Exports students list to Excel (.xlsx) file
 */
export async function exportStudentsToExcel(students, academyName = 'SMS — Student Management System') {
  if (!students || students.length === 0) {
    throw new Error('No student records available to export.');
  }

  const records = students.map(formatStudentForExport);
  const XLSX = await import('xlsx');

  const worksheet = XLSX.utils.json_to_sheet(records);

  // Set intelligent column widths
  worksheet['!cols'] = [
    { wch: 16 }, // Admission No
    { wch: 24 }, // Full Name
    { wch: 10 }, // Roll No
    { wch: 30 }, // Course
    { wch: 26 }, // Batch
    { wch: 15 }, // Phone
    { wch: 26 }, // Email
    { wch: 10 }, // Gender
    { wch: 14 }, // DOB
    { wch: 12 }, // Blood Group
    { wch: 32 }, // Address
    { wch: 16 }, // Enrollment Date
    { wch: 14 }, // Tuition Fee
    { wch: 12 }, // Fee Paid
    { wch: 14 }, // Fee Pending
    { wch: 12 }, // Fee Status
    { wch: 14 }, // Enrollment Status
  ];

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Students Directory');

  const todayStr = new Date().toISOString().split('T')[0];
  const safeAcademy = academyName.toLowerCase().replace(/[^a-z0-9]/g, '_');
  const filename = `${safeAcademy}_students_${todayStr}.xlsx`;

  XLSX.writeFile(workbook, filename);
  return filename;
}

/**
 * Exports students list to CSV (.csv) file
 */
export async function exportStudentsToCSV(students, academyName = 'SMS — Student Management System') {
  if (!students || students.length === 0) {
    throw new Error('No student records available to export.');
  }

  const records = students.map(formatStudentForExport);
  const csvContent = convertToCSV(records);
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });

  const todayStr = new Date().toISOString().split('T')[0];
  const safeAcademy = academyName.toLowerCase().replace(/[^a-z0-9]/g, '_');
  const filename = `${safeAcademy}_students_${todayStr}.csv`;

  triggerBlobDownload(blob, filename);
  return filename;
}
