/* PSA Trak UI */
(function () {
  "use strict";
  var E = window.PsaEngine;
  var STORE = "psatrak_v1";

  var ui = {
    contractId: "2216F",
    taskId: null,
    qpId: null,
    view: "ledger",
    qpTab: "info",
    invoiceId: null,
    filter: "",
    modal: null,
  };

  var state = null;

  function toast(msg) {
    var el = document.getElementById("toast");
    el.textContent = msg;
    el.style.display = "block";
    clearTimeout(toast._t);
    toast._t = setTimeout(function () {
      el.style.display = "none";
    }, 2600);
  }

  function save() {
    try {
      localStorage.setItem(STORE, JSON.stringify(state));
    } catch (err) {
      toast("Could not save locally: " + err.message);
    }
  }

  function makeIdiq(code, contractor) {
    return {
      id: code,
      code: code,
      title: "Subsurface Investigation Services",
      rfp: "2216-2217F",
      contractor: contractor,
      pm: "",
      cap: 3000000,
      agreementType: "IDIQ",
      term: "Three-year term with two possible one-year extensions",
      paymentMethod: "Cost per unit of work",
      funding: "Federal; CFDA 20.205",
      historical: false,
      payItems: window.PsaCatalog.cloneCatalog(),
      tasks: [E.emptyTask("1", 0)],
    };
  }

  function hydrateHistorical(raw) {
    var c = JSON.parse(JSON.stringify(raw));
    c.payItems = window.PsaCatalog.cloneCatalog();
    c.rfp = c.code;
    c.agreementType = "IDIQ";
    c.paymentMethod = "Cost per unit of work";
    var poSum = (c.tasks || []).reduce(function (s, t) {
      return s + Number(t.poAmount || 0);
    }, 0);
    if (poSum > Number(c.cap || 0)) c.cap = poSum;
    (c.tasks || []).forEach(function (t) {
      (t.qps || []).forEach(function (q) {
        if (!q.proposal) q.proposal = { status: "draft", lines: [], reviewNotes: "" };
        if (!q.ntpLines) q.ntpLines = [];
      });
    });
    return c;
  }

  function defaultState() {
    var hist = window.PSA_SEED_HISTORICAL;
    return {
      version: 1,
      pm: "",
      contracts: [
        makeIdiq("2216F", "Contractor 2216F (pending award)"),
        makeIdiq("2217F", "Contractor 2217F (pending award)"),
        hydrateHistorical(hist.cgc2019),
        hydrateHistorical(hist.hcea2018),
      ],
    };
  }

  function load() {
    try {
      var raw = localStorage.getItem(STORE);
      if (raw) {
        state = JSON.parse(raw);
        if (!state.contracts || !state.contracts.length) state = defaultState();
      } else {
        state = defaultState();
        save();
      }
    } catch (e) {
      state = defaultState();
    }
    if (!ui.contractId || !contract()) ui.contractId = state.contracts[0].id;
    var c = contract();
    if (!ui.taskId || !task()) ui.taskId = (c.tasks[0] && c.tasks[0].id) || null;
  }

  function contract() {
    return state.contracts.find(function (c) {
      return c.id === ui.contractId;
    }) || state.contracts[0];
  }
  function task() {
    var c = contract();
    return (c.tasks || []).find(function (t) {
      return t.id === ui.taskId;
    }) || (c.tasks || [])[0];
  }
  function qp() {
    var t = task();
    if (!t) return null;
    return (t.qps || []).find(function (q) {
      return q.id === ui.qpId;
    }) || null;
  }

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function statusPill(st) {
    return '<span class="pill st-' + esc(st) + '">' + esc(st) + "</span>";
  }

  function pct(part, whole) {
    if (!whole) return 0;
    return Math.max(0, Math.min(100, Math.round((part / whole) * 100)));
  }

  function render() {
    var c = contract();
    var t = task();
    var r = E.contractRollup(c);
    var app = document.getElementById("app");
    app.innerHTML =
      renderHeader(c) +
      renderKpis(c, r) +
      '<div class="workspace">' +
      renderTasks(c, t) +
      '<main class="stage">' +
      (ui.view === "payitems"
        ? renderPayItems(c)
        : ui.view === "settings"
        ? renderSettings(c)
        : ui.qpId && qp()
        ? renderQpDetail(c, t, qp())
        : renderLedger(c, t)) +
      "</main></div>";
    bind();
  }

  function renderHeader(c) {
    var btns = state.contracts
      .map(function (x) {
        var on = x.id === c.id ? " on" : "";
        var hist = x.historical ? " hist" : "";
        return (
          '<button class="cbtn' +
          on +
          hist +
          '" data-act="switch-contract" data-id="' +
          esc(x.id) +
          '">' +
          esc(x.code) +
          "</button>"
        );
      })
      .join("");
    return (
      '<header class="top no-print"><div class="brand">PSA TRAK<small>DelDOT Materials &amp; Research · Professional Services</small></div>' +
      '<div class="contract-switch">' +
      btns +
      '</div><div class="spacer"></div>' +
      '<div class="top-actions">' +
      '<button class="btn" data-act="view" data-view="ledger">Ledger</button>' +
      '<button class="btn" data-act="view" data-view="payitems">Pay items</button>' +
      '<button class="btn" data-act="view" data-view="settings">Backup / import</button>' +
      "</div></header>"
    );
  }

  function renderKpis(c, r) {
    var capLabel = c.historical ? "Agreement / PO" : "IDIQ cap";
    return (
      '<section class="kpis no-print">' +
      kpi(capLabel, E.fmtMoney(r.cap), c.contractor || "") +
      kpi("Allocated to NTPs", E.fmtMoney(r.allocated), pct(r.allocated, r.cap) + "% of cap", r.allocated > r.cap ? "bad" : "") +
      kpi("Spent", E.fmtMoney(r.spent), pct(r.spent, r.allocated || r.cap) + "% of allocated") +
      kpi("NTP balance", E.fmtMoney(r.ntpBalance), "invoiced vs NTP", r.ntpBalance < 0 ? "bad" : "ok") +
      kpi("Unallocated PO", E.fmtMoney(r.unallocated), "task PO minus NTPs", r.unallocated < 0 ? "bad" : "") +
      kpi("Open QPs", String(r.openQps), r.pendingProposals + " proposal(s) to review", r.pendingProposals ? "warn" : "") +
      "</section>"
    );
  }

  function kpi(lbl, val, sub, cls) {
    return (
      '<div class="kpi ' +
      (cls || "") +
      '"><div class="lbl">' +
      esc(lbl) +
      '</div><div class="val">' +
      val +
      '</div><div class="sub">' +
      esc(sub || "") +
      "</div></div>"
    );
  }

  function renderTasks(c, t) {
    var cards = (c.tasks || [])
      .map(function (x) {
        var alloc = E.taskAllocated(x);
        var spent = E.taskSpent(x);
        var p = pct(alloc, x.poAmount || 1);
        return (
          '<div class="task-card' +
          (t && x.id === t.id ? " on" : "") +
          '" data-act="switch-task" data-id="' +
          esc(x.id) +
          '"><div class="n">Task ' +
          esc(x.number) +
          '</div><div class="m">PO ' +
          E.fmtMoney(x.poAmount) +
          "<br>NTP " +
          E.fmtMoney(alloc) +
          " · spent " +
          E.fmtMoney(spent) +
          '</div><div class="bar"><i style="width:' +
          p +
          '%"></i></div></div>'
        );
      })
      .join("");
    return (
      '<aside class="tasks no-print"><h3>Tasks</h3>' +
      cards +
      '<button class="btn small" data-act="add-task">+ New task</button></aside>'
    );
  }

  function renderLedger(c, t) {
    if (!t) return '<div class="banner">Create a task to start tracking QPs.</div>';
    var qps = (t.qps || []).filter(function (q) {
      if (!ui.filter) return true;
      var f = ui.filter.toLowerCase();
      return (
        String(q.qpNumber).toLowerCase().indexOf(f) >= 0 ||
        String(q.project).toLowerCase().indexOf(f) >= 0 ||
        String(q.contractNo).toLowerCase().indexOf(f) >= 0 ||
        String(q.notes).toLowerCase().indexOf(f) >= 0
      );
    });
    var rows = qps
      .map(function (q) {
        var st = E.deriveQpStatus(q);
        var invs = (q.invoices || [])
          .filter(function (i) {
            return i.status !== "void";
          })
          .map(function (i) {
            return E.fmtDate(i.date) + " " + E.fmtMoney(i.amount);
          })
          .join("<br>");
        return (
          "<tr data-act=\"open-qp\" data-id=\"" +
          esc(q.id) +
          '"><td>' +
          esc(q.qpNumber) +
          "</td><td>" +
          esc(q.contractNo) +
          "</td><td>" +
          esc(q.project) +
          "</td><td class=\"muted\">" +
          esc(q.notes) +
          "</td><td>" +
          statusPill(st) +
          '</td><td class="num">' +
          E.fmtDate(q.ntpDate) +
          '</td><td class="num">' +
          E.fmtMoney(q.ntpAmount) +
          '</td><td class="num">' +
          E.fmtMoney(E.qpSpent(q)) +
          '</td><td class="num">' +
          E.fmtMoney(E.qpRemaining(q)) +
          '</td><td class="muted">' +
          (invs || "—") +
          "</td></tr>"
        );
      })
      .join("");
    var banner = "";
    if (!c.historical) {
      var priced = (c.payItems || []).filter(function (p) {
        return Number(p.unitPrice) > 0;
      }).length;
      banner =
        '<div class="banner">RFP <b>2216-2217F</b> · IDIQ, cost per unit of work, $3,000,000 cap. ' +
        priced +
        " of " +
        (c.payItems || []).length +
        " pay items have unit prices. Enter Appendix C prices on <b>Pay items</b> after award, then review proposals against the catalog.</div>";
    } else {
      banner =
        '<div class="banner info">Imported from your current tracker (' +
        esc(c.code) +
        " · " +
        esc(c.contractor) +
        "). Dollar totals match the spreadsheet. Open a QP to add a line-item proposal, issue an NTP letter, or build an invoice checklist.</div>";
    }
    return (
      banner +
      '<div class="row-between"><div><b>Task ' +
      esc(t.number) +
      "</b> · PO " +
      '<input id="poAmount" value="' +
      esc(t.poAmount || 0) +
      '" style="width:120px;background:var(--panel);border:1px solid var(--border);border-radius:6px;padding:4px 6px">' +
      " · allocated " +
      E.fmtMoney(E.taskAllocated(t)) +
      " · spent " +
      E.fmtMoney(E.taskSpent(t)) +
      " · unallocated " +
      E.fmtMoney(E.taskUnallocated(t)) +
      '</div><div>' +
      '<input id="filter" placeholder="Filter QP / project / T#" value="' +
      esc(ui.filter) +
      '" style="background:var(--panel);border:1px solid var(--border);border-radius:6px;padding:6px 8px;margin-right:8px">' +
      '<button class="btn primary" data-act="add-qp">+ QP</button>' +
      (!c.historical && !(t.qps || []).length
        ? '<button class="btn" data-act="demo-qp">Insert example QP</button>'
        : "") +
      "</div></div>" +
      '<div class="card" style="padding:0;overflow:auto"><table class="grid"><thead><tr>' +
      "<th>QP #</th><th>Contract</th><th>Project</th><th>Notes</th><th>Status</th><th>NTP date</th><th>NTP amount</th><th>Spent</th><th>Balance</th><th>Invoices</th>" +
      "</tr></thead><tbody>" +
      (rows || '<tr><td colspan="10" class="muted">No QPs yet. Add a QP to review a budget proposal.</td></tr>') +
      "</tbody></table></div>"
    );
  }

  function renderQpDetail(c, t, q) {
    var st = E.deriveQpStatus(q);
    var tabs = ["info", "proposal", "ntp", "invoice"]
      .map(function (name) {
        return (
          '<button class="tab' +
          (ui.qpTab === name ? " on" : "") +
          '" data-act="qp-tab" data-tab="' +
          name +
          '">' +
          name.toUpperCase() +
          "</button>"
        );
      })
      .join("");
    var body =
      ui.qpTab === "proposal"
        ? renderProposal(c, t, q)
        : ui.qpTab === "ntp"
        ? renderNtp(c, t, q)
        : ui.qpTab === "invoice"
        ? renderInvoice(c, t, q)
        : renderQpInfo(c, t, q);
    return (
      '<div class="row-between no-print"><div><button class="btn" data-act="back-ledger">← Ledger</button> &nbsp; <b>QP ' +
      esc(q.qpNumber) +
      "</b> · " +
      esc(q.project || "Untitled") +
      " · " +
      statusPill(st) +
      '</div><div class="tabs">' +
      tabs +
      "</div></div>" +
      body
    );
  }

  function renderQpInfo(c, t, q) {
    return (
      '<div class="card"><h2>QP information</h2><div class="fields">' +
      field("qpNumber", "QP #", q.qpNumber) +
      field("contractNo", "Contract / T#", q.contractNo) +
      field("project", "Project", q.project) +
      field("notes", "Notes", q.notes, "textarea") +
      '</div><div style="margin-top:12px;display:flex;gap:8px;flex-wrap:wrap">' +
      '<button class="btn primary" data-act="save-qp-info">Save</button>' +
      '<button class="btn" data-act="add-supplement">Add supplement (e.g. ' +
      esc(q.qpNumber) +
      "A)</button>" +
      (q.qpClosed
        ? '<button class="btn" data-act="reopen-qp">Reopen QP</button>'
        : '<button class="btn danger" data-act="close-qp">Close QP · return ' +
          E.fmtMoney(Math.max(E.qpNtp(q) - E.qpSpent(q), 0)) +
          "</button>") +
      '<button class="btn danger" data-act="cancel-qp">Mark canceled</button>' +
      "</div></div>" +
      '<div class="card"><h3>Money</h3><p>NTP ' +
      E.fmtMoney(q.ntpAmount) +
      " · spent " +
      E.fmtMoney(E.qpSpent(q)) +
      " · balance " +
      E.fmtMoney(E.qpRemaining(q)) +
      (q.qpClosed ? " · returned " + E.fmtMoney(E.qpReturned(q)) : "") +
      "</p></div>"
    );
  }

  function field(id, label, val, type) {
    if (type === "textarea") {
      return (
        '<label class="f">' +
        esc(label) +
        '<textarea id="' +
        id +
        '">' +
        esc(val || "") +
        "</textarea></label>"
      );
    }
    return (
      '<label class="f">' +
      esc(label) +
      '<input id="' +
      id +
      '" value="' +
      esc(val || "") +
      '"></label>'
    );
  }

  function itemOptions(c, selected) {
    return (
      '<option value="">— pay item —</option>' +
      (c.payItems || [])
        .map(function (it) {
          return (
            '<option value="' +
            esc(it.code) +
            '"' +
            (it.code === selected ? " selected" : "") +
            ">" +
            esc(it.code) +
            " · " +
            esc(it.description) +
            (it.unitPrice ? " · " + E.fmtMoney(it.unitPrice) : "") +
            "</option>"
          );
        })
        .join("")
    );
  }

  function renderProposal(c, t, q) {
    if (!q.proposal) q.proposal = { status: "draft", lines: [], reviewNotes: "" };
    var review = E.reviewProposal(c, q.proposal);
    var unalloc = E.taskUnallocated(t) + (q.ntpAmount ? 0 : 0);
    /* If this QP already has an NTP, remaining for a revised proposal is unallocated + current NTP */
    var room = E.money(E.taskUnallocated(t) + E.qpNtp(q));
    var over = review.total > room + 0.009 && room >= 0;
    var lines = (q.proposal.lines || [])
      .map(function (l, i) {
        return (
          "<tr>" +
          '<td><select data-act="prop-item" data-i="' +
          i +
          '">' +
          itemOptions(c, l.itemCode) +
          "</select></td>" +
          '<td class="muted">' +
          esc(l.unit || "") +
          "</td>" +
          '<td class="num">' +
          E.fmtMoney(l.unitPrice || 0) +
          "</td>" +
          '<td><input data-act="prop-qty" data-i="' +
          i +
          '" value="' +
          esc(l.proposedQty || "") +
          '" style="width:80px;background:var(--panel);border:1px solid var(--border);border-radius:6px;padding:4px"></td>' +
          '<td><input data-act="prop-revqty" data-i="' +
          i +
          '" value="' +
          esc(l.reviewedQty != null ? l.reviewedQty : "") +
          '" placeholder="same" style="width:80px;background:var(--panel);border:1px solid var(--border);border-radius:6px;padding:4px"></td>' +
          '<td class="num">' +
          E.fmtMoney(
            (l.reviewedQty != null && l.reviewedQty !== "" ? Number(l.reviewedQty) : Number(l.proposedQty || 0)) *
              Number(l.unitPrice || 0)
          ) +
          "</td>" +
          '<td><button class="btn small danger" data-act="prop-del" data-i="' +
          i +
          '">×</button></td></tr>'
        );
      })
      .join("");
    var flags = review.flags
      .map(function (f) {
        return (
          '<div class="check"><div class="s ' +
          (f.severity === "fail" ? "fail" : f.severity === "warn" ? "warn" : "pass") +
          '">' +
          esc(f.severity) +
          "</div><div>" +
          esc(f.message) +
          "</div></div>"
        );
      })
      .join("");
    return (
      '<div class="card"><h2>Budget proposal review</h2>' +
      "<p class=\"muted\">Enter the contractor's proposed quantities. Engineer qty overrides the proposal when you issue the NTP. Unit prices come from this agreement's catalog.</p>" +
      '<div class="row-between"><div>Proposed / reviewed total: <b>' +
      E.fmtMoney(review.total) +
      "</b> · task room " +
      E.fmtMoney(room) +
      (over ? ' <span class="fail">exceeds unallocated task funds</span>' : "") +
      '</div><button class="btn" data-act="prop-add">+ Line</button></div>' +
      '<div style="overflow:auto"><table class="grid"><thead><tr><th>Item</th><th>Unit</th><th>Unit price</th><th>Proposed qty</th><th>Engineer qty</th><th>Amount</th><th></th></tr></thead><tbody>' +
      (lines || '<tr><td colspan="7" class="muted">No lines yet.</td></tr>') +
      "</tbody></table></div>" +
      '<label class="f" style="margin-top:10px">Review notes<textarea id="reviewNotes">' +
      esc(q.proposal.reviewNotes || "") +
      "</textarea></label>" +
      '<div style="margin-top:10px;display:flex;gap:8px">' +
      '<button class="btn" data-act="prop-save">Save draft</button>' +
      '<button class="btn primary" data-act="prop-approve">Approve proposal</button>' +
      '<button class="btn" data-act="prop-revision">Request revision</button>' +
      "</div></div>" +
      (flags ? '<div class="card"><h3>Review flags</h3><div class="checks">' + flags + "</div></div>" : "")
    );
  }

  function renderNtp(c, t, q) {
    var lines = (q.ntpLines || []).length
      ? q.ntpLines
      : E.ntpLinesFromProposal(q.proposal);
    var amt = lines.length ? E.sumLines(lines) : Number(q.ntpAmount || 0);
    var lineRows = lines
      .map(function (l) {
        return (
          "<tr><td>" +
          esc(l.itemCode) +
          "</td><td>" +
          esc(l.description) +
          "</td><td>" +
          esc(l.unit) +
          '</td><td class="num">' +
          esc(l.qty) +
          '</td><td class="num">' +
          E.fmtMoney(l.unitPrice) +
          '</td><td class="num">' +
          E.fmtMoney(l.amount) +
          "</td></tr>"
        );
      })
      .join("");
    var letter =
      '<div class="print-only" id="ntpLetter"><h2 style="margin-top:0">NOTICE TO PROCEED</h2>' +
      "<p>Delaware Department of Transportation · Materials &amp; Research</p>" +
      "<p>Agreement <b>" +
      esc(c.code) +
      "</b> · " +
      esc(c.title) +
      "<br>Contractor: " +
      esc(c.contractor) +
      "<br>Task " +
      esc(t.number) +
      " · QP " +
      esc(q.qpNumber) +
      "<br>Project: " +
      esc(q.project) +
      " · Contract No. " +
      esc(q.contractNo) +
      "</p>" +
      "<p>You are authorized to proceed with the approved work in the amount of <b>" +
      E.fmtMoney(amt) +
      "</b>. Do not exceed this amount without a revised NTP.</p>" +
      (lineRows
        ? '<table class="grid"><thead><tr><th>Item</th><th>Description</th><th>Unit</th><th>Qty</th><th>Unit price</th><th>Amount</th></tr></thead><tbody>' +
          lineRows +
          "</tbody></table>"
        : "") +
      "<p>NTP date: " +
      E.fmtDate(q.ntpDate || E.todayISO()) +
      "<br>Notes: " +
      esc(q.ntpNotes || "") +
      "</p></div>";
    return (
      letter +
      '<div class="card no-print"><h2>Issue NTP</h2>' +
      (q.ntpDate
        ? '<div class="banner info">NTP issued ' +
          E.fmtDate(q.ntpDate) +
          " for " +
          E.fmtMoney(q.ntpAmount) +
          ". Issuing again records a revised NTP from the current proposal.</div>"
        : "<p>Locks the approved proposal quantities and amount onto this QP (same role as NTP Amount / Date in your spreadsheet).</p>") +
      '<div class="fields">' +
      '<label class="f">NTP date<input id="ntpDate" type="date" value="' +
      esc(q.ntpDate || E.todayISO()) +
      '"></label>' +
      '<label class="f">Lump-sum amount (if no line items)<input id="ntpLump" value="' +
      esc(q.ntpAmount || "") +
      '"></label>' +
      '<label class="f">NTP notes<textarea id="ntpNotes">' +
      esc(q.ntpNotes || "") +
      "</textarea></label></div>" +
      "<p>From proposal lines: <b>" +
      E.fmtMoney(amt) +
      "</b></p>" +
      (lineRows
        ? '<table class="grid"><thead><tr><th>Item</th><th>Description</th><th>Unit</th><th>Qty</th><th>Unit price</th><th>Amount</th></tr></thead><tbody>' +
          lineRows +
          "</tbody></table>"
        : "") +
      '<div style="margin-top:12px;display:flex;gap:8px">' +
      '<button class="btn primary" data-act="issue-ntp">Issue / revise NTP</button>' +
      '<button class="btn" data-act="print-ntp">Print NTP letter</button>' +
      "</div></div>"
    );
  }

  function renderInvoice(c, t, q) {
    var inv =
      (q.invoices || []).find(function (i) {
        return i.id === ui.invoiceId;
      }) || null;
    var list = (q.invoices || [])
      .map(function (i) {
        return (
          '<tr data-act="open-inv" data-id="' +
          esc(i.id) +
          '"><td>' +
          esc(i.number) +
          "</td><td>" +
          E.fmtDate(i.date) +
          '</td><td class="num">' +
          E.fmtMoney(i.amount) +
          "</td><td>" +
          statusPill(i.status || "posted") +
          "</td></tr>"
        );
      })
      .join("");
    var body = inv ? renderInvoiceEditor(c, t, q, inv) : '<div class="muted">Select an invoice or create one to build the checklist.</div>';
    return (
      '<div class="card no-print"><div class="row-between"><h2 style="margin:0">Invoices</h2>' +
      '<button class="btn primary" data-act="add-inv">+ Invoice</button></div>' +
      '<table class="grid"><thead><tr><th>#</th><th>Date</th><th>Amount</th><th>Status</th></tr></thead><tbody>' +
      (list || '<tr><td colspan="4" class="muted">No invoices.</td></tr>') +
      "</tbody></table></div>" +
      body
    );
  }

  function renderInvoiceEditor(c, t, q, inv) {
    if (!inv.lines) inv.lines = [];
    if (!inv.adminChecks) inv.adminChecks = {};
    var ck = E.buildInvoiceChecklist(c, t, q, inv);
    var lineRows = inv.lines
      .map(function (l, i) {
        return (
          "<tr>" +
          '<td><select data-act="inv-item" data-i="' +
          i +
          '">' +
          itemOptions(c, l.itemCode) +
          "</select></td>" +
          '<td><input data-act="inv-qty" data-i="' +
          i +
          '" value="' +
          esc(l.qty || "") +
          '" style="width:80px;background:var(--panel);border:1px solid var(--border);border-radius:6px;padding:4px"></td>' +
          '<td class="num">' +
          E.fmtMoney(l.unitPrice || 0) +
          '</td><td class="num">' +
          E.fmtMoney(E.lineExt(l)) +
          "</td>" +
          '<td><button class="btn small danger" data-act="inv-del" data-i="' +
          i +
          '">×</button></td></tr>'
        );
      })
      .join("");
    var checks = ck.checks
      .map(function (x) {
        var admin = E.ADMIN_CHECKS.some(function (a) {
          return a.id === x.id;
        });
        return (
          '<div class="check"><div class="s ' +
          x.status +
          '">' +
          esc(x.status) +
          "</div><div><b>" +
          esc(x.label) +
          "</b><div class=\"muted\">" +
          esc(x.detail) +
          "</div>" +
          (admin
            ? '<label><input type="checkbox" data-act="admin-check" data-id="' +
              x.id +
              '"' +
              (inv.adminChecks[x.id] ? " checked" : "") +
              "> Confirmed</label>"
            : "") +
          "</div></div>"
        );
      })
      .join("");
    var overall =
      ck.overall === "pass" ? "pass" : ck.overall === "fail" ? "fail" : "warn";
    return (
      '<div class="card no-print"><h2>Invoice ' +
      esc(inv.number || "") +
      ' · checklist <span class="' +
      overall +
      '">' +
      esc(ck.overall) +
      "</span></h2>" +
      '<div class="fields">' +
      '<label class="f">Invoice #<input id="invNumber" value="' +
      esc(inv.number || "") +
      '"></label>' +
      '<label class="f">Date<input id="invDate" type="date" value="' +
      esc(inv.date || "") +
      '"></label>' +
      '<label class="f">Amount<input id="invAmount" value="' +
      esc(inv.amount || 0) +
      '"></label></div>' +
      '<div class="row-between" style="margin-top:10px"><div class="muted">Line items vs NTP remaining quantities. Leave blank for a lump-sum check (dollar cap only — how the spreadsheet works today).</div>' +
      '<button class="btn" data-act="inv-add-line">+ Pay item</button></div>' +
      '<table class="grid"><thead><tr><th>Item</th><th>Qty</th><th>Unit price</th><th>Extension</th><th></th></tr></thead><tbody>' +
      (lineRows || '<tr><td colspan="5" class="muted">No lines — lump-sum invoice.</td></tr>') +
      "</tbody></table>" +
      '<p>Line sum ' +
      E.fmtMoney(ck.lineSum) +
      " · remaining NTP before this invoice " +
      E.fmtMoney(ck.remainingBefore) +
      "</p>" +
      '<div class="checks">' +
      checks +
      "</div>" +
      '<div style="margin-top:12px;display:flex;gap:8px;flex-wrap:wrap">' +
      '<button class="btn" data-act="save-inv">Save invoice</button>' +
      '<button class="btn good" data-act="post-inv">Post to QP</button>' +
      '<button class="btn" data-act="print-checklist">Print checklist</button>' +
      "</div></div>" +
      '<div class="print-only" id="printChecklist"><h2>Invoice checklist</h2>' +
      "<p>" +
      esc(c.code) +
      " · QP " +
      esc(q.qpNumber) +
      " · " +
      esc(q.project) +
      " · Invoice " +
      esc(inv.number) +
      " · " +
      E.fmtMoney(inv.amount) +
      " · Result: " +
      esc(ck.overall) +
      "</p>" +
      ck.checks
        .map(function (x) {
          return "<p><b>" + esc(x.status.toUpperCase()) + "</b> — " + esc(x.label) + ". " + esc(x.detail) + "</p>";
        })
        .join("") +
      "</div>"
    );
  }

  function renderPayItems(c) {
    var rows = (c.payItems || [])
      .map(function (it, i) {
        return (
          "<tr><td>" +
          esc(it.code) +
          "</td><td>" +
          esc(it.category) +
          "</td><td>" +
          esc(it.description) +
          "</td><td>" +
          esc(it.unit) +
          '</td><td><input data-act="price" data-i="' +
          i +
          '" value="' +
          (it.unitPrice || "") +
          '" style="width:110px;background:var(--panel);border:1px solid var(--border);border-radius:6px;padding:4px;font-family:var(--mono)"></td></tr>'
        );
      })
      .join("");
    return (
      '<div class="card"><h2>Appendix C — unit prices · ' +
      esc(c.code) +
      "</h2>" +
      "<p class=\"muted\">Each agreement has its own prices. Paste awarded prices after selection. Catalog seeded from prior DelDOT subsurface IDIQ items plus RFP 2216-2217F lab / geo-probe work.</p>" +
      '<div class="fields">' +
      field("contractor", "Contractor", c.contractor) +
      field("pm", "Project manager", c.pm) +
      field("cap", "Agreement cap", c.cap) +
      "</div>" +
      '<div style="margin:10px 0"><button class="btn primary" data-act="save-contract-meta">Save contract header</button></div>' +
      '<table class="grid"><thead><tr><th>Item</th><th>Category</th><th>Description</th><th>Unit</th><th>Unit price</th></tr></thead><tbody>' +
      rows +
      "</tbody></table></div>"
    );
  }

  function renderSettings(c) {
    return (
      '<div class="card"><h2>Backup / import</h2>' +
      "<p>Data lives in this browser (localStorage). Export a JSON backup before switching computers. You can also import a task sheet in the same layout as <b>NEW CGC 2024.xlsx</b> / <b>HCEA Task 3.xlsx</b> (QP #, Contract, Project, NTP Amount, invoice date/amount columns).</p>" +
      '<div style="display:flex;gap:8px;flex-wrap:wrap;margin:12px 0">' +
      '<button class="btn primary" data-act="export-json">Export JSON</button>' +
      '<label class="btn">Import JSON<input type="file" id="importJson" accept="application/json" hidden></label>' +
      '<label class="btn">Import Excel task sheet<input type="file" id="importXlsx" accept=".xlsx,.xls" hidden></label>' +
      '<button class="btn danger" data-act="reset">Reset to starter data</button>' +
      "</div>" +
      "<p class=\"muted\">Reset restores empty 2216F / 2217F plus the imported 2019F CGC and 2018F HCEA ledgers from the spreadsheets you provided.</p></div>"
    );
  }

  function bind() {
    document.getElementById("app").onclick = onClick;
    document.getElementById("app").onchange = onChange;
    document.getElementById("app").onkeydown = onKey;
    var po = document.getElementById("poAmount");
    if (po) {
      po.onchange = function () {
        var t = task();
        t.poAmount = E.money(po.value);
        save();
        render();
      };
    }
    var f = document.getElementById("filter");
    if (f) {
      f.oninput = function () {
        ui.filter = f.value;
      };
      f.onchange = function () {
        ui.filter = f.value;
        render();
      };
    }
    var ij = document.getElementById("importJson");
    if (ij) ij.onchange = importJsonFile;
    var ix = document.getElementById("importXlsx");
    if (ix) ix.onchange = importXlsxFile;
  }

  function onKey(ev) {
    if (ev.key === "Enter" && ev.target && ev.target.id === "filter") {
      ev.preventDefault();
      render();
    }
  }

  function onClick(ev) {
    var el = ev.target.closest("[data-act]");
    if (!el) return;
    var act = el.getAttribute("data-act");
    var c = contract();
    var t = task();
    var q = qp();

    if (act === "switch-contract") {
      ui.contractId = el.getAttribute("data-id");
      ui.qpId = null;
      ui.view = "ledger";
      var nc = contract();
      ui.taskId = nc.tasks[0] && nc.tasks[0].id;
      render();
      return;
    }
    if (act === "switch-task") {
      ui.taskId = el.getAttribute("data-id");
      ui.qpId = null;
      ui.view = "ledger";
      render();
      return;
    }
    if (act === "view") {
      ui.view = el.getAttribute("data-view");
      ui.qpId = null;
      render();
      return;
    }
    if (act === "add-task") {
      var n = (c.tasks || []).length + 1;
      var nt = E.emptyTask(String(n), 0);
      c.tasks.push(nt);
      ui.taskId = nt.id;
      save();
      render();
      return;
    }
    if (act === "add-qp") {
      var nq = E.emptyQp(t);
      t.qps.push(nq);
      ui.qpId = nq.id;
      ui.qpTab = "info";
      save();
      render();
      return;
    }
    if (act === "demo-qp") {
      insertDemoQp(c, t);
      save();
      render();
      return;
    }
    if (act === "open-qp") {
      ui.qpId = el.getAttribute("data-id");
      ui.qpTab = "info";
      ui.invoiceId = null;
      render();
      return;
    }
    if (act === "back-ledger") {
      ui.qpId = null;
      render();
      return;
    }
    if (act === "qp-tab") {
      ui.qpTab = el.getAttribute("data-tab");
      render();
      return;
    }
    if (act === "save-qp-info") {
      q.qpNumber = val("qpNumber");
      q.contractNo = val("contractNo");
      q.project = val("project");
      q.notes = val("notes");
      save();
      toast("QP saved");
      render();
      return;
    }
    if (act === "add-supplement") {
      var base = String(q.qpNumber).replace(/[A-Za-z]+$/, "");
      var letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
      var next = base + "A";
      for (var i = 0; i < letters.length; i++) {
        var cand = base + letters[i];
        if (
          !t.qps.some(function (x) {
            return String(x.qpNumber) === cand;
          })
        ) {
          next = cand;
          break;
        }
      }
      var sq = E.emptyQp(t, next);
      sq.contractNo = q.contractNo;
      sq.project = q.project;
      sq.notes = "Supplement to QP " + q.qpNumber;
      t.qps.push(sq);
      ui.qpId = sq.id;
      save();
      render();
      return;
    }
    if (act === "close-qp") {
      E.closeQp(q);
      save();
      toast("QP closed · remainder returned to task");
      render();
      return;
    }
    if (act === "reopen-qp") {
      E.reopenQp(q);
      save();
      render();
      return;
    }
    if (act === "cancel-qp") {
      q.status = "canceled";
      q.canceled = true;
      save();
      render();
      return;
    }
    if (act === "prop-add") {
      q.proposal = q.proposal || { status: "draft", lines: [] };
      q.proposal.lines.push({
        itemCode: "",
        description: "",
        unit: "",
        proposedQty: 0,
        unitPrice: 0,
      });
      save();
      render();
      return;
    }
    if (act === "prop-del") {
      q.proposal.lines.splice(Number(el.getAttribute("data-i")), 1);
      save();
      render();
      return;
    }
    if (act === "prop-save") {
      q.proposal.reviewNotes = val("reviewNotes");
      q.proposal.status = "draft";
      save();
      toast("Proposal draft saved");
      render();
      return;
    }
    if (act === "prop-approve") {
      q.proposal.reviewNotes = val("reviewNotes");
      q.proposal.status = "approved";
      save();
      toast("Proposal approved — issue NTP next");
      ui.qpTab = "ntp";
      render();
      return;
    }
    if (act === "prop-revision") {
      q.proposal.reviewNotes = val("reviewNotes");
      q.proposal.status = "revision";
      save();
      toast("Marked for revision");
      render();
      return;
    }
    if (act === "issue-ntp") {
      var date = val("ntpDate") || E.todayISO();
      q.ntpNotes = val("ntpNotes");
      if (!(q.proposal && q.proposal.lines && q.proposal.lines.length)) {
        q.ntpAmount = E.money(val("ntpLump"));
        q.ntpDate = date;
        q.status = "ntp";
      } else {
        E.issueNtp(q, date, q.ntpNotes);
      }
      save();
      toast("NTP issued for " + E.fmtMoney(q.ntpAmount));
      render();
      return;
    }
    if (act === "print-ntp") {
      window.print();
      return;
    }
    if (act === "add-inv") {
      var inv = E.emptyInvoice("INV-" + ((q.invoices || []).length + 1));
      q.invoices = q.invoices || [];
      q.invoices.push(inv);
      ui.invoiceId = inv.id;
      save();
      render();
      return;
    }
    if (act === "open-inv") {
      ui.invoiceId = el.getAttribute("data-id");
      render();
      return;
    }
    if (act === "inv-add-line") {
      var cur = findInv(q);
      cur.lines.push({ itemCode: "", qty: 0, unitPrice: 0, unit: "", description: "" });
      save();
      render();
      return;
    }
    if (act === "inv-del") {
      findInv(q).lines.splice(Number(el.getAttribute("data-i")), 1);
      save();
      render();
      return;
    }
    if (act === "save-inv" || act === "post-inv") {
      var cur = findInv(q);
      cur.number = val("invNumber");
      cur.date = val("invDate");
      cur.amount = E.money(val("invAmount"));
      if (cur.lines && cur.lines.length && !Number(val("invAmount"))) {
        cur.amount = E.sumLines(cur.lines);
      }
      if (act === "post-inv") {
        var ck = E.buildInvoiceChecklist(c, t, q, cur);
        if (ck.requiredFailCount) {
          toast("Checklist failed — not posted");
          save();
          render();
          return;
        }
        cur.status = "posted";
        toast("Invoice posted to QP");
      } else {
        toast("Invoice saved");
      }
      save();
      render();
      return;
    }
    if (act === "print-checklist") {
      window.print();
      return;
    }
    if (act === "save-contract-meta") {
      c.contractor = val("contractor");
      c.pm = val("pm");
      c.cap = E.money(val("cap"));
      save();
      toast("Contract header saved");
      render();
      return;
    }
    if (act === "export-json") {
      var blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
      var a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "psa-trak-backup.json";
      a.click();
      return;
    }
    if (act === "reset") {
      if (!confirm("Reset all PSA Trak data in this browser?")) return;
      localStorage.removeItem(STORE);
      load();
      ui.contractId = "2216F";
      ui.qpId = null;
      toast("Reset to starter data");
      render();
      return;
    }
  }

  function insertDemoQp(c, t) {
    var prices = {
      "763589N": 1850,
      "605545": 48.5,
      "605541": 95,
      "763606": 1250,
      "LAB-INDEX": 85,
    };
    (c.payItems || []).forEach(function (it) {
      if (prices[it.code] && !Number(it.unitPrice)) it.unitPrice = prices[it.code];
    });
    if (!Number(t.poAmount)) t.poAmount = 500000;
    var q = E.emptyQp(t, "1");
    q.contractNo = "T202604703";
    q.project = "DE 42 @ SR 1 (example)";
    q.notes = "Example QP — delete after you start real work.";
    q.proposal = {
      status: "draft",
      submittedDate: E.todayISO(),
      reviewNotes: "",
      lines: [
        { itemCode: "763589N", description: "Mobilization of truck-mounted boring rig — New Castle", unit: "EA", proposedQty: 1, unitPrice: prices["763589N"] },
        { itemCode: "605545", description: "Soil borings, land — incl. permit if needed", unit: "LF", proposedQty: 72, unitPrice: prices["605545"] },
        { itemCode: "605541", description: "Undisturbed sampling (Shelby tube)", unit: "EA", proposedQty: 3, unitPrice: prices["605541"] },
        { itemCode: "763606", description: "TTC — two-lane two-way with lane closure", unit: "EA", proposedQty: 2, unitPrice: prices["763606"] },
        { itemCode: "LAB-INDEX", description: "Soil index tests", unit: "EA", proposedQty: 6, unitPrice: prices["LAB-INDEX"] },
      ],
    };
    t.qps.push(q);
    ui.qpId = q.id;
    ui.qpTab = "proposal";
    toast("Example QP loaded — review quantities, then issue NTP");
  }

  function findInv(q) {
    return (q.invoices || []).find(function (i) {
      return i.id === ui.invoiceId;
    });
  }

  function val(id) {
    var el = document.getElementById(id);
    return el ? el.value : "";
  }

  function onChange(ev) {
    var el = ev.target.closest("[data-act]");
    if (!el) return;
    var act = el.getAttribute("data-act");
    var c = contract();
    var q = qp();
    if (act === "prop-item") {
      var i = Number(el.getAttribute("data-i"));
      var item = E.catalogItem(c, el.value);
      var line = q.proposal.lines[i];
      line.itemCode = el.value;
      if (item) {
        line.description = item.description;
        line.unit = item.unit;
        line.unitPrice = Number(item.unitPrice || 0);
      }
      save();
      render();
      return;
    }
    if (act === "prop-qty") {
      q.proposal.lines[Number(el.getAttribute("data-i"))].proposedQty = Number(el.value || 0);
      save();
      render();
      return;
    }
    if (act === "prop-revqty") {
      var v = el.value;
      q.proposal.lines[Number(el.getAttribute("data-i"))].reviewedQty = v === "" ? "" : Number(v);
      save();
      render();
      return;
    }
    if (act === "inv-item") {
      var inv = findInv(q);
      var item = E.catalogItem(c, el.value);
      var line = inv.lines[Number(el.getAttribute("data-i"))];
      line.itemCode = el.value;
      if (item) {
        line.description = item.description;
        line.unit = item.unit;
        line.unitPrice = Number(item.unitPrice || 0);
      }
      if (inv.lines.length) inv.amount = E.sumLines(inv.lines);
      save();
      render();
      return;
    }
    if (act === "inv-qty") {
      var invq = findInv(q);
      invq.lines[Number(el.getAttribute("data-i"))].qty = Number(el.value || 0);
      if (invq.lines.length) invq.amount = E.sumLines(invq.lines);
      save();
      render();
      return;
    }
    if (act === "admin-check") {
      findInv(q).adminChecks[el.getAttribute("data-id")] = el.checked;
      save();
      render();
      return;
    }
    if (act === "price") {
      c.payItems[Number(el.getAttribute("data-i"))].unitPrice = E.money(el.value || 0);
      save();
      return;
    }
  }

  function importJsonFile(ev) {
    var file = ev.target.files[0];
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function () {
      try {
        var data = JSON.parse(reader.result);
        if (!data.contracts) throw new Error("Not a PSA Trak backup");
        state = data;
        save();
        ui.contractId = state.contracts[0].id;
        ui.qpId = null;
        toast("Imported backup");
        render();
      } catch (err) {
        toast("Import failed: " + err.message);
      }
    };
    reader.readAsText(file);
  }

  function importXlsxFile(ev) {
    var file = ev.target.files[0];
    if (!file) return;
    if (!window.XLSX) {
      toast("Excel library did not load");
      return;
    }
    var reader = new FileReader();
    reader.onload = function () {
      try {
        var wb = window.XLSX.read(reader.result, { type: "array", cellDates: true });
        var sheetName = wb.SheetNames.find(function (n) {
          return /task/i.test(n);
        }) || wb.SheetNames[0];
        var rows = window.XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { header: 1, raw: true });
        var parsed = E.parseTrackerSheet(rows);
        if (parsed.error) {
          toast(parsed.error);
          return;
        }
        var t = task();
        parsed.qps.forEach(function (q) {
          t.qps.push(q);
        });
        save();
        toast("Imported " + parsed.qps.length + " QPs from " + sheetName);
        ui.view = "ledger";
        render();
      } catch (err) {
        toast("Excel import failed: " + err.message);
      }
    };
    reader.readAsArrayBuffer(file);
  }

  load();
  render();
})();
