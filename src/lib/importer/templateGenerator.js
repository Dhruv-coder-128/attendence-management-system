import { ENTITY_SCHEMAS } from './entitySchemas';

/**
 * Official Reference Courses in Ruparel Attendance ERP database (public.courses)
 */
export const OFFICIAL_COURSES_REFERENCE = [
  {
    'Course Code': '11TH-SCI',
    'Course Title': '11th Standard — Science',
    'Academic Level': '11th',
    'Description': 'Higher Secondary Science (Physics, Chemistry, Math/Bio)',
  },
  {
    'Course Code': '12TH-SCI',
    'Course Title': '12th Standard — Science',
    'Academic Level': '12th',
    'Description': 'Higher Secondary Science Board & Competitive Prep',
  },
  {
    'Course Code': '11TH-COM',
    'Course Title': '11th Standard — Commerce',
    'Academic Level': '11th',
    'Description': 'Higher Secondary Commerce with Accountancy & Math',
  },
  {
    'Course Code': '12TH-COM',
    'Course Title': '12th Standard — Commerce',
    'Academic Level': '12th',
    'Description': 'Higher Secondary Commerce Board Examination',
  },
  {
    'Course Code': 'FY-BCA',
    'Course Title': 'First Year — Bachelor of Computer Applications',
    'Academic Level': 'FY',
    'Description': 'Undergraduate Computer Applications (Sem I & II)',
  },
  {
    'Course Code': 'SY-BCA',
    'Course Title': 'Second Year — Bachelor of Computer Applications',
    'Academic Level': 'SY',
    'Description': 'Undergraduate Computer Applications (Sem III & IV)',
  },
  {
    'Course Code': 'TY-BCA',
    'Course Title': 'Third Year — Bachelor of Computer Applications',
    'Academic Level': 'TY',
    'Description': 'Undergraduate Computer Applications (Sem V & VI)',
  },
];

/**
 * Standard Sample Records for Downloadable ERP Templates
 * Uses exact database codes matching public.courses & public.batches
 */
const SAMPLE_RECORDS = {
  courses: [
    {
      'Course Code': 'FY-BCA',
      'Course Name': 'First Year — Bachelor of Computer Applications',
      'Academic Level': 'FY',
      'Description': 'Undergraduate Computer Applications (Semester I & II)',
      'Active Status': 'TRUE',
    },
    {
      'Course Code': '11TH-SCI',
      'Course Name': '11th Standard — Higher Secondary Science',
      'Academic Level': '11th',
      'Description': 'Physics, Chemistry, Mathematics & Biology Stream',
      'Active Status': 'TRUE',
    },
    {
      'Course Code': '12TH-COM',
      'Course Name': '12th Standard — Higher Secondary Commerce',
      'Academic Level': '12th',
      'Description': 'Accountancy, Business Economics & Secretarial Practice',
      'Active Status': 'TRUE',
    },
  ],

  batches: [
    {
      'Batch Code': 'FYBCA-A',
      'Batch Name': 'FYBCA Morning Division A',
      'Course Code': 'FY-BCA',
      'Academic Year': '2026-27',
      'Shift': 'Morning',
      'Timing / Schedule': '07:30 AM – 10:30 AM',
      'Classroom / Hall': 'Lecture Hall 101',
      'Maximum Capacity': 60,
      'Active Status': 'TRUE',
    },
    {
      'Batch Code': '11SCI-S1',
      'Batch Name': 'Grade 11 Science Section 1',
      'Course Code': '11TH-SCI',
      'Academic Year': '2026-27',
      'Shift': 'Morning',
      'Timing / Schedule': '06:30 AM – 09:30 AM',
      'Classroom / Hall': 'Room 204 (Science Block)',
      'Maximum Capacity': 55,
      'Active Status': 'TRUE',
    },
    {
      'Batch Code': '12SCI-S2',
      'Batch Name': 'Grade 12 Science Section 2',
      'Course Code': '12TH-SCI',
      'Academic Year': '2026-27',
      'Shift': 'Morning',
      'Timing / Schedule': '07:00 AM – 10:00 AM',
      'Classroom / Hall': 'Lecture Hall 2',
      'Maximum Capacity': 60,
      'Active Status': 'TRUE',
    },
    {
      'Batch Code': '11COM-C1',
      'Batch Name': 'Grade 11 Commerce Section 1',
      'Course Code': '11TH-COM',
      'Academic Year': '2026-27',
      'Shift': 'Afternoon',
      'Timing / Schedule': '11:00 AM – 02:00 PM',
      'Classroom / Hall': 'Room 301',
      'Maximum Capacity': 60,
      'Active Status': 'TRUE',
    },
    {
      'Batch Code': '12COM-C1',
      'Batch Name': 'Grade 12 Commerce Section 1',
      'Course Code': '12TH-COM',
      'Academic Year': '2026-27',
      'Shift': 'Afternoon',
      'Timing / Schedule': '11:00 AM – 02:00 PM',
      'Classroom / Hall': 'Room 302',
      'Maximum Capacity': 60,
      'Active Status': 'TRUE',
    },
  ],

  students: [
    {
      'Admission Number': 'ADM-2026-001',
      'Student Full Name': 'Aarav Sharma',
      'Batch Code': 'FYBCA-A',
      'Course Code': 'FY-BCA',
      'Roll Number': '101',
      'Gender': 'Male',
      'Date of Birth': '2008-04-12',
      'Student Phone': '9876543210',
      'Student Email': 'aarav.sharma@example.com',
      'Blood Group': 'O+',
      'Residential Address': '42 MG Road, Mumbai',
      'Enrollment Date': '2026-06-15',
      'Enrollment Status': 'active',
    },
    {
      'Admission Number': 'ADM-2026-002',
      'Student Full Name': 'Diya Patel',
      'Batch Code': '11SCI-S1',
      'Course Code': '11TH-SCI',
      'Roll Number': '102',
      'Gender': 'Female',
      'Date of Birth': '2009-08-20',
      'Student Phone': '9823456789',
      'Student Email': 'diya.patel@example.com',
      'Blood Group': 'B+',
      'Residential Address': '12 Nehru Nagar, Pune',
      'Enrollment Date': '2026-06-15',
      'Enrollment Status': 'active',
    },
    {
      'Admission Number': 'ADM-2026-003',
      'Student Full Name': 'Rohan Varma',
      'Batch Code': '12COM-C1',
      'Course Code': '12TH-COM',
      'Roll Number': '103',
      'Gender': 'Male',
      'Date of Birth': '2008-11-05',
      'Student Phone': '9811223344',
      'Student Email': 'rohan.varma@example.com',
      'Blood Group': 'A+',
      'Residential Address': '88 Station Road, Thane',
      'Enrollment Date': '2026-06-15',
      'Enrollment Status': 'active',
    },
  ],

  parents: [
    {
      'Guardian Full Name': 'Rajesh Sharma',
      'Guardian Phone': '9876543210',
      'Student Admission Number': 'ADM-2026-001',
      'Relationship to Student': 'Father',
      'Guardian Email': 'rajesh.sharma@example.com',
      'Notification Channel': 'telegram',
      'Telegram Chat ID (Private)': '',
      'Primary Emergency Contact': 'TRUE',
    },
    {
      'Guardian Full Name': 'Meena Sharma',
      'Guardian Phone': '9876543211',
      'Student Admission Number': 'ADM-2026-001',
      'Relationship to Student': 'Mother',
      'Guardian Email': 'meena.sharma@example.com',
      'Notification Channel': 'sms',
      'Telegram Chat ID (Private)': '',
      'Primary Emergency Contact': 'FALSE',
    },
    {
      'Guardian Full Name': 'Ketan Patel',
      'Guardian Phone': '9823456789',
      'Student Admission Number': 'ADM-2026-002',
      'Relationship to Student': 'Father',
      'Guardian Email': 'ketan.patel@example.com',
      'Notification Channel': 'telegram',
      'Telegram Chat ID (Private)': '',
      'Primary Emergency Contact': 'TRUE',
    },
  ],
};

/**
 * Converts array of objects to CSV string
 */
function convertToCSV(data) {
  if (!data || data.length === 0) return '';
  const headers = Object.keys(data[0]);
  const rows = data.map((row) =>
    headers
      .map((header) => {
        let val = row[header];
        if (val === null || val === undefined) val = '';
        val = String(val).replace(/"/g, '""');
        return `"${val}"`;
      })
      .join(',')
  );

  return [headers.map((h) => `"${h.replace(/"/g, '""')}"`).join(','), ...rows].join('\r\n');
}

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
 * Generates and triggers download of a sample template file (.xlsx or .csv)
 */
export async function downloadSampleTemplate(entityId, format = 'xlsx') {
  const records = SAMPLE_RECORDS[entityId];
  const schema = ENTITY_SCHEMAS[entityId];
  if (!records || !schema) {
    throw new Error(`Unknown entity template: ${entityId}`);
  }

  const baseFilename = `ruparel_erp_${entityId}_sample_template`;

  if (format === 'csv') {
    const csvContent = convertToCSV(records);
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    triggerBlobDownload(blob, `${baseFilename}.csv`);
    return;
  }

  // Generate Excel (.xlsx) workbook
  const XLSX = await import('xlsx');
  const worksheet = XLSX.utils.json_to_sheet(records);

  // Set intelligent column widths
  const colWidths = Object.keys(records[0]).map((key) => ({
    wch: Math.max(key.length + 4, 18),
  }));
  worksheet['!cols'] = colWidths;

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, schema.title.substring(0, 31));

  // If downloading Batches template, append a second sheet with Valid Courses Reference!
  if (entityId === 'batches') {
    const refWorksheet = XLSX.utils.json_to_sheet(OFFICIAL_COURSES_REFERENCE);
    refWorksheet['!cols'] = [
      { wch: 16 }, // Course Code
      { wch: 48 }, // Course Title
      { wch: 16 }, // Academic Level
      { wch: 60 }, // Description
    ];
    XLSX.utils.book_append_sheet(workbook, refWorksheet, 'Valid Courses Reference');
  }

  XLSX.writeFile(workbook, `${baseFilename}.xlsx`);
}

/**
 * Exports failed rows into a CSV file with detailed error reasons
 */
export function downloadFailedRowsCSV(failedRows, entityId = 'records') {
  if (!failedRows || failedRows.length === 0) return;

  const formattedRows = failedRows.map((item) => {
    const raw = item.rawData || {};
    return {
      'Row Number': item.rowNumber || '',
      'Error Reason': (item.errors || []).join('; '),
      ...raw,
    };
  });

  const csvContent = convertToCSV(formattedRows);
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const filename = `failed_${entityId}_rows_${new Date().toISOString().split('T')[0]}.csv`;
  triggerBlobDownload(blob, filename);
}
