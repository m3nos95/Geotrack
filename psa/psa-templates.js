/* ConTrak agreement templates — DelDOT-standard setups Finance can customize.
   Each agreement points at a template. PMs work inside the template; Finance
   edits nouns, workflow steps, money checks, and admin checklist items. */
(function (global) {
  "use strict";

  var UNIT_PRICE_ID = "deldot-psa-unit-price";
  var LUMP_SUM_ID = "deldot-psa-lump-sum";

  var UNIT_PRICE_ADMIN = [
    { id: "logs_received", label: "Boring logs / field records received" },
    { id: "samples_delivered", label: "Samples delivered to the lab" },
    { id: "mot_ok", label: "MOT set up and TMC notified as specified" },
    { id: "work_complete", label: "Invoiced work is complete (or a partial bill is expected)" },
    { id: "backup", label: "Quantity backup (tickets, daily reports) attached" },
  ];

  var LUMP_SUM_ADMIN = [
    { id: "work_complete", label: "Invoiced work is complete (or a partial bill is expected)" },
    { id: "backup", label: "Invoice backup (progress report, deliverable, timesheet) attached" },
    { id: "matches_po", label: "Invoice coding matches the task PO / funding" },
  ];

  var ALL_AUTO = {
    ntp_issued: true,
    qp_open: true,
    invoice_date: true,
    total_vs_lines: true,
    within_ntp_balance: true,
    within_task_po: true,
    unit_prices: true,
    quantities: true,
    no_unknown_items: true,
  };

  function clone(obj) {
    return JSON.parse(JSON.stringify(obj));
  }

  function unitPriceTemplate() {
    return {
      id: UNIT_PRICE_ID,
      name: "DelDOT IDIQ — unit price",
      description:
        "IDIQ paid cost per unit of work. Review a consultant proposal against an independent estimate, pass the §14 NTP gate, then audit invoices against remaining NTP dollars and pay-item quantities.",
      builtin: true,
      assignmentNoun: "QP",
      assignmentNounPlural: "QPs",
      taskNoun: "Task",
      taskNounPlural: "Tasks",
      workflow: { proposal: true, ntp: true, payItems: true, invoices: true, pspNtpGate: true },
      invoiceSlots: 30,
      autoChecks: clone(ALL_AUTO),
      adminChecks: clone(UNIT_PRICE_ADMIN),
      ledgerBanner: "",
      seedCatalog: "subsurface",
    };
  }

  function lumpSumTemplate() {
    return {
      id: LUMP_SUM_ID,
      name: "DelDOT IDIQ — lump sum",
      description:
        "IDIQ paid lump sum when scope and duration are defined enough to set the NTP amount at negotiation. Invoices against that NTP — no unit-price catalog.",
      builtin: true,
      assignmentNoun: "Task Order",
      assignmentNounPlural: "Task Orders",
      taskNoun: "Task",
      taskNounPlural: "Tasks",
      workflow: { proposal: false, ntp: true, payItems: false, invoices: true, pspNtpGate: true },
      invoiceSlots: 30,
      autoChecks: {
        ntp_issued: true,
        qp_open: true,
        invoice_date: true,
        total_vs_lines: false,
        within_ntp_balance: true,
        within_task_po: true,
        unit_prices: false,
        quantities: false,
        no_unknown_items: false,
      },
      adminChecks: clone(LUMP_SUM_ADMIN),
      ledgerBanner: "",
      seedCatalog: "none",
    };
  }

  function defaults() {
    return [unitPriceTemplate(), lumpSumTemplate()];
  }

  function byId(id) {
    var list = defaults();
    for (var i = 0; i < list.length; i++) {
      if (list[i].id === id) return list[i];
    }
    return unitPriceTemplate();
  }

  function emptyCustom(name) {
    var t = lumpSumTemplate();
    t.id = "tpl-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 6);
    t.builtin = false;
    t.name = name || "Custom IDIQ template";
    t.description = "Finance-built IDIQ template for this office.";
    t.assignmentNoun = "Assignment";
    t.assignmentNounPlural = "Assignments";
    t.seedCatalog = "none";
    return t;
  }

  function duplicate(src, newName) {
    var t = clone(src || unitPriceTemplate());
    t.id = "tpl-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 6);
    t.builtin = false;
    t.name = newName || (src && src.name ? src.name + " (copy)" : "Custom IDIQ template");
    return t;
  }

  function ensureShape(t) {
    if (!t || typeof t !== "object") t = unitPriceTemplate();
    if (!t.id) t.id = "tpl-unknown";
    if (!t.name) t.name = "Untitled template";
    if (!t.assignmentNoun) t.assignmentNoun = "QP";
    if (!t.assignmentNounPlural) t.assignmentNounPlural = t.assignmentNoun + "s";
    if (!t.taskNoun) t.taskNoun = "Task";
    if (!t.taskNounPlural) t.taskNounPlural = "Tasks";
    t.workflow = t.workflow || {};
    ["proposal", "ntp", "payItems", "invoices", "pspNtpGate"].forEach(function (k) {
      if (t.workflow[k] == null) t.workflow[k] = true;
    });
    t.invoiceSlots = Number(t.invoiceSlots || 30);
    t.autoChecks = t.autoChecks || clone(ALL_AUTO);
    Object.keys(ALL_AUTO).forEach(function (k) {
      if (t.autoChecks[k] == null) t.autoChecks[k] = ALL_AUTO[k];
    });
    if (!Array.isArray(t.adminChecks)) t.adminChecks = clone(UNIT_PRICE_ADMIN);
    t.adminChecks = t.adminChecks.map(function (a, i) {
      return {
        id: a.id || "admin_" + i,
        label: a.label || "Checklist item",
      };
    });
    t.ledgerBanner = t.ledgerBanner || "";
    t.seedCatalog = t.seedCatalog || (t.workflow.payItems ? "subsurface" : "none");
    return t;
  }

  function mergeDefaults(existing) {
    var list = Array.isArray(existing) ? existing.map(ensureShape) : [];
    var have = {};
    list.forEach(function (t) {
      have[t.id] = true;
    });
    defaults().forEach(function (d) {
      if (!have[d.id]) list.push(d);
    });
    return list;
  }

  function migrateState(state) {
    if (!state || typeof state !== "object") return state;
    if (!state.role) state.role = "pm";
    if (!state.orgName) state.orgName = "DelDOT Materials & Research";
    state.templates = mergeDefaults(state.templates);
    (state.contracts || []).forEach(function (c) {
      if (!c.templateId) {
        var lump =
          /lump/i.test(c.paymentMethod || "") ||
          /lump/i.test(c.agreementType || "");
        c.templateId = lump ? LUMP_SUM_ID : UNIT_PRICE_ID;
      }
      c.agreementType = "IDIQ";
      if (c.paymentMethod !== "Cost per unit of work" && c.paymentMethod !== "Lump sum") {
        c.paymentMethod = /lump/i.test(c.paymentMethod || "") ? "Lump sum" : "Cost per unit of work";
      }
    });
    state.version = Math.max(Number(state.version || 0), 2);
    return state;
  }

  var AUTO_CHECK_META = [
    { id: "ntp_issued", label: "NTP has been issued" },
    { id: "qp_open", label: "Assignment is open (not closed or canceled)" },
    { id: "invoice_date", label: "Invoice date is on or after NTP date (earliest date work may begin)" },
    { id: "total_vs_lines", label: "Invoice total matches line-item extensions" },
    { id: "within_ntp_balance", label: "Invoice does not exceed remaining NTP balance" },
    { id: "within_task_po", label: "Payment stays within the task PO" },
    { id: "unit_prices", label: "Unit prices match the approved NTP / catalog" },
    { id: "quantities", label: "Billed quantities do not exceed remaining NTP quantities" },
    { id: "no_unknown_items", label: "All billed items appear on the NTP" },
  ];

  global.ConTrakTemplates = {
    UNIT_PRICE_ID: UNIT_PRICE_ID,
    LUMP_SUM_ID: LUMP_SUM_ID,
    ALL_AUTO: ALL_AUTO,
    AUTO_CHECK_META: AUTO_CHECK_META,
    defaults: defaults,
    byId: byId,
    emptyCustom: emptyCustom,
    duplicate: duplicate,
    ensureShape: ensureShape,
    mergeDefaults: mergeDefaults,
    migrateState: migrateState,
  };
})(typeof window !== "undefined" ? window : global);
