import assert from 'assert';
import { extractStandardAndSection, groupBatchesByStandard } from '../src/lib/classHierarchyHelper.js';

console.log('--- Testing Class & Section Hierarchy Logic ---');

// 1. Single standalone batch
const single = extractStandardAndSection({ name: '12th Commerce', code: '12-COM' });
assert.strictEqual(single.standard, '12th Commerce');
assert.strictEqual(single.section, 'A');
console.log('✓ Single standalone batch parsed properly');

// 2. Multi-section batch: 11th-A and 11th-B
const batchA = extractStandardAndSection({ name: '11th Commerce — Division A', code: '11-COM-A' });
const batchB = extractStandardAndSection({ name: '11th Commerce — Division B', code: '11-COM-B' });
assert.strictEqual(batchA.standard, '11th Commerce');
assert.strictEqual(batchA.section, 'A');
assert.strictEqual(batchB.standard, '11th Commerce');
assert.strictEqual(batchB.section, 'B');
console.log('✓ Multi-division 11th-A and 11th-B extracted successfully');

// 3. Hierarchical grouping test
const testBatches = [
  { id: 'b1', name: '11th Commerce — Div A', code: '11-COM-A' },
  { id: 'b2', name: '11th Commerce — Div B', code: '11-COM-B' },
  { id: 'b3', name: '12th Commerce', code: '12-COM' },
  { id: 'b4', name: 'FY', code: 'FY-BCA' },
];

const groups = groupBatchesByStandard(testBatches);
assert.strictEqual(groups.length, 3, 'Should produce 3 distinct standards (11th, 12th, FY)');

const g11 = groups.find(g => g.standardName === '11th Commerce');
assert.ok(g11, '11th Commerce group must exist');
assert.strictEqual(g11.hasMultipleSections, true, '11th Commerce must have hasMultipleSections = true');
assert.strictEqual(g11.sections.length, 2, '11th Commerce must have 2 sections (A, B)');

const g12 = groups.find(g => g.standardName === '12th Commerce');
assert.ok(g12, '12th Commerce group must exist');
assert.strictEqual(g12.hasMultipleSections, false, '12th Commerce must have hasMultipleSections = false (single class)');
assert.strictEqual(g12.sections.length, 1, '12th Commerce must have 1 section');

console.log('--- ALL CLASS HIERARCHY TESTS PASSED! ---');
