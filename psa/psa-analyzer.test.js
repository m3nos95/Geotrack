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
assert("Looks like a request sheet", A.looksLikeRequest(sheet) === true);
assert("Looks like a proposal when item lines are present", A.looksLikeProposal("Item No Description Units\n2 ADDITIONAL 9.00 Each X 18.00 162.00\nTotal Amount Due: $162.00") === true);

if (fails) {
  console.error("\n" + fails + " failed");
  process.exit(1);
}
console.log("\nAll analyzer tests passed");
