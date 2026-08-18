'use strict';
const assert = require('assert');
const Lists = require('./sos-lists.js');
const Engine = require('./sos-engine.js');

const TACK_TEXT = `
Delaware Department of Transportation Approved Products List Emulsified Asphalt Tack Coats
Asphalt Paving Systems (Hammonton, NJ) CSS-1, CSS-1H, CRS-2, CRS-1H, CRS-1 6/13/2024 Russell Standard (Baltimore, MD) CRS-1, CRS-2, CRS-1H 9/11/2024
Asphalt Emulsion Industries, Inc. (Dumfries, VA) CRS-1, CRS-2, CRS-2L, CSS-1h, CQS-1h 6/13/2024
Specialty Emulsions Inc (York, PA) CRS-1H, CRS-2, CSS-1H 6/13/2024 Christiana Materials (Newark, DE) CRS-1 8/13/2026
Russell Standard (Chambersburg, PA) CSS-1H, CRS-2, CRS-2L 8/21/2025 Russell Standard (Reading, PA) CRS-1, CRS-1h, CRS-2, CRS-2L, CSS-1h, CQS-1h 8/21/2025
Seaboard Asphalt Products (Baltimore, MD) EM-50-TT 6/13/2024
Russell Standard (Baltimore, MD) CNTT 9/11/2024
Date Last Modified: 8/13/2026
`;

const tack = Lists.parseTackAplText(TACK_TEXT);
assert.ok(tack.entries.length >= 6, 'parsed tack sources, got ' + tack.entries.length);
assert.strictEqual(tack.modified, '8/13/2026');
assert.strictEqual(Lists.lookupTack(tack, 'Russell Standard', 'Baltimore MD', 'CRS-1 Tack Coat').listed, true);
assert.strictEqual(Lists.lookupTack(tack, 'Russell Standard', 'Seaford DE', 'CRS-1').listed, false);
assert.ok(Lists.lookupTack(tack, 'Russell Standard', 'Chambersburg PA', 'CRS-1H Tack Coat').gradeMismatch);
assert.strictEqual(Lists.lookupTack(tack, 'Seaboard Asphalt', 'Baltimore MD', 'EM-50-TT').listed, true);
assert.strictEqual(Lists.lookupTack(tack, 'Specialty Emulsions', 'York PA', 'CRS-1H').listed, true);
assert.strictEqual(Lists.lookupTack(tack, 'Unknown Coatings', 'Dover DE', 'CRS-1').listed, null);

const chart = Lists.parseAggregateChartGrid([
  ['Producer', 'Location', 'Material', 'Status', 'Test Date'],
  ['Vulcan Materials', 'Salisbury MD', 'GABC', 'Approved', '6/15/26'],
  ['Vulcan Materials', 'Seaford DE', 'GABC', 'Rejected', ''],
  ['Allan Myers', 'Elk Mills MD', 'GABC', 'Approved', '6/15/2026'],
  ['Porter Road Materials', 'Bear DE', 'Crushed Concrete', 'Approved', '8/1/26'],
]);
assert.strictEqual(chart.entries.length, 4);
assert.ok(Lists.looksLikeAggregateChart('Approved Aggregate Chart.xlsx', []));
const vulc = Lists.lookupAggregate(chart, 'Vulcan Materials', 'Salisbury MD', 'GABC');
assert.strictEqual(vulc.status, 'approved');
assert.strictEqual(vulc.testDate, '2026-06-15');
assert.strictEqual(Lists.lookupAggregate(chart, 'Vulcan Materials', 'Seaford DE', 'GABC').status, 'rejected');
assert.ok(!Lists.lookupAggregate(chart, 'Fake Pit', 'Dover DE', 'GABC').found);

function gridFrom(headerRows, items) {
  const rows = headerRows.map(r => {
    const row = Array(9).fill('');
    Object.entries(r).forEach(([k, v]) => { row[Number(k)] = v; });
    return row;
  });
  rows.push(['Specification #', '', 'Item Description', '', 'Material', 'Supplier', '', 'Manufacturer', 'Alternate Manufacturer']);
  rows.push(['', '', '', '', '', '', '', 'Address & Contact', 'Address & Contact']);
  for (const item of items) {
    rows.push(item[0]);
    for (const cont of item.slice(1)) rows.push(cont);
    rows.push(Array(9).fill(''));
  }
  return rows;
}

const header = [
  { 6: 'Agreement /Permit/Contract/Application #:' },
  { 6: 'Title of Contract:', 7: 'Chart Check' },
  { 0: 'Source of Supply' },
  { 7: 'Contractor: Test' },
  { 7: 'Date:8/18/26' },
  { 1: 'District: North ' },
];

const lists = Lists.mergeBundle(Lists.emptyBundle(), { tack, aggregate: chart });

const gabcGrid = gridFrom(header, [[
  ['', 301001.0, 'GABC', '', 'GABC', 'Vulcan Materials', '', 'Salisbury, MD', ''],
]]);
const approved = Engine.processGrid(gabcGrid, { lists }).items.find(i => i.family === 'aggregate');
assert.strictEqual(approved.action, 'approved');
assert.strictEqual(approved.testDate, '2026-06-15');
assert.ok(/Approved for use/.test(approved.actionNotes));
assert.ok(/Damian Blakely/.test(Engine.processGrid(gabcGrid, { lists: { aggregate: { entries: [] } } }).items[0].actionNotes));

const seafordGabc = Engine.processGrid(gridFrom(header, [[
  ['', 301001.0, 'GABC', '', 'GABC', 'Vulcan Materials', '', 'Seaford, DE', ''],
]]), { lists }).items.find(i => i.family === 'aggregate');
assert.strictEqual(seafordGabc.action, 'not-approved');

const chambersburg = Engine.processGrid(gridFrom(header, [[
  ['', 401501.0, 'Tack Coat', '', 'CRS-1H', 'Tri County', '', 'Russell Standard', ''],
  ['', '', '', '', '', '', '', 'Chambersburg, PA', ''],
]]), { lists }).items.find(i => i.family === 'tack');
assert.strictEqual(chambersburg.action, 'not-approved');
assert.ok(/not listed on tack coat APL/i.test(chambersburg.actionNotes));

const baltimore = Engine.processGrid(gridFrom(header, [[
  ['', 401501.0, 'Tack Coat', '', 'CRS-1', 'Tri County', '', 'Russell Standard', ''],
  ['', '', '', '', '', '', '', 'Baltimore, MD', ''],
]]), { lists }).items.find(i => i.family === 'tack');
assert.ok(baltimore.action === 'apl' || baltimore.action === 'approved');

console.log('OK live APL + aggregate chart lookups');
