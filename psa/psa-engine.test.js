/* Node tests for PSA Trak engine. Run: node psa/psa-engine.test.js */
var fs = require("fs");
var path = require("path");
var vm = require("vm");

function load(file) {
  var code = fs.readFileSync(path.join(__dirname, file), "utf8");
  vm.runInThisContext(code, { filename: file });
}

load("psa-engine.js");
load("psa-catalog.js");
load("psa-seed.js");

var E = global.PsaEngine;
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

var hist = global.PSA_SEED_HISTORICAL;
var t3 = hist.cgc2019.tasks[0];
var t4 = hist.cgc2019.tasks[1];
var hcea = hist.hcea2018.tasks[0];

assert("T3 spent matches spreadsheet", nearly(E.taskSpent(t3), 497482.26), E.taskSpent(t3));
assert("T3 allocated matches spreadsheet", nearly(E.taskAllocated(t3), 594993.26), E.taskAllocated(t3));
assert("T3 unallocated matches spreadsheet", nearly(E.taskUnallocated(t3), 4981.74), E.taskUnallocated(t3));
assert("T3 returned remainder", nearly(
  t3.qps.reduce(function (s, q) { return s + E.qpReturned(q); }, 0),
  13588.24
));
assert("T4 spent", nearly(E.taskSpent(t4), 157705.02), E.taskSpent(t4));
assert("T4 allocated", nearly(E.taskAllocated(t4), 228671.50), E.taskAllocated(t4));
assert("HCEA spent", nearly(E.taskSpent(hcea), 35540.25), E.taskSpent(hcea));
assert("HCEA allocated", nearly(E.taskAllocated(hcea), 73754.50), E.taskAllocated(hcea));

var port = t3.qps.find(function (q) { return q.qpNumber === "1"; });
assert("Port Mahon remaining", nearly(E.qpRemaining(port), 72789.75), E.qpRemaining(port));
assert("Port Mahon status invoicing", E.deriveQpStatus(port) === "invoicing", E.deriveQpStatus(port));

var closed = t3.qps.find(function (q) { return q.qpNumber === "2"; });
assert("Closed QP remaining is 0", E.qpRemaining(closed) === 0);
assert("Closed QP returns leftover", nearly(E.qpReturned(closed), 2300.75), E.qpReturned(closed));

var canceled = t3.qps.find(function (q) { return q.qpNumber === "9"; });
assert("Canceled QP status", E.deriveQpStatus(canceled) === "canceled");

/* Proposal → NTP → invoice checklist */
var contract = {
  payItems: global.PsaCatalog.cloneCatalog().map(function (it) {
    if (it.code === "605545") it.unitPrice = 42;
    if (it.code === "763589N") it.unitPrice = 1500;
    if (it.code === "605541") it.unitPrice = 85;
    return it;
  }),
};
var task = E.emptyTask("1", 50000);
var qp = E.emptyQp(task, "1");
qp.project = "Example Bridge";
qp.proposal = {
  status: "draft",
  lines: [
    { itemCode: "763589N", description: "Mob truck NCC", unit: "EA", proposedQty: 1, unitPrice: 1500 },
    { itemCode: "605545", description: "Soil borings land", unit: "LF", proposedQty: 80, unitPrice: 42 },
    { itemCode: "605541", description: "Shelby", unit: "EA", proposedQty: 4, unitPrice: 85 },
  ],
};
var review = E.reviewProposal(contract, qp.proposal);
assert("Clean proposal has no fail flags", review.flags.filter(function (f) { return f.severity === "fail"; }).length === 0);
assert("Proposal total 5240", nearly(review.total, 1500 + 80 * 42 + 4 * 85), review.total);

qp.proposal.lines[1].reviewedQty = 60;
assert("Adjusted proposal total 4360", nearly(E.proposalTotal(qp.proposal), 1500 + 60 * 42 + 4 * 85));

E.issueNtp(qp, "2026-08-01", "Proceed");
assert("NTP amount uses reviewed qty", nearly(qp.ntpAmount, 4360), qp.ntpAmount);
assert("NTP has 3 lines", qp.ntpLines.length === 3);

task.qps = [qp];

var inv = E.emptyInvoice("INV-1");
inv.date = "2026-08-20";
inv.lines = [
  { itemCode: "763589N", description: "Mob", unit: "EA", qty: 1, unitPrice: 1500 },
  { itemCode: "605545", description: "SPT", unit: "LF", qty: 40, unitPrice: 42 },
];
inv.amount = E.sumLines(inv.lines);
inv.adminChecks = { logs_received: true, samples_delivered: true, mot_ok: true, work_complete: true, backup: true };

var ck = E.buildInvoiceChecklist(contract, task, qp, inv);
assert("Partial invoice overall pass", ck.overall === "pass", JSON.stringify(ck.checks.filter(function (c) { return c.status !== "pass"; })));
assert("Remaining after 1180", nearly(ck.remainingAfter, 4360 - 3180), ck.remainingAfter);

/* Over-quantity should fail */
var inv2 = E.emptyInvoice("INV-2");
inv2.date = "2026-09-01";
inv2.lines = [
  { itemCode: "605545", description: "SPT", unit: "LF", qty: 30, unitPrice: 42 },
];
inv2.amount = E.sumLines(inv2.lines);
qp.invoices = [Object.assign({}, inv, { status: "posted" })];
var ck2 = E.buildInvoiceChecklist(contract, task, qp, inv2);
var qtyCheck = ck2.checks.find(function (c) { return c.id === "quantities"; });
assert("Over remaining qty fails", qtyCheck.status === "fail", qtyCheck.detail);

/* Over NTP dollars */
var inv3 = E.emptyInvoice("INV-3");
inv3.date = "2026-09-01";
inv3.amount = 99999;
inv3.lines = [];
var ck3 = E.buildInvoiceChecklist(contract, task, qp, inv3);
var ntpCheck = ck3.checks.find(function (c) { return c.id === "within_ntp_balance"; });
assert("Over NTP dollars fails", ntpCheck.status === "fail");

/* Price mismatch */
var inv4 = E.emptyInvoice("INV-4");
inv4.date = "2026-08-20";
inv4.lines = [{ itemCode: "763589N", qty: 1, unitPrice: 2000, unit: "EA" }];
inv4.amount = 2000;
qp.invoices = [];
var ck4 = E.buildInvoiceChecklist(contract, task, qp, inv4);
var priceCheck = ck4.checks.find(function (c) { return c.id === "unit_prices"; });
assert("Wrong unit price fails", priceCheck.status === "fail", priceCheck.detail);

/* Invoice before NTP */
var inv5 = E.emptyInvoice("INV-5");
inv5.date = "2026-07-01";
inv5.amount = 100;
var ck5 = E.buildInvoiceChecklist(contract, task, qp, inv5);
var dateCheck = ck5.checks.find(function (c) { return c.id === "invoice_date"; });
assert("Invoice before NTP fails", dateCheck.status === "fail");

/* Catalog has expected drilling items */
var codes = global.PsaCatalog.ITEMS.map(function (i) { return i.code; });
assert("Catalog includes land borings", codes.indexOf("605545") >= 0);
assert("Catalog includes barge mob", codes.indexOf("763591N") >= 0);
assert("Catalog includes lab UCS", codes.indexOf("LAB-UCS") >= 0);

/* Tracker sheet parser */
var rows = [
  ["Task #:", "", 3],
  ["QP #", "Contract", "Project", "Notes", "x", "y", "QP Closed", "spent", "Date", "NTP Amount", "Date", "Amount"],
  [1, "T202270302", "Port Mahon", "", "", "", "", "", "2024-08-22", 246252, "2024-09-24", 51660.75],
  [2, "T202109001", "I-95 Lighting", "taken from consultant", "", "", "Yes", "", "2024-08-29", 17496, "2024-09-30", 15195.25],
];
var parsed = E.parseTrackerSheet(rows);
assert("Parsed 2 QPs", parsed.qps && parsed.qps.length === 2, parsed.error || (parsed.qps && parsed.qps.length));
assert("Parsed NTP amount", nearly(parsed.qps[0].ntpAmount, 246252));
assert("Parsed closed leftover", nearly(parsed.qps[1].returnedRemainder, 17496 - 15195.25));

if (fails) {
  console.error("\n" + fails + " failed");
  process.exit(1);
}
console.log("\nAll tests passed");
