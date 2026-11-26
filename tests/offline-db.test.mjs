// The offline database must behave like the pages expect (these three broke exams for offline schools).
import test from 'node:test';
import assert from 'node:assert/strict';

// Just enough of IndexedDB for databaseAdapter: named stores of records keyed by id.
const stores = new Map();
const request = (result) => {
  const req = {};
  queueMicrotask(() => { req.result = result; req.onsuccess?.({ target: req }); });
  return req;
};
const db = {
  objectStoreNames: { contains: () => true },
  transaction: (name) => {
    const store = stores.get(name) || stores.set(name, new Map()).get(name);
    const tx = {
      objectStore: () => ({
        getAll: () => request([...store.values()].map((r) => ({ ...r }))),
        put: (r) => { store.set(r.id, { ...r }); return request(r.id); },
        delete: (id) => { store.delete(id); return request(); },
      }),
    };
    setTimeout(() => tx.oncomplete?.(), 0);
    return tx;
  },
};
globalThis.window = { indexedDB: { open: () => request(db) }, dispatchEvent: () => true };
const { createLocalTableQueryBuilder: from } = await import('../src/lib/databaseAdapter.js');

test('a student without a status counts as active (Excel imports)', async () => {
  await from('students').insert([{ id: 's1', full_name: 'A', batch_id: 'b1' }, { id: 's2', full_name: 'B', batch_id: 'b1', status: 'inactive' }]);
  const { data } = await from('students').select('*').eq('status', 'active');
  assert.deepEqual(data.map((s) => s.id), ['s1']);
});

test('saving marks again changes the same row', async () => {
  await from('exam_marks').upsert([{ exam_id: 'e1', student_id: 's1', marks_obtained: 40 }]);
  await from('exam_marks').upsert([{ exam_id: 'e1', student_id: 's1', marks_obtained: 75 }]);
  const { data } = await from('exam_marks').select('*').eq('exam_id', 'e1');
  assert.equal(data.length, 1);
  assert.equal(data[0].marks_obtained, 75);
});

test('exams and results carry their class', async () => {
  await from('courses').insert([{ id: 'c1', name: 'Class 8', code: 'STD8' }]);
  await from('batches').insert([{ id: 'b1', name: 'Class 8 A', code: 'STD8-A', course_id: 'c1' }]);
  await from('exams').insert([{ id: 'e1', name: 'Unit Test', course_id: 'c1', batch_id: 'b1' }]);
  const exams = await from('exams').select('id, name, batches:batch_id(name)');
  assert.equal(exams.data[0].batches.name, 'Class 8 A');
  const marks = await from('exam_marks').select('id, exams:exam_id(name)').eq('student_id', 's1');
  assert.equal(marks.data[0].exams.name, 'Unit Test');
  assert.equal(marks.data[0].exams.batches.name, 'Class 8 A');
});
