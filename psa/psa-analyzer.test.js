/* Node tests for the ConTrak boring-request analyzer. Run: node psa/psa-analyzer.test.js */
var fs = require("fs");
var path = require("path");
var vm = require("vm");

function load(file) {
  var code = fs.readFileSync(path.join(__dirname, file), "utf8");
  vm.runInThisContext(code, { filename: file });
}

load("psa-engine.js");
load("psa-catalog.js");
load("psa-templates.js");
load("psa-seed.js");
load("psa-analyzer.js");

var E = global.PsaEngine;
var A = global.PsaAnalyzer;
var fails = 0;
function assert(name, cond, extra) {
  if (!cond) {
    fails++;
    console.error("FAIL", name, extra || "");
  } else {
    console.log("ok  ", name);
  }
}
function nearly(a, b) {
  return Math.abs(E.money(a) - E.money(b)) < 0.011;
}

function hydrate(raw, prices) {
  var c = JSON.parse(JSON.stringify(raw));
  c.payItems = global.PsaCatalog.applyPrices(global.PsaCatalog.cloneCatalog(), prices);
  global.PsaSeed.applyPackets(c);
  return c;
}

var cgc = hydrate(global.PSA_SEED_HISTORICAL.cgc2019, global.PsaSeed.CGC_PRICES);
var hcea = hydrate(global.PSA_SEED_HISTORICAL.hcea2018, global.PsaSeed.HCEA_PRICES);
var contracts = [cgc, hcea];

var sheet = [
  "SOIL BORING REQUEST SHEET",
  "DelDOT · BDM Figure 105-2 / DRC",
  "Contract Number: T202104202",
  "Contract Name: SR12 and SR15 Intersection Improvements",
  "County: Kent",
  "Access: ATV",
  "MOT: two-lane two-way with shoulder closure (TA-3)",
  "Boring No. Location Total Depth (ft) T206 continuous (ft) Infil DNREC Rock (ft)",
  "B1 Kent County, ATV, shoulder 10 10 Y Y 0",
  "B2 Kent County, ATV, shoulder 10 10 Y Y 0",
  "B3 Kent County, ATV, shoulder 10 10 Y Y 0",
  "B4 Kent County, ATV, shoulder 10 10 Y Y 0",
  "B5 Kent County, ATV, shoulder 10 10 Y Y 0",
  "B6 Kent County, ATV, shoulder 10 10 Y Y 0",
  "B7 Kent County, ATV, shoulder 10 10 Y Y 0",
].join("\n");

var parsedSheet = A.parseBoringRequest(sheet);
assert("Sheet reads contract T#", parsedSheet.contractNo === "T202104202", parsedSheet.contractNo);
assert("Sheet reads project name", /SR12 and SR15/i.test(parsedSheet.projectName), parsedSheet.projectName);
assert("Sheet counts 7 borings", parsedSheet.boringCount === 7, parsedSheet.boringCount);
assert("Sheet footage 70 LF", nearly(parsedSheet.soilLf, 70), parsedSheet.soilLf);
assert("Sheet county Kent", parsedSheet.county === "K", parsedSheet.county);
assert("Sheet access ATV", parsedSheet.access === "atv", parsedSheet.access);
assert("Sheet MOT shoulder", parsedSheet.mot === "shoulder", parsedSheet.mot);
assert("Sheet infil at each hole", parsedSheet.infilCount >= 1, parsedSheet.infilCount);

var narrative = [
  "Boring request",
  "Project: DE42 at SR1",
  "Contract T202604703",
  "Kent County ATV access, shoulder closure",
  "1 boring at 40 feet",
  "DNREC permit required",
  "GPS locate the boring",
].join("\n");
var parsedNar = A.parseBoringRequest(narrative);
assert("Narrative boring count 1", parsedNar.boringCount === 1, parsedNar.boringCount);
assert("Narrative 40 LF", nearly(parsedNar.soilLf, 40), parsedNar.soilLf);
assert("Narrative Kent ATV shoulder", parsedNar.county === "K" && parsedNar.access === "atv" && parsedNar.mot === "shoulder");

var t3h = hcea.tasks.find(function (t) { return String(t.number) === "3"; });
var qp4 = t3h.qps.find(function (q) { return q.qpNumber === "4"; });
var hceaScope = A.scopeFromProposal(qp4.proposal.lines);
assert("HCEA QP4 reverse-engineers 320 LF", nearly(hceaScope.soilLf, 320), hceaScope.soilLf);
assert("HCEA QP4 reverse-engineers 4 borings", hceaScope.boringCount === 4, hceaScope.boringCount);
var hceaEx = A.extrasFromLines(qp4.proposal.lines, hceaScope);
assert("HCEA QP4 billed 145 misc hours", nearly(hceaEx.miscHours, 145), hceaEx.miscHours);
assert("HCEA QP4 billed 50 PM hours", nearly(hceaEx.pmHours, 50), hceaEx.pmHours);

var t4p = cgc.tasks.find(function (t) { return String(t.number) === "4"; });
var qp19 = t4p.qps.find(function (q) { return q.qpNumber === "19"; });
var cgc19 = A.extrasFromLines(qp19.proposal.lines, A.scopeFromProposal(qp19.proposal.lines));
assert("CGC QP19 billed 0 misc hours", nearly(cgc19.miscHours, 0), cgc19.miscHours);

var profiles = A.buildProfiles(contracts, []);
var cgcP = profiles.find(function (p) { return p.agreementCode === "2019F"; });
var hceaP = profiles.find(function (p) { return p.agreementCode === "2018F"; });
assert("CGC profile learned 3 packets", cgcP && cgcP.jobs.length === 3, cgcP && cgcP.jobs.length);
assert("HCEA profile learned 1 packet", hceaP && hceaP.jobs.length === 1, hceaP && hceaP.jobs.length);
assert("CGC does not treat misc hours as a habit", cgcP && cgcP.miscRate < 0.5, cgcP && cgcP.miscRate);
assert("HCEA treats misc hours as a habit", hceaP && hceaP.miscRate >= 0.5, hceaP && hceaP.miscRate);

var small = A.parseBoringRequest(narrative);
var result = A.analyze(small, contracts, []);
assert("Analyzer ranks two historical contractors", result.estimates.length === 2, result.estimates.length);
assert("Cheapest flag is set", !!(result.cheapest && result.cheapest.cheapest));
assert("CGC is cheapest on a small Kent ATV hole", result.cheapest && result.cheapest.agreementCode === "2019F", result.cheapest && result.cheapest.agreementCode);
var hceaEst = result.estimates.find(function (e) { return e.agreementCode === "2018F"; });
var cgcEst = result.estimates.find(function (e) { return e.agreementCode === "2019F"; });
assert("HCEA estimate is higher than CGC", hceaEst && cgcEst && hceaEst.total > cgcEst.total, hceaEst && cgcEst && hceaEst.total + " vs " + cgcEst.total);
assert(
  "HCEA estimate includes miscellaneous man-hours",
  hceaEst.lines.some(function (l) { return l.itemCode === "763587" && l.qty > 0 && !l.skipped; }),
  JSON.stringify(hceaEst.lines.map(function (l) { return l.itemCode + ":" + l.qty; }))
);
assert(
  "CGC estimate omits miscellaneous man-hours",
  cgcEst.lines.every(function (l) { return l.itemCode !== "763587"; }),
  JSON.stringify(cgcEst.lines.map(function (l) { return l.itemCode + ":" + l.qty; }))
);
assert(
  "HCEA estimate omits DNREC when they do not bill it",
  hceaEst.lines.every(function (l) { return l.itemCode !== "DNREC"; })
);
assert("CGC estimate is in the ballpark of QP19", cgcEst.total > 2500 && cgcEst.total < 6000, cgcEst.total);

var bridge = A.parseBoringRequest([
  "Soil boring request",
  "Project: Replacement of BR 2-039C SR6 Smyrna-Clayton Road",
  "4 borings at 80 feet each",
  "Kent County land access, lane closure MOT",
  "4 shelby tubes",
].join("\n"));
assert("Bridge request 4 x 80 = 320 LF", bridge.boringCount === 4 && nearly(bridge.soilLf, 320), bridge.boringCount + " / " + bridge.soilLf);
var bridgeEst = A.analyze(bridge, contracts, []);
var bridgeCgc = bridgeEst.estimates.find(function (e) { return e.agreementCode === "2019F"; });
var bridgeHcea = bridgeEst.estimates.find(function (e) { return e.agreementCode === "2018F"; });
assert("HCEA still adds misc hours on the bridge-sized job", bridgeHcea.lines.some(function (l) { return l.itemCode === "763587" && l.qty >= 100; }), bridgeHcea.lines.filter(function (l) { return l.itemCode === "763587"; }).map(function (l) { return l.qty; }));
assert("CGC still cheaper than HCEA on the 4-hole land job", bridgeCgc.total < bridgeHcea.total, bridgeCgc.total + " vs " + bridgeHcea.total);

var taught = A.exampleFromPair(small, {
  lines: [
    { itemNo: "9", qty: 80, unitPrice: 32, amount: 2560, unit: "HR" },
    { itemNo: "19", qty: 20, unitPrice: 85, amount: 1700, unit: "HR" },
    { itemNo: "7", qty: 40, unitPrice: 15, amount: 600, unit: "LF" },
  ],
  total: 4860,
  agreementCode: "2018F",
  projectName: "Taught extra misc",
}, hcea);
var afterTeach = A.analyze(small, contracts, [taught]);
var taughtHcea = afterTeach.estimates.find(function (e) { return e.agreementCode === "2018F"; });
assert("Teaching a second HCEA packet keeps misc hours in the estimate", taughtHcea.lines.some(function (l) { return l.itemCode === "763587"; }));
var onlyProp = A.exampleFromPair(null, {
  lines: [
    { itemNo: "7", qty: 80, unitPrice: 15, amount: 1200, unit: "LF" },
    { itemNo: "9", qty: 40, unitPrice: 32, amount: 1280, unit: "HR" },
  ],
  total: 2480,
  agreementCode: "2018F",
  projectName: "Proposal only packet",
}, hcea);
assert("Proposal-only packet still learns 80 LF", nearly(onlyProp.scope.soilLf, 80), onlyProp.scope && onlyProp.scope.soilLf);
assert("Proposal-only packet still learns 40 misc hours", nearly(A.extrasFromLines(onlyProp.lines, onlyProp.scope).miscHours, 40));
var unmappedMisc = A.extrasFromLines([
  { itemNo: "9", description: "MAN-HOUR OF MISCELLANEOUS WORK", proposedQty: 90, unitPrice: 32 },
  { itemNo: "19", description: "MAN-HOUR OF PROJECT MANAGEMENT", proposedQty: 30, unitPrice: 85 },
  { itemNo: "7", description: "SOIL BORINGS, LAND", proposedQty: 40, unitPrice: 15 },
]);
assert("Item 9 without catalog code still counts as misc hours", nearly(unmappedMisc.miscHours, 90), unmappedMisc.miscHours);
assert("Item 19 without catalog code still counts as PM hours", nearly(unmappedMisc.pmHours, 30), unmappedMisc.pmHours);

var stubHcea = {
  id: "2018F",
  code: "2018F",
  contractor: "HCEA",
  payItems: hcea.payItems,
  tasks: [],
};
var sparse = [];
var si;
for (si = 0; si < 7; si++) {
  sparse.push({
    id: "taught-empty-" + si,
    contractorId: "2018F",
    contractorName: "HCEA",
    agreementCode: "2018F",
    project: "No misc parsed " + si,
    lines: [{ itemCode: "605545", itemNo: "7", proposedQty: 40, unitPrice: 15 }],
    source: "trained",
  });
}
sparse.push({
  id: "taught-coolspring",
  contractorId: "2018F",
  contractorName: "HCEA",
  agreementCode: "2018F",
  project: "US9 @ Cool Spring Rd",
  lines: [
    { itemNo: "9", description: "MAN-HOUR OF MISCELLANEOUS WORK", proposedQty: 90, unitPrice: 32 },
    { itemCode: "605545", itemNo: "7", proposedQty: 40, unitPrice: 15 },
  ],
  source: "trained",
});
var sparseProfiles = A.buildProfiles([stubHcea], sparse);
var sparseHcea = sparseProfiles.find(function (p) { return p.agreementCode === "2018F"; });
assert("One misc packet in eight is still an HCEA habit", sparseHcea && sparseHcea.miscRate > 0 && sparseHcea.habits.some(function (h) { return /Adds miscellaneous man-hours/i.test(h); }), sparseHcea && sparseHcea.habits.join(" | "));
var sparseEst = A.analyze(small, [cgc, stubHcea], sparse);
var sparseHceaEst = sparseEst.estimates.find(function (e) { return e.agreementCode === "2018F"; });
assert(
  "HCEA estimate still adds misc hours when only some packets parsed item 9",
  sparseHceaEst && sparseHceaEst.lines.some(function (l) { return l.itemCode === "763587" && l.qty > 0 && !l.skipped; }),
  sparseHceaEst && JSON.stringify(sparseHceaEst.lines.map(function (l) { return l.itemCode + ":" + l.qty; }))
);
assert("Looks like a request sheet", A.looksLikeRequest(sheet) === true);
assert("Looks like a proposal when item lines are present", A.looksLikeProposal("Item No Description Units\n2 ADDITIONAL 9.00 Each X 18.00 162.00\nTotal Amount Due: $162.00") === true);

var report = A.buildReport(result, { date: "2026-09-30", taughtCount: 0 });
assert("Report title", report.title === "Contractor Analysis Report");
assert("Report date is the one passed in", report.dateISO === "2026-09-30");
assert("Report ranks CGC first as cheapest", report.ranking[0] && report.ranking[0].agreementCode === "2019F" && report.ranking[0].cheapest);
assert("Report ranks HCEA second", report.ranking[1] && report.ranking[1].agreementCode === "2018F" && !report.ranking[1].cheapest);
assert("Report savings is HCEA minus CGC", nearly(report.savings, hceaEst.total - cgcEst.total), report.savings);
assert("Report names CGC as cheapest", report.cheapestName === cgcEst.contractorName);
assert(
  "Report program includes the project",
  report.program.some(function (r) { return r.label === "Project" && /DE42 at SR1/i.test(r.value); }),
  JSON.stringify(report.program)
);
assert(
  "Report program includes Kent County",
  report.program.some(function (r) { return r.label === "County" && r.value === "Kent"; })
);
assert(
  "Report program includes ATV access",
  report.program.some(function (r) { return r.label === "Access" && /ATV/i.test(r.value); })
);
assert(
  "Report program includes 1 boring",
  report.program.some(function (r) { return r.label === "Borings" && r.value === "1"; })
);
assert("Report recommendation names the cheapest contractor", /likely cheapest/i.test(report.recommendation), report.recommendation);
assert("Report method says this is not a bid", /Internal estimate, not a bid/i.test(report.method), report.method);
var reportCgc = report.contractors.find(function (e) { return e.agreementCode === "2019F"; });
var reportHcea = report.contractors.find(function (e) { return e.agreementCode === "2018F"; });
assert(
  "Report CGC habit says they do not bill misc hours",
  reportCgc && reportCgc.habits.some(function (h) { return /Does not bill miscellaneous man-hours/i.test(h); }),
  reportCgc && reportCgc.habits.join(" | ")
);
assert(
  "Report HCEA habit says they add misc hours",
  reportHcea && reportHcea.habits.some(function (h) { return /Adds miscellaneous man-hours/i.test(h); }),
  reportHcea && reportHcea.habits.join(" | ")
);
assert(
  "Report HCEA page still has a misc-hours pay item",
  reportHcea && reportHcea.lines.some(function (l) { return l.itemCode === "763587" && l.qty > 0 && !l.skipped; })
);
assert(
  "Report CGC page has no misc-hours pay item",
  reportCgc && reportCgc.lines.every(function (l) { return l.itemCode !== "763587"; })
);
var emptyReport = A.buildReport({ estimates: [] }, { date: "2026-09-30" });
assert("Empty report has no ranking rows", emptyReport.ranking.length === 0);
assert("Empty report explains there are no estimates", /No priced contractor estimates/i.test(emptyReport.recommendation), emptyReport.recommendation);

if (fails) {
  console.error("\n" + fails + " failed");
  process.exit(1);
}
console.log("\nAll analyzer tests passed");
