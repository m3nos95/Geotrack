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

const sourceList = [
  ['Stockpile Location', 'Source', '209B (sand)', '', '209C  (#10 Screenings)', '', 'GABC', '', 'Crushed Concrete'],
  ['', '', 'Sample Date', 'Expire Date', 'Sample Date', 'Expire Date', 'Sample Date', 'Expire Date', 'Sample Date', 'Expire Date'],
  ['Allan Myers - Elk Mills', '', '', '', '2026-06-15', '2026-09-23', '2026-06-15', '2026-09-23', '', ''],
  ['Vulcan Seaford', 'Havre De Grace', '', '', '', '', '2026-07-27', '2026-11-04', '', ''],
  ['New Enterprise - Denver', '', '', '', '', '', 'Failed', '', '', ''],
  ['Patuxent Companies (FKA Goldsboro)', '', '', '', '', '', '2025-04-11', '2025-07-20', 'Failed 2nd', ''],
];
assert.ok(Lists.looksLikeApprovedSourceList('Approved Source List.xlsx', []));
assert.ok(Lists.looksLikeApprovedSourceList('', sourceList));
const asl = Lists.parseApprovedSourceListGrid(sourceList, { filename: 'Approved Source List.xlsx' });
assert.ok(asl.entries.length >= 4);
const elk = Lists.lookupAggregate(asl, 'Allan Myers', 'Elk Mills MD', 'GABC');
assert.strictEqual(elk.status, 'approved');
assert.strictEqual(elk.testDate, '2026-06-15');
const seaford = Lists.lookupAggregate(asl, 'Vulcan Materials', 'Seaford DE', 'GABC');
assert.strictEqual(seaford.status, 'approved');
assert.ok(!Lists.lookupAggregate(asl, 'Vulcan Materials', 'Salisbury MD', 'GABC').found);
assert.strictEqual(Lists.lookupAggregate(asl, 'New Enterprise', 'Denver', 'GABC').status, 'rejected');
assert.strictEqual(Lists.lookupAggregate(asl, 'Patuxent', 'Goldsboro', 'GABC').status, 'expired');

const cbfLiteChart = {
  kind: 'aggregate',
  entries: [
    { name: 'Diamond Materials - Harrington', source: 'York Principio', loc: 'Harrington', material: 'CBF', status: 'rejected' },
    { name: 'Diamond Materials - Harrington', source: 'York Principio', loc: 'Harrington', material: 'CBF Light', status: 'approved', testDate: '2026-08-10' },
  ],
};
const cbfHit = Lists.lookupAggregate(cbfLiteChart, '', 'Harrington DE', 'CHANNEL BED FILL LITE');
assert.strictEqual(cbfHit.status, 'approved');
assert.strictEqual(cbfHit.row.material, 'CBF Light');

const elkGrid = gridFrom(header, [[
  ['', 301001.0, 'GABC', '', 'GABC', 'Allan Myers', '', 'Elk Mills, MD', ''],
]]);
const elkItem = Engine.processGrid(elkGrid, { lists: { aggregate: asl } }).items.find(i => i.family === 'aggregate');
assert.strictEqual(elkItem.action, 'approved');
assert.ok(/Approved for use/.test(elkItem.actionNotes));

const goldsGrid = gridFrom(header, [[
  ['', 301001.0, 'GABC', '', 'GABC', 'Patuxent Companies', '', 'Goldsboro, MD', ''],
]]);
const golds = Engine.processGrid(goldsGrid, { lists: { aggregate: asl } }).items.find(i => i.family === 'aggregate');
assert.strictEqual(golds.action, 'test');
assert.ok(/expired/i.test(golds.actionNotes));

console.log('OK Approved Source List matrix');


const sosDbSheets = [{
  name: 'Standard Items',
  rows: [
    ['Standard Items Source of Supply Database Instructions'],
    ['8. This database was last modified on September 22nd, 2023.'],
    [], [], [], [], [], [], [], [],
    ['Item #', 'UOM', 'Item Description', 'Materials Referenced in Construction Specification', 'Material Requirements in Construction Specifications', 'Source of Supply Contractor Submittal', 'Includes Permanent Steel or Iron?', 'Department Source of Supply Submission Acceptance Method', 'Source of Supply BABA Category ', 'Buy America Requirement'],
    [201000.0, 'LS', 'CLEARING AND GRUBBING', 'NA', 'NA', 'NA', 'No', 'NA', 'Non-Permanent Material - Exempt', 'No Buy America requirement.'],
    [209001.0, 'CY', 'BORROW, TYPE A', 'Borrow', 'Section 1001', 'Borrow', 'No', 'Acceptance Program (see Section 4.1)', 'Section 70917 (c) Material', 'No Buy America requirement.'],
    [207020.0, 'CY', 'STRUCTURAL BACKFILL, BORROW TYPE B, PROVIDING ONLY', 'Borrow', 'Sections 209 and 1001', 'Borrow', 'No', 'Acceptance Program (see Section 4.1)', '', ''],
    [301001.0, 'TON', 'GABC', 'Graded Aggregate', 'Section 1005', 'Graded Aggregate', 'No', 'Acceptance Program (see Section 4.1)', 'Section 70917 (c) Material', ''],
    ['', '', '', 'Geotextile', '', 'Geotextile', 'No', 'Certification of Compliance', '', ''],
    [705001.0, 'SF', 'PCC SIDEWALK, 4"', 'PCC, Class B', 'Section 1022', 'PCC, Class B', 'No', 'Acceptance Program (see Section 4.3)', '', ''],
  ],
}];
assert.ok(Lists.looksLikeSosDatabase('Source_of_Supply_Database.xlsx', []));
assert.ok(Lists.looksLikeSosDatabase('', sosDbSheets));
assert.ok(!Lists.looksLikeAggregateChart('Source_of_Supply_Database.xlsx', []));
const db = Lists.parseSosDatabaseSheets(sosDbSheets, { filename: 'Source of Supply Database.xlsx' });
assert.strictEqual(db.modified, 'September 22nd, 2023');
assert.strictEqual(db.items['201000'].na, true);
assert.strictEqual(db.items['209001'].desc, 'BORROW, TYPE A');
assert.ok(db.items['209001'].methods.includes('AP4.1'));
assert.ok(db.items['301001'].materials.includes('Graded Aggregate'));
assert.ok(db.items['301001'].methods.includes('cert'));
assert.strictEqual(Lists.lookupSosDatabase(db, '#209001').uom, 'CY');

assert.strictEqual(db.items['207020'].desc, 'STRUCTURAL BACKFILL, BORROW TYPE B, PROVIDING ONLY');

const unknownSpecGrid = gridFrom(header, [[
  ['', 207020.0, 'Structural Backfill', '', 'Borrow Type B', 'Kent Sand & Gravel', '', 'Massey, MD', ''],
]]);
const withDb = Engine.processGrid(unknownSpecGrid, { lists: { sosDatabase: db } });
assert.ok(withDb.items.some(i => i.desc === 'STRUCTURAL BACKFILL, BORROW TYPE B, PROVIDING ONLY'));
assert.ok(withDb.items.some(i => i.family === 'borrow'));

const inclinometerSheets = [{
  name: 'Special Provisions',
  rows: [
    ['Item #', 'UOM', 'Item Description', 'Materials Referenced in Construction Specification', '', 'Source of Supply Contractor Submittal', '', 'Department Source of Supply Submission Acceptance Method'],
    [202507.0, 'EACH', 'INCLINOMETERS', 'Inclinometers', '', 'Inclinometers', 'No', 'Certification of Compliance'],
  ],
}];
const spDb = Lists.parseSosDatabaseSheets(inclinometerSheets, { filename: 'db.xlsx' });
const inclGrid = gridFrom(header, [[
  ['', 202507.0, '', '', 'Inclinometers', 'Acme', '', 'Dover, DE', ''],
]]);
const incl = Engine.processGrid(inclGrid, { lists: { sosDatabase: spDb } }).items[0];
assert.strictEqual(incl.desc, 'INCLINOMETERS');
assert.ok(!/Not in the Source of Supply Database/.test((Engine.processGrid(inclGrid, { lists: { sosDatabase: spDb } }).warnings || []).join(' ')));

const snap = require('./lists/sos-database-snapshot.json');
assert.ok(Object.keys(snap.items).length >= 1500, 'bundled SOS Database snapshot');
assert.strictEqual(snap.items['209001'].desc, 'BORROW, TYPE A');
assert.strictEqual(snap.items['201000'].na, true);
assert.ok(snap.items['202507']);
console.log('OK Source of Supply Database snapshot');

