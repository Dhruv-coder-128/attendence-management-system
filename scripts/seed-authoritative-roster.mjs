import fs from 'fs';
import path from 'path';

const rawData = `ST1001	1	Krishna Dave	11th Commerce	Male	981349847	krishna.dave58@gmail.com	Dinesh Dave	Near City Center, Junagadh)
ST1002	2	Ananya Zala	11th Commerce	Male	975072527	ananya.zala70@gmail.com	Alpesh Zala	Near City Center, Gandhinager)
ST1003	3	Arjun Patel	11th Commerce	Male	985997685	arjun.patel14@gmail.com	Sunil Patel	Near City Center, Gandhinager)
ST1004	4	Yash Vora	11th Commerce	Male	975685250	yash.vora29@gmail.com	Vijay Vora	Near City Center, Rajkot)
ST1005	5	Diya Vora	11th Commerce	Male	998715180	diya.vora74@gmail.com	Sunil Vora	Near City Center, Rajkot)
ST1006	6	Ananya Joshi	11th Commerce	Female	985335912	ananya.joshi93@gmail.com	Kishor Joshi	Near City Center, Junagadh)
ST1007	7	Vihaan Jadeja	11th Commerce	Male	970570583	vihaan.jadeja70@gmail.com	Nilesh Jadeja	Near City Center, Junagadh)
ST1008	8	Karan Mehta	11th Commerce	Male	999497439	karan.mehta86@gmail.com	Nilesh Mehta	Near City Center, Ahmedabad)
ST1009	9	Pari Joshi	11th Commerce	Male	986467396	pari.joshi33@gmail.com	Kishor Joshi	Near City Center, Junagadh)
ST1010	10	Reyansh Vora	11th Commerce	Male	982863198	reyansh.vora40@gmail.com	Jignesh Vora	Near City Center, Gandhinager)
ST1011	11	Meera Makwana	11th Commerce	Male	988678800	meera.makwana96@gmail.com	Rajesh Makwana	Near City Center, Junagadh)
ST1012	12	Meera Thakkar	11th Commerce	Male	981553781	meera.thakkar54@gmail.com	Hitesh Thakkar	Near City Center, Gandhinager)
ST1013	13	Saanvi Trivedi	11th Commerce	Female	980404186	saanvi.trivedi77@gmail.com	Manish Trivedi	Near City Center, Ahmedabad)
ST1014	14	Dev Thakkar	11th Commerce	Female	983180381	dev.thakkar38@gmail.com	Alpesh Thakkar	Near City Center, Gandhinager)
ST1015	15	Ananya Makwana	11th Commerce	Male	980643530	ananya.makwana40@gmail.com	Uday Makwana	Near City Center, Rajkot)
ST1016	16	Rohan Mehta	11th Commerce	Female	992385004	rohan.mehta48@gmail.com	Sanjay Mehta	Near City Center, Gandhinager)
ST1017	17	Riya Bhatt	11th Commerce	Male	971953066	riya.bhatt54@gmail.com	Kirit Bhatt	Near City Center, Gandhinager)
ST1018	18	Tanvi Trivedi	11th Commerce	Male	983512400	tanvi.trivedi12@gmail.com	Vijay Trivedi	Near City Center, Rajkot)
ST1019	19	Saanvi Amin	11th Commerce	Male	991055285	saanvi.amin21@gmail.com	Ajay Amin	Near City Center, Junagadh)
ST1020	20	Ishaan Sanghani	11th Commerce	Male	991956307	ishaan.sanghani71@gmail.com	Prakash Sanghani	Near City Center, Junagadh)
ST1021	1	Reyansh Thakkar	12th Commerce	Male	993526069	reyansh.thakkar24@gmail.com	Ajay Thakkar	Near City Center, Ahmedabad)
ST1022	2	Ishaan Rathod	12th Commerce	Male	988726604	ishaan.rathod23@gmail.com	Manish Rathod	Near City Center, Rajkot)
ST1023	3	Ishaan Patel	12th Commerce	Female	976221004	ishaan.patel46@gmail.com	Mukesh Patel	Near City Center, Ahmedabad)
ST1024	4	Neha Rathod	12th Commerce	Female	990171425	neha.rathod98@gmail.com	Sunil Rathod	Near City Center, Gandhinager)
ST1025	5	Pranav Zala	12th Commerce	Male	991705254	pranav.zala97@gmail.com	Nilesh Zala	Near City Center, Junagadh)
ST1026	6	Vihaan Trivedi	12th Commerce	Male	979362875	vihaan.trivedi58@gmail.com	Nilesh Trivedi	Near City Center, Rajkot)
ST1027	7	Pari Chauhan	12th Commerce	Male	976968603	pari.chauhan80@gmail.com	Kishor Chauhan	Near City Center, Rajkot)
ST1028	8	Aadhya Chauhan	12th Commerce	Male	991364677	aadhya.chauhan44@gmail.com	Vijay Chauhan	Near City Center, Junagadh)
ST1029	9	Meera Trivedi	12th Commerce	Male	981537472	meera.trivedi69@gmail.com	Mukesh Trivedi	Near City Center, Rajkot)
ST1030	10	Diya Makwana	12th Commerce	Female	972848305	diya.makwana91@gmail.com	Jignesh Makwana	Near City Center, Junagadh)
ST1031	11	Aarav Amin	12th Commerce	Female	976070145	aarav.amin61@gmail.com	Sunil Amin	Near City Center, Ahmedabad)
ST1032	12	Reyansh Dave	12th Commerce	Male	977620511	reyansh.dave62@gmail.com	Rajesh Dave	Near City Center, Ahmedabad)
ST1033	13	Pranav Rathod	12th Commerce	Male	984721026	pranav.rathod71@gmail.com	Rajesh Rathod	Near City Center, Gandhinager)
ST1034	14	Atharv Modi	12th Commerce	Female	988944700	atharv.modi43@gmail.com	Hitesh Modi	Near City Center, Ahmedabad)
ST1035	15	Ananya Vora	12th Commerce	Male	986887652	ananya.vora72@gmail.com	Mahesh Vora	Near City Center, Rajkot)
ST1036	16	Aarav Dave	12th Commerce	Male	982058135	aarav.dave17@gmail.com	Kishor Dave	Near City Center, Ahmedabad)
ST1037	17	Vivaan Solanki	12th Commerce	Female	979581974	vivaan.solanki58@gmail.com	Haresh Solanki	Near City Center, Gandhinager)
ST1038	18	Ayaan Bhatt	12th Commerce	Male	978354906	ayaan.bhatt17@gmail.com	Anil Bhatt	Near City Center, Gandhinager)
ST1039	19	Aadhya Zala	12th Commerce	Female	991359959	aadhya.zala78@gmail.com	Manish Zala	Near City Center, Ahmedabad)
ST1040	20	Reyansh Trivedi	12th Commerce	Female	976262220	reyansh.trivedi51@gmail.com	Paresh Trivedi	Near City Center, Gandhinager)
ST1041	1	Neha Pandya	FY	Male	993917745	neha.pandya81@gmail.com	Kirit Pandya	Near City Center, Gandhinager)
ST1042	2	Pooja Patel	FY	Male	992474154	pooja.patel97@gmail.com	Anil Patel	Near City Center, Rajkot)
ST1043	3	Yash Mehta	FY	Female	990039510	yash.mehta62@gmail.com	Manish Mehta	Near City Center, Gandhinager)
ST1044	4	Sai Patel	FY	Male	982606618	sai.patel47@gmail.com	Manish Patel	Near City Center, Rajkot)
ST1045	5	Ishaan Pandya	FY	Female	994853518	ishaan.pandya28@gmail.com	Vijay Pandya	Near City Center, Ahmedabad)
ST1046	6	Meera Jadeja	FY	Male	978046137	meera.jadeja69@gmail.com	Mahesh Jadeja	Near City Center, Gandhinager)
ST1047	7	Krishna Vora	FY	Female	991446180	krishna.vora44@gmail.com	Dhiraj Vora	Near City Center, Junagadh)
ST1048	8	Advik Dave	FY	Male	994337212	advik.dave73@gmail.com	Sanjay Dave	Near City Center, Junagadh)
ST1049	9	Krishna Mehta	FY	Male	974861179	krishna.mehta22@gmail.com	Jatin Mehta	Near City Center, Gandhinager)
ST1050	10	Tanvi Solanki	FY	Female	993592590	tanvi.solanki88@gmail.com	Ramesh Solanki	Near City Center, Gandhinager)
ST1051	11	Riya Vora	FY	Male	973560385	riya.vora30@gmail.com	Uday Vora	Near City Center, Gandhinager)
ST1052	12	Sai Thakkar	FY	Female	999838107	sai.thakkar81@gmail.com	Kishor Thakkar	Near City Center, Ahmedabad)
ST1053	13	Adhira Mehta	FY	Male	981662707	adhira.mehta23@gmail.com	Paresh Mehta	Near City Center, Rajkot)
ST1054	14	Reyansh Bhatt	FY	Male	992624742	reyansh.bhatt45@gmail.com	Vijay Bhatt	Near City Center, Junagadh)
ST1055	15	Aarav Thakkar	FY	Male	972824647	aarav.thakkar98@gmail.com	Vijay Thakkar	Near City Center, Rajkot)
ST1056	16	Pooja Joshi	FY	Female	982681823	pooja.joshi79@gmail.com	Kirit Joshi	Near City Center, Junagadh)
ST1057	17	Ishaan Sanghani	FY	Male	983219515	ishaan.sanghani32@gmail.com	Sanjay Sanghani	Near City Center, Junagadh)
ST1058	18	Atharv Pandya	FY	Male	994577955	atharv.pandya75@gmail.com	Manish Pandya	Near City Center, Junagadh)
ST1059	19	Adhira Rathod	FY	Male	990916771	adhira.rathod61@gmail.com	Ashok Rathod	Near City Center, Ahmedabad)
ST1060	20	Saanvi Shah	FY	Male	985177617	saanvi.shah59@gmail.com	Anil Shah	Near City Center, Junagadh)
ST1061	1	Saanvi Vora	SY	Male	980702957	saanvi.vora33@gmail.com	Kirit Vora	Near City Center, Rajkot)
ST1062	2	Karan Dave	SY	Male	973894299	karan.dave47@gmail.com	Vijay Dave	Near City Center, Junagadh)
ST1063	3	Pooja Dave	SY	Female	984046871	pooja.dave34@gmail.com	Prakash Dave	Near City Center, Gandhinager)
ST1064	4	Adhira Pandya	SY	Female	995693551	adhira.pandya81@gmail.com	Kirit Pandya	Near City Center, Junagadh)
ST1065	5	Diya Vora	SY	Female	993678692	diya.vora56@gmail.com	Ramesh Vora	Near City Center, Rajkot)
ST1066	6	Pranav Vora	SY	Female	991265508	pranav.vora66@gmail.com	Ramesh Vora	Near City Center, Ahmedabad)
ST1067	7	Dev Modi	SY	Male	981019688	dev.modi66@gmail.com	Bharat Modi	Near City Center, Rajkot)
ST1068	8	Aditya Amin	SY	Female	993669602	aditya.amin54@gmail.com	Alpesh Amin	Near City Center, Ahmedabad)
ST1069	9	Atharv Pandya	SY	Male	987315927	atharv.pandya48@gmail.com	Bharat Pandya	Near City Center, Rajkot)
ST1070	10	Ayaan Solanki	SY	Male	980060087	ayaan.solanki23@gmail.com	Prakash Solanki	Near City Center, Ahmedabad)
ST1071	11	Vihaan Shah	SY	Female	981337245	vihaan.shah24@gmail.com	Dinesh Shah	Near City Center, Junagadh)
ST1072	12	Dev Jadeja	SY	Male	994201975	dev.jadeja77@gmail.com	Haresh Jadeja	Near City Center, Ahmedabad)
ST1073	13	Arjun Mehta	SY	Male	999050835	arjun.mehta30@gmail.com	Dhiraj Mehta	Near City Center, Gandhinager)
ST1074	14	Krishna Chauhan	SY	Female	993254843	krishna.chauhan25@gmail.com	Vijay Chauhan	Near City Center, Gandhinager)
ST1075	15	Sai Vora	SY	Female	997266283	sai.vora17@gmail.com	Jignesh Vora	Near City Center, Rajkot)
ST1076	16	Dev Shah	SY	Female	970905890	dev.shah35@gmail.com	Paresh Shah	Near City Center, Rajkot)
ST1077	17	Ananya Sanghani	SY	Female	979108698	ananya.sanghani77@gmail.com	Rajesh Sanghani	Near City Center, Junagadh)
ST1078	18	Arjun Jadeja	SY	Male	979848616	arjun.jadeja50@gmail.com	Kirit Jadeja	Near City Center, Junagadh)
ST1079	19	Arjun Shah	SY	Female	980996543	arjun.shah95@gmail.com	Bharat Shah	Near City Center, Ahmedabad)
ST1080	20	Atharv Patel	SY	Female	994059202	atharv.patel44@gmail.com	Kirit Patel	Near City Center, Junagadh)
ST1081	1	Reyansh Amin	TY	Female	990557461	reyansh.amin68@gmail.com	Hitesh Amin	Near City Center, Gandhinager)
ST1082	2	Aarav Solanki	TY	Female	973311684	aarav.solanki91@gmail.com	Bharat Solanki	Near City Center, Gandhinager)
ST1083	3	Adhira Parmar	TY	Female	982499110	adhira.parmar27@gmail.com	Mahesh Parmar	Near City Center, Gandhinager)
ST1084	4	Vivaan Thakkar	TY	Female	981828024	vivaan.thakkar85@gmail.com	Paresh Thakkar	Near City Center, Rajkot)
ST1085	5	Meera Shah	TY	Male	991044432	meera.shah33@gmail.com	Ramesh Shah	Near City Center, Junagadh)
ST1086	6	Vihaan Modi	TY	Female	990418471	vihaan.modi66@gmail.com	Hitesh Modi	Near City Center, Gandhinager)
ST1087	7	Aadhya Trivedi	TY	Male	994913820	aadhya.trivedi48@gmail.com	Rajesh Trivedi	Near City Center, Gandhinager)
ST1088	8	Meera Parmar	TY	Male	986573498	meera.parmar38@gmail.com	Ajay Parmar	Near City Center, Rajkot)
ST1089	9	Krishna Dave	TY	Female	988989212	krishna.dave87@gmail.com	Ramesh Dave	Near City Center, Junagadh)
ST1090	10	Diya Shah	TY	Male	980780365	diya.shah77@gmail.com	Mahesh Shah	Near City Center, Gandhinager)
ST1091	11	Riya Jadeja	TY	Female	989060096	riya.jadeja12@gmail.com	Haresh Jadeja	Near City Center, Ahmedabad)
ST1092	12	Reyansh Dave	TY	Male	985555036	reyansh.dave55@gmail.com	Rajesh Dave	Near City Center, Junagadh)
ST1093	13	Arjun Trivedi	TY	Female	989151883	arjun.trivedi46@gmail.com	Manish Trivedi	Near City Center, Rajkot)
ST1094	14	Krishna Modi	TY	Male	988389459	krishna.modi93@gmail.com	Ashok Modi	Near City Center, Junagadh)
ST1095	15	Aadhya Parmar	TY	Female	990501700	aadhya.parmar60@gmail.com	Sanjay Parmar	Near City Center, Junagadh)
ST1096	16	Krishna Parmar	TY	Male	986992562	krishna.parmar35@gmail.com	Rajesh Parmar	Near City Center, Junagadh)
ST1097	17	Diya Patel	TY	Female	980682809	diya.patel93@gmail.com	Jatin Patel	Near City Center, Gandhinager)
ST1098	18	Yash Thakkar	TY	Male	981907376	yash.thakkar52@gmail.com	Ashok Thakkar	Near City Center, Rajkot)
ST1099	19	Aditya Solanki	TY	Female	999494283	aditya.solanki62@gmail.com	Mukesh Solanki	Near City Center, Rajkot)
ST1100	20	Adhira Patel	TY	Male	995012740	adhira.patel90@gmail.com	Alpesh Patel	Near City Center, Junagadh)`;

const batchMapping = {
  '11th Commerce': { id: 'B11', name: '11th Commerce', code: '11-COM', course_id: 'C11', timing: '08:00 AM - 10:30 AM', classroom: 'Room 101' },
  '12th Commerce': { id: 'B12', name: '12th Commerce', code: '12-COM', course_id: 'C12', timing: '11:00 AM - 01:30 PM', classroom: 'Room 102' },
  'FY': { id: 'BFY', name: 'FY', code: 'FY-BCA', course_id: 'CFY', timing: '08:00 AM - 10:30 AM', classroom: 'Room 201' },
  'SY': { id: 'BSY', name: 'SY', code: 'SY-BCA', course_id: 'CSY', timing: '11:00 AM - 01:30 PM', classroom: 'Room 202' },
  'TY': { id: 'BTY', name: 'TY', code: 'TY-BCA', course_id: 'CTY', timing: '02:00 PM - 04:30 PM', classroom: 'Room 203' },
};

const courses = [
  { id: 'C11', name: '11th Commerce', code: '11-COM', level: 'Higher Secondary' },
  { id: 'C12', name: '12th Commerce', code: '12-COM', level: 'Higher Secondary' },
  { id: 'CFY', name: 'First Year — Bachelor of Computer Applications', code: 'FY-BCA', level: 'Undergraduate' },
  { id: 'CSY', name: 'Second Year — Bachelor of Computer Applications', code: 'SY-BCA', level: 'Undergraduate' },
  { id: 'CTY', name: 'Third Year — Bachelor of Computer Applications', code: 'TY-BCA', level: 'Undergraduate' },
];

const batches = Object.values(batchMapping).map((b) => ({
  ...b,
  max_capacity: 40,
  is_active: true,
}));

const lines = rawData.trim().split('\n');
const students = [];
const parents = [];
const parentStudents = [];

lines.forEach((line, idx) => {
  const parts = line.split('\t').map((p) => p.trim());
  if (parts.length < 9) return;
  const [sId, rollStr, name, batchName, gender, contact, email, parentName, rawAddr] = parts;
  const rollNo = parseInt(rollStr, 10);
  const cleanAddr = rawAddr.replace(/\)$/, '').trim();
  const bMeta = batchMapping[batchName];

  if (!bMeta) {
    throw new Error(`Unknown batch: ${batchName} at line ${idx + 1}`);
  }

  const studentObj = {
    id: sId,
    admission_no: sId,
    roll_no: rollNo,
    full_name: name,
    batch_id: bMeta.id,
    batch_name: bMeta.name,
    batch_code: bMeta.code,
    gender: gender,
    contact_number: contact,
    phone: contact,
    parent_name: parentName,
    email: email,
    address: cleanAddr,
    status: 'Active',
    created_at: '2026-06-01T08:00:00Z',
  };
  students.push(studentObj);

  const parentId = `P_${sId}`;
  parents.push({
    id: parentId,
    full_name: parentName,
    phone: contact,
    email: email,
    address: cleanAddr,
    telegram_chat_id: null,
    is_verified: true,
    created_at: '2026-06-01T08:00:00Z',
  });

  parentStudents.push({
    id: `PS_${sId}`,
    parent_id: parentId,
    student_id: sId,
    relationship: 'Parent',
    is_primary_contact: true,
    can_receive_alerts: true,
  });
});

console.log(`Parsed ${students.length} students across 5 batches.`);
batches.forEach((b) => {
  const bStudents = students.filter((s) => s.batch_id === b.id);
  console.log(`  - ${b.name} (${b.id}): ${bStudents.length} students, rolls ${bStudents[0].roll_no}..${bStudents[bStudents.length - 1].roll_no}`);
});

// Build canonicalSchoolData.js
const canonicalContent = `/**
 * SMS — Student Management System
 * Production Canonical School Cohort & Student Roster
 * 
 * 100% synchronized with PC Desktop EXE and Android Mobile App.
 * Contains 5 Batches (20 Students each = 100 total students)
 * Direct import from official school Excel roster.
 */

export const CANONICAL_COURSES = ${JSON.stringify(courses, null, 2)};

export const CANONICAL_BATCHES = ${JSON.stringify(batches, null, 2)};

export const CANONICAL_STUDENTS = ${JSON.stringify(students, null, 2)};

export const CANONICAL_PARENTS = ${JSON.stringify(parents, null, 2)};

export const CANONICAL_PARENT_STUDENTS = ${JSON.stringify(parentStudents, null, 2)};

/**
 * Helper to fetch canonical students by batch ID or code
 */
export function getBatchStudents(batchIdentifier) {
  if (!batchIdentifier) return [];
  const cleanId = String(batchIdentifier).trim().toUpperCase();
  
  return CANONICAL_STUDENTS.filter((s) => {
    const bId = String(s.batch_id).trim().toUpperCase();
    const bName = String(s.batch_name).trim().toUpperCase();
    const bCode = String(s.batch_code || '').trim().toUpperCase();
    return bId === cleanId || bName === cleanId || bCode === cleanId;
  });
}

/**
 * Helper to get batch details by ID or code
 */
export function getBatchById(batchIdentifier) {
  if (!batchIdentifier) return null;
  const clean = String(batchIdentifier).trim().toUpperCase();
  return (
    CANONICAL_BATCHES.find(
      (b) =>
        b.id.toUpperCase() === clean ||
        b.code.toUpperCase() === clean ||
        b.name.toUpperCase() === clean
    ) || null
  );
}
`;

fs.writeFileSync(path.resolve('src/data/canonicalSchoolData.js'), canonicalContent, 'utf-8');
console.log('✅ Updated src/data/canonicalSchoolData.js');

// Build school_database.json
const schoolDb = {
  version: 3,
  lastModified: new Date().toISOString(),
  academy: {
    name: 'SMS International Academy',
    code: 'SMS-DEMO-2026',
    address: 'Near City Center, Rajkot, Gujarat',
    phone: '+91 8866039007',
  },
  courses,
  batches,
  students,
  parents,
  parent_students: parentStudents,
};

fs.writeFileSync(path.resolve('src/data/school_database.json'), JSON.stringify(schoolDb, null, 2), 'utf-8');
console.log('✅ Updated src/data/school_database.json');
