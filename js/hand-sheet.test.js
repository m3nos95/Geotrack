'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const next = require('./next-sample.js');
const sheets = require('./hand-sheet.js');
const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'deldot-sampletrack.html'), 'utf8');
const page = fs.readFileSync(path.join(__dirname, 'hand-sheet-page.js'), 'utf8');
const edge = fs.readFileSync(path.join(root, 'supabase/functions/labtrak-ai/index.ts'), 'utf8');

const field = sheets.sheetById('field');
const concrete = sheets.sheetById('concrete');
const fieldIds = sheets.fieldsOf(field).map(function (field) { return field.id; });
const concreteIds = sheets.fieldsOf(concrete).map(function (field) { return field.id; });

assert.ok(fieldIds.includes('sample_number') && fieldIds.includes('contract'));
assert.notStrictEqual(fieldIds.indexOf('sample_number'), fieldIds.indexOf('contract'));
assert.ok(concreteIds.includes('sample_number') && concreteIds.includes('contract'));
assert.ok(fieldIds.includes('fa_project') && fieldIds.includes('agg_material'));
assert.ok(concreteIds.includes('cast_date') && concreteIds.includes('required_fc') && concreteIds.includes('age_28'));

const printed = sheets.printDocument(field, { qrDataUrl: 'data:image/png;base64,abc' });
assert.ok(printed.includes('data-field="sample_number"'));
assert.ok(printed.includes('data-field="contract"'));
assert.strictEqual((printed.match(/data-field="/g) || []).length, fieldIds.length);
assert.ok(printed.includes('class="qr"'));
assert.ok(printed.includes('Scan for the next sample'));
assert.ok(printed.includes('DelDOT Materials'));
assert.ok(!/bridge|silhouette/i.test(printed));
assert.ok(!sheets.printDocument(field, {}).includes('class="qr"'));

const read = sheets.normalizeRead(field, {
  sample_number: ' 1143 ',
  contract: 'n/a',
  date: '3/4/2026',
  extra: 'ignore'
});
assert.strictEqual(read.sample_number, '1143');
assert.strictEqual(read.contract, '');
assert.strictEqual(read.date, '2026-03-04');
assert.strictEqual(read.extra, undefined);
assert.ok(sheets.buildPrompt(concrete).includes('sample_number'));
assert.ok(sheets.buildPrompt(concrete).includes('Do not guess'));

const url = next.payloadUrl('https://lab.example/deldot-sampletrack.html?sample=old', 'field', 'abc');
const parsed = next.parseScan(url);
assert.strictEqual(parsed.type, 'next');
assert.strictEqual(parsed.section, 'field');
assert.strictEqual(parsed.report, 'abc');
assert.strictEqual(next.parseScan('LTNEXT|concrete|set-9').section, 'concrete');
assert.strictEqual(next.parseScan('https://lab.example/?sample=bag-1').type, 'sample');
assert.strictEqual(next.parseScan('https://lab.example/?sample=bag-1').id, 'bag-1');

const ordered = next.sortFieldSamples([
  { id: 'b', test_no: '20', created_at: '2026-02-01', test_category: 'soil' },
  { id: 'a', test_no: '3', created_at: '2026-03-01', test_category: 'aggregate' },
  { id: 'c', test_no: '3', created_at: '2026-01-01', test_category: 'soil' },
  { id: 'gone', test_no: '1', deleted_at: '2026-01-01' },
  { id: 'mix', test_no: '9', test_category: 'concrete' },
  { id: 'set', cylinders: [{}], pourLocation: 'deck' }
]);
assert.deepStrictEqual(ordered.map(function (row) { return row.id; }), ['c', 'a', 'b']);
assert.strictEqual(next.nextAfter(ordered, '').status, 'none');
assert.strictEqual(next.nextAfter(ordered, 'missing').status, 'missing');
assert.strictEqual(next.nextAfter(ordered, 'b').status, 'none');
assert.strictEqual(next.nextAfter(ordered, 'c').item.id, 'a');
assert.ok(next.noneMessage('field').includes('Field Control'));
assert.ok(next.noneMessage('concrete').includes('Concrete'));
assert.ok(next.missingMessage('concrete').includes('Concrete'));

const sets = next.sortConcreteSets([
  { id: 'later', castDate: '2026-05-02' },
  { id: 'first', cast_date: '2026-05-01' },
  { id: '' }
]);
assert.deepStrictEqual(sets.map(function (set) { return set.id; }), ['first', 'later']);
assert.strictEqual(next.nextAfter(sets, 'first').item.id, 'later');
assert.ok(next.payloadUrl('https://lab.example/app.html', 'concrete', 'first').includes('section=concrete'));
assert.ok(next.payloadUrl('https://lab.example/app.html', 'concrete', 'first').includes('ltnext=1'));
assert.ok(!next.payloadUrl('https://lab.example/app.html', 'field', 'abc').includes('ltreport'));

const fieldReport = next.payloadThisUrl('https://lab.example/deldot-sampletrack.html?ltnext=1', 'field', 'sample-a');
const labReport = next.payloadThisUrl('https://lab.example/app.html', 'lab', 'lab-9');
const concreteReport = next.payloadThisUrl('https://lab.example/app.html', 'concrete', 'set-2');
assert.strictEqual(next.parseScan(fieldReport).type, 'this');
assert.strictEqual(next.parseScan(fieldReport).section, 'field');
assert.strictEqual(next.parseScan(fieldReport).report, 'sample-a');
assert.ok(!fieldReport.includes('ltnext'));
assert.strictEqual(next.parseScan(labReport).section, 'lab');
assert.strictEqual(next.parseScan(concreteReport).section, 'concrete');
assert.strictEqual(next.parseScan('LTREPORT|lab|lab-9').type, 'this');
assert.strictEqual(next.parseScan('LTREPORT|lab|lab-9').report, 'lab-9');
assert.strictEqual(next.parseScan('https://lab.example/?ltreport=1&section=nope&report=x').section, '');

assert.ok(/id="aiKey"/.test(html));
assert.ok(/onclick="saveAiKey\(\)"/.test(html));
assert.ok(/ANTHROPIC_API_KEY/.test(html));
assert.ok(/hsPrintSheet\('field'\)/.test(html));
assert.ok(/hsPrintSheet\('concrete'\)/.test(html));
assert.ok(/hsPhotograph\('field'\)/.test(html));
assert.ok(/hsPhotograph\('concrete'\)/.test(html));
assert.ok(/id="hsReview"/.test(html));
assert.ok(/hsConfirmRead\(\)/.test(html));
assert.ok(/js\/next-sample\.js\?v=20261123a/.test(html));
assert.ok(/js\/hand-sheet\.js\?v=20261123a/.test(html));
assert.ok(/js\/hand-sheet-page\.js\?v=20261123a/.test(html));
assert.ok(!/ltNextQrHtml\(/.test(html));
assert.strictEqual((html.match(/ltThisQrHtml\('field', sample\.id\)/g) || []).length, 2);
assert.strictEqual((html.match(/ltThisQrHtml\('lab', sample\.id\)/g) || []).length, 2);
assert.strictEqual((html.match(/ltThisQrHtml\('concrete', set\.id\)/g) || []).length, 2);
assert.ok(/params\.get\('ltreport'\)/.test(html));
assert.ok(/params\.get\('ltnext'\)/.test(html));
assert.ok(/ltOpenThisSample/.test(html));
assert.ok(/ltHandleScanText/.test(html));
assert.ok(/A report QR opens that same sample/.test(html));
assert.ok(/payloadThisUrl/.test(page));
assert.ok(/section === 'lab'/.test(page));
assert.ok(/switchView\('soillab'\)/.test(page));
assert.ok(/fcResumeSessionById\(id\)/.test(page));
assert.ok(/openConcreteSet\(id\)/.test(page));
assert.ok(/if \(!Next \|\| !String\(reportId \|\| ''\)\.trim\(\)\) return '';/.test(page));
assert.ok(!/vision\.googleapis|documentTextDetection|TEXT_DETECTION/.test(html + page + edge));

const sheetButtons = html.split('hs-sheet-card').slice(1).map(function (chunk) { return chunk.slice(0, 700); }).join('\n');
assert.ok(!/startFC_Session|submitConcreteIntake|submitFieldSample/.test(sheetButtons));
assert.ok(/async function confirmField/.test(page));
assert.ok(/startFC_Session\(/.test(page));
assert.ok(/submitConcreteIntake\(/.test(page));
assert.ok(/setAttribute\('capture', 'environment'\)/.test(page));
assert.ok(/Nothing is saved/.test(page));

assert.ok(/ANTHROPIC_API_KEY/.test(edge));
assert.ok(/4096/.test(edge));
assert.ok(/x-labtrak-ai-key/.test(edge));
assert.ok(!/openai|googleapis/.test(edge));

console.log('hand-sheet tests passed');
