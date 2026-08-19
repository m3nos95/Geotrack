'use strict';
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const Engine = require('./sos-engine.js');
const { looksLikeSosGrid, jobSlug, needsReview, writeJobFolder } = require('./watch-inbox.js');

function gridFromObjects(headerRows, items) {
  const rows = headerRows.map(r => {
    const row = Array(9).fill('');
    Object.entries(r).forEach(([k, v]) => { row[Number(k)] = v; });
    return row;
  });
  rows.push(['Specification #', '', 'Item Description', 'Plan sheet included with', 'Material', 'Supplier', '', 'Manufacturer', 'Alternate Manufacturer']);
  rows.push(['', '', '', 'Material Requirements?', '', '', '', 'Address & Contact', 'Address & Contact']);
  for (const item of items) {
    rows.push(item[0]);
    for (const cont of item.slice(1)) rows.push(cont);
    rows.push(Array(9).fill(''));
  }
  return rows;
}

const HEADER = [
  { 6: 'Agreement /Permit/Contract/Application #:' },
  { 6: 'Title of Contract:', 7: 'Bobby Frey Entrance(s)' },
  { 0: 'Source of Supply' },
  { 0: 'Materials & Research', 7: 'Contractor: Terra Firma of Delmarva, Inc. ' },
  { 7: 'Address: 38156 Brittingham Rd., Delmar, DE 19940' },
  { 7: 'Date:7/6/26' },
  { 1: 'District: South ' },
  { 7: 'DelDOT Contact: James Smith ' },
];
const GABC = [[
  ['', 301003.0, 'Graded Aggregate', '', 'GABC', 'Vulcan Materials', '', '1002  Parsons Rd. ', ''],
  ['', '', '', '', '', '', '', 'Salisbury, MD 21801', ''],
]];

assert.ok(looksLikeSosGrid(gridFromObjects(HEADER, GABC)));
assert.ok(!looksLikeSosGrid([['Invoice', 'Amount'], ['Acme', '12.00']]));

const result = Engine.processGrid(gridFromObjects(HEADER, GABC), { filename: 'DEL DOT - SOS - Frey.xls' });
assert.ok(needsReview(result), 'blank application number needs review');
assert.ok(/Frey|Terra|2026-07-06/.test(jobSlug(result.project, 'Frey.xls')));

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sos-watch-'));
const fakeXls = path.join(tmp, 'DEL DOT - SOS - Frey.xls');
fs.writeFileSync(fakeXls, 'placeholder');
const written = writeJobFolder(tmp, result, fakeXls);
assert.strictEqual(written.bucket, 'needs-review');
assert.ok(fs.existsSync(path.join(written.dest, 'letter.txt')));
assert.ok(fs.existsSync(path.join(written.dest, 'letter.html')));
assert.ok(fs.existsSync(path.join(written.dest, 'REVIEW.txt')));
assert.ok(fs.existsSync(path.join(written.dest, 'job.json')));
assert.ok(fs.existsSync(path.join(written.dest, 'DEL DOT - SOS - Frey.xls')));
const letter = fs.readFileSync(path.join(written.dest, 'letter.txt'), 'utf8');
assert.ok(/James Smith/.test(letter));
assert.ok(/Aaron Wieczorek/.test(letter));
assert.ok(/#301003/.test(letter));
const html = fs.readFileSync(path.join(written.dest, 'letter.html'), 'utf8');
assert.ok(/SECTION:/.test(html));
assert.ok(/REVIEW/.test(html));
const review = fs.readFileSync(path.join(written.dest, 'REVIEW.txt'), 'utf8');
assert.ok(/blank/i.test(review));

const filled = Engine.processGrid(gridFromObjects([
  { 6: 'Agreement /Permit/Contract/Application #:', 7: '0000016055' },
  ...HEADER.slice(1),
], GABC));
assert.ok(filled.project.contract);
assert.ok(!needsReview(filled), 'must-be-tested with an application number is a complete letter');

console.log('OK inbox watch writer', written.dest);
