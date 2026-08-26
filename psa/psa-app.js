/* ConTrak UI — DelDOT-standard professional-services tracker */
(function () {
  "use strict";
  var E = window.PsaEngine;
  var T = window.ConTrakTemplates;
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
    editTemplateId: null,
    taskCloseout: false,
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

  function isFinance() {
    return state && state.role === "finance";
  }

  function tpl(c) {
    c = c || contract();
    var id = (c && c.templateId) || T.UNIT_PRICE_ID;
    var list = (state && state.templates) || [];
    for (var i = 0; i < list.length; i++) {
      if (list[i].id === id) return T.ensureShape(list[i]);
    }
    return T.ensureShape(T.byId(id));
  }

  function noun(c) {
    return tpl(c).assignmentNoun || "QP";
  }
  function nouns(c) {
    return tpl(c).assignmentNounPlural || "QPs";
  }
  function taskNoun(c) {
    return tpl(c).taskNoun || "Task";
  }
  function taskNouns(c) {
    return tpl(c).taskNounPlural || "Tasks";
  }
  function wf(c) {
    return tpl(c).workflow || {
      proposal: true,
      ntp: true,
      payItems: true,
      invoices: true,
      pspNtpGate: true,
    };
  }

  function optionList(values, selected) {
    return (values || [])
      .map(function (v) {
        return (
          '<option value="' +
          esc(v) +
          '"' +
          (v === selected ? " selected" : "") +
          ">" +
          esc(v) +
          "</option>"
        );
      })
      .join("");
  }

  function selectField(id, values, selected, dis) {
    var opts = (values || []).slice();
    if (selected && opts.indexOf(selected) < 0) opts.unshift(selected);
    return (
      '<select id="' +
      id +
      '"' +
      (dis || "") +
      ">" +
      optionList(opts, selected) +
      "</select>"
    );
  }

  function readPspmFromForm(q) {
    if (!q) return;
    E.ensurePspm(q);
    function chk(id) {
      var el = document.getElementById(id);
      return el ? !!el.checked : null;
    }
    var v;
    v = chk("pspWorkPlan");
    if (v != null) q.pspm.workPlan = v;
    v = chk("pspSchedule");
    if (v != null) q.pspm.schedule = v;
    v = chk("pspAudit");
    if (v != null) q.pspm.auditReview = v;
    v = chk("pspDbe");
    if (v != null) q.pspm.dbeGoal = v;
    v = chk("pspDbeNa");
    if (v != null) q.pspm.dbeNa = v;
    v = chk("pspFunding");
    if (v != null) q.pspm.fundingAuthorized = v;
    var est = document.getElementById("indepEst");
    if (est) q.independentEstimate = E.money(est.value);
  }

  function renderNtpGate(c, q) {
    if (wf(c).pspNtpGate === false) return "";
    E.ensurePspm(q);
    var gate = E.ntpGate(c, q);
    var steps = gate.steps
      .map(function (s) {
        return (
          '<div class="check"><div class="s ' +
          esc(s.status) +
          '">' +
          esc(s.status) +
          "</div><div><b>" +
          esc(s.label) +
          "</b><div class=\"muted\">" +
          esc(s.detail) +
          "</div></div></div>"
        );
      })
      .join("");
    var ready = gate.ready
      ? '<div class="banner info">PSPM §14 gate is complete. Issue the NTP. The NTP date is the earliest date work may begin.</div>'
      : '<div class="banner">PSPM §14 is not complete (' +
        gate.requiredFailCount +
        " item" +
        (gate.requiredFailCount === 1 ? "" : "s") +
        " remaining). You can still issue the letter; missing steps stay on the record.</div>";
    return (
      '<div class="card no-print"><h3>PSPM §14 — Notice to Proceed process</h3>' +
      "<p class=\"muted\">PM prepares the independent estimate, the consultant submits work plan / cost / schedule, CCC sends the proposal to Audit (and DBE if federal), then funding is authorized. CCC issues NTP and copies the PM. This desk prints the same Secretary letter you already mail.</p>" +
      ready +
      '<div class="checks">' +
      steps +
      "</div></div>"
    );
  }

  function makeAgreement(opts) {
    opts = opts || {};
    var templateId = opts.templateId || T.UNIT_PRICE_ID;
    var template = null;
    var list = (state && state.templates) || T.defaults();
    list.forEach(function (x) {
      if (x.id === templateId) template = x;
    });
    if (!template) template = T.byId(templateId);
    template = T.ensureShape(template);
    var payItems = [];
    if (template.workflow.payItems) {
      if (template.seedCatalog === "subsurface" && window.PsaCatalog) {
        payItems = window.PsaCatalog.cloneCatalog();
      }
    }
    var code = String(opts.code || "").trim();
    return {
      id: code || E.uid("agr"),
      code: code || "NEW",
      title: opts.title || "",
      rfp: opts.rfp || "",
      contractor: opts.contractor || "",
      pm: opts.pm || "",
      cap: E.money(opts.cap || 0),
      agreementType:
        opts.agreementType || (template.workflow.payItems ? "IDIQ" : "Project-Specific"),
      term: opts.term || (template.workflow.payItems ? "Three-year term with two possible one-year extensions" : ""),
      paymentMethod:
        opts.paymentMethod ||
        (template.workflow.payItems ? "Cost per unit of work" : "Lump sum"),
      funding: opts.funding || (template.workflow.payItems ? "Federal; CFDA 20.205" : ""),
      historical: !!opts.historical,
      templateId: template.id,
      letterhead: E.ensureLetterhead({
        contractor: opts.contractor || "",
        letterhead: opts.letterhead || {},
      }),
      payItems: payItems,
      tasks: [E.emptyTask("1", 0)],
    };
  }

  function makeIdiq(code, contractor) {
    return makeAgreement({
      code: code,
      contractor: contractor,
      title: "Subsurface Investigation Services",
      rfp: "2216-2217F",
      cap: 3000000,
      agreementType: "IDIQ",
      term: "Three-year term with two possible one-year extensions",
      paymentMethod: "Cost per unit of work",
      funding: "Federal; CFDA 20.205",
      templateId: T.UNIT_PRICE_ID,
    });
  }

  function hydrateHistorical(raw) {
    var c = JSON.parse(JSON.stringify(raw));
    c.payItems = window.PsaCatalog.cloneCatalog();
    var prices = window.PsaSeed && window.PsaSeed.pricesFor(c.code);
    if (prices) c.payItems = window.PsaCatalog.applyPrices(c.payItems, prices);
    if (c.code === "2018F") {
      c.payItems.forEach(function (it) {
        if (it.code === "GPS") {
          it.unit = "LS";
          it.unitMeasure = "LS";
        }
      });
    }
    c.rfp = c.code;
    c.agreementType = "IDIQ";
    c.paymentMethod = c.paymentMethod || "Cost per unit of work";
    c.funding = c.funding || "Federal; CFDA 20.205";
    c.term = c.term || "Three-year term with two possible one-year extensions";
    if (!c.templateId) c.templateId = T.UNIT_PRICE_ID;
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
    if (window.PsaSeed && window.PsaSeed.applyPackets) window.PsaSeed.applyPackets(c);
    c.letterhead = E.ensureLetterhead(c);
    return c;
  }

  function defaultState() {
    var hist = window.PSA_SEED_HISTORICAL;
    return T.migrateState({
      version: 2,
      role: "pm",
      orgName: "DelDOT Materials & Research",
      pm: "",
      templates: T.defaults(),
      contracts: [
        makeIdiq("2216F", "Contractor 2216F (pending award)"),
        makeIdiq("2217F", "Contractor 2217F (pending award)"),
        hydrateHistorical(hist.cgc2019),
        hydrateHistorical(hist.hcea2018),
      ],
    });
  }

  function load() {
    try {
      var raw = localStorage.getItem(STORE);
      if (raw) {
        state = JSON.parse(raw);
        if (!state.contracts || !state.contracts.length) state = defaultState();
        else state = T.migrateState(state);
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
    if (!ui.editTemplateId) ui.editTemplateId = tpl(c).id;
    migrateLocalContracts();
  }

  function migrateLocalContracts() {
    (state.contracts || []).forEach(function (agr) {
      if (agr.payItems && window.PsaCatalog && window.PsaCatalog.mergeCatalog) {
        agr.payItems = window.PsaCatalog.mergeCatalog(agr.payItems);
        var prices = window.PsaSeed && window.PsaSeed.pricesFor(agr.code);
        if (prices && agr.historical) {
          agr.payItems.forEach(function (it) {
            if (!Number(it.unitPrice) && prices[it.code] != null) it.unitPrice = prices[it.code];
          });
        }
      }
      if (window.PsaSeed && window.PsaSeed.applyPackets) window.PsaSeed.applyPackets(agr);
      agr.letterhead = E.ensureLetterhead(agr);
    });
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

  function officialLetterheadHtml(c) {
    var lh = E.ensureLetterhead(c);
    return (
      '<div class="letter-letterhead">' +
      '<img src="assets/letterhead-header.jpg" alt="State of Delaware Department of Transportation">' +
      '<div class="letter-secretary">' +
      esc(lh.secretaryName) +
      "<br>" +
      esc(lh.secretaryTitle) +
      "</div></div>"
    );
  }

  function officialLetterFooterHtml() {
    return (
      '<div class="letter-official-footer"><img src="assets/letterhead-footer.png" alt="DelDOT"></div>'
    );
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
    if (ui.view === "finance") {
      app.innerHTML = renderHeader(c) + '<div class="setup-wrap">' + renderFinance(c) + "</div>";
      bind();
      return;
    }
    if (ui.view === "settings") {
      app.innerHTML =
        renderHeader(c) +
        '<div class="setup-wrap"><main class="stage" style="padding:16px 0">' +
        renderSettings(c) +
        "</main></div>";
      bind();
      return;
    }
    var body;
    if (ui.view === "payitems") body = renderPayItems(c);
    else if (ui.qpId && qp()) body = renderQpDetail(c, t, qp());
    else body = renderLedger(c, t);
    app.innerHTML =
      renderHeader(c) +
      renderKpis(c, r) +
      '<div class="workspace">' +
      renderTasks(c, t) +
      '<main class="stage">' +
      body +
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
    var org = state.orgName || "DelDOT Materials & Research";
    var payBtn = wf(c).payItems
      ? '<button class="btn" data-act="view" data-view="payitems">Pay items</button>'
      : "";
    return (
      '<header class="top no-print">' +
      '<div class="topbar-logo" title="Delaware Department of Transportation"><img src="assets/deldot-logo.png" alt="DelDOT"></div>' +
      '<div class="brand"><span class="brand-title"><b>DelDOT</b> ConTrak</span><small>' +
      esc(org) +
      " · Professional Services</small></div>" +
      '<div class="contract-switch">' +
      btns +
      (isFinance()
        ? '<button class="cbtn add" data-act="view" data-view="finance">+ Agreement</button>'
        : "") +
      '</div><div class="spacer"></div>' +
      '<div class="role-switch" title="Until DelDOT SSO is wired, switch desks here. Finance configures the standard; PMs work inside it.">' +
      '<button class="rbtn' +
      (state.role !== "finance" ? " on" : "") +
      '" data-act="set-role" data-role="pm">PM</button>' +
      '<button class="rbtn' +
      (state.role === "finance" ? " on" : "") +
      '" data-act="set-role" data-role="finance">Finance</button>' +
      "</div>" +
      '<div class="top-actions">' +
      '<button class="btn" data-act="view" data-view="ledger">Ledger</button>' +
      payBtn +
      '<button class="btn" data-act="view" data-view="finance">Setup</button>' +
      '<button class="btn" data-act="view" data-view="settings">Backup</button>' +
      "</div></header>"
    );
  }

  function renderKpis(c, r) {
    var t = task();
    var capLabel = c.historical
      ? "Agreement / PO"
      : c.agreementType === "IDIQ"
      ? "IDIQ maximum $"
      : "Agreement ceiling";
    var taskAvail = t ? E.taskUnallocated(t) : r.unallocated;
    var taskLabel = t
      ? "Available on " + taskNoun(c) + " " + t.number
      : "Available on " + taskNouns(c).toLowerCase();
    return (
      '<section class="kpis no-print">' +
      kpi(capLabel, E.fmtMoney(r.cap), c.contractor || "") +
      kpi("Funded to " + taskNouns(c).toLowerCase(), E.fmtMoney(r.funded), pct(r.funded, r.cap) + "% of cap", r.funded > r.cap ? "bad" : "") +
      kpi("Available on agreement", E.fmtMoney(r.availableOnAgreement), "cap minus open task POs", r.availableOnAgreement < 0 ? "bad" : "ok") +
      kpi("Spent", E.fmtMoney(r.spent), pct(r.spent, r.allocated || r.cap) + "% of NTP") +
      kpi(taskLabel, E.fmtMoney(taskAvail), "for more " + nouns(c), taskAvail < 0 ? "bad" : "") +
      kpi("Open " + nouns(c), String(r.openQps), r.closedQps + " closed · " + r.pendingProposals + " to review", r.pendingProposals ? "warn" : "") +
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
        var avail = E.taskUnallocated(x);
        var counts = E.qpCounts(x);
        var p = pct(alloc, x.poAmount || 1);
        return (
          '<div class="task-card' +
          (t && x.id === t.id ? " on" : "") +
          (x.closed ? " closed" : "") +
          '" data-act="switch-task" data-id="' +
          esc(x.id) +
          '"><div class="n">' +
          esc(taskNoun(c)) +
          " " +
          esc(x.number) +
          (x.closed ? ' <span class="pill st-closed">closed</span>' : "") +
          '</div><div class="m">PO ' +
          E.fmtMoney(x.poAmount) +
          "<br>" +
          counts.total +
          " " +
          (counts.total === 1 ? noun(c) : nouns(c)) +
          " · NTP " +
          E.fmtMoney(alloc) +
          "<br>spent " +
          E.fmtMoney(spent) +
          " · free " +
          E.fmtMoney(avail) +
          (x.closed
            ? "<br>returned " + E.fmtMoney(E.taskReturnedToContract(x)) + " to agreement"
            : "") +
          '</div><div class="bar"><i style="width:' +
          p +
          '%"></i></div></div>'
        );
      })
      .join("");
    return (
      '<aside class="tasks no-print"><h3>' +
      esc(taskNouns(c)) +
      " under " +
      esc(c.code) +
      "</h3>" +
      cards +
      '<button class="btn small" data-act="add-task">+ New ' +
      esc(taskNoun(c).toLowerCase()) +
      "</button></aside>"
    );
  }

  function renderLedger(c, t) {
    if (!t) {
      return (
        '<div class="banner">Create a ' +
        esc(taskNoun(c).toLowerCase()) +
        " to start tracking " +
        esc(nouns(c)) +
        ".</div>"
      );
    }
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
          (st === "closed" || st === "canceled"
            ? E.fmtMoney(E.qpReturned(q)) + '<div class="muted">returned</div>'
            : E.fmtMoney(E.qpRemaining(q))) +
          '</td><td class="muted">' +
          (invs || "—") +
          "</td></tr>"
        );
      })
      .join("");
    var banner = "";
    var customBanner = tpl(c).ledgerBanner;
    if (customBanner) {
      banner = '<div class="banner">' + esc(customBanner) + "</div>";
    } else if (!c.historical) {
      var priced = (c.payItems || []).filter(function (p) {
        return Number(p.unitPrice) > 0;
      }).length;
      var bits = [];
      if (c.rfp) bits.push("RFP <b>" + esc(c.rfp) + "</b>");
      if (c.agreementType) bits.push(esc(c.agreementType));
      if (c.paymentMethod) bits.push(esc(c.paymentMethod));
      if (c.cap) bits.push(E.fmtMoney(c.cap) + " cap");
      bits.push("template <b>" + esc(tpl(c).name) + "</b>");
      if (wf(c).payItems) {
        bits.push(priced + " of " + (c.payItems || []).length + " pay items priced");
      }
      banner +=
        '<div class="banner info">Agreement <b>' +
        esc(c.code) +
        "</b> funds " +
        esc(taskNouns(c).toLowerCase()) +
        ". This " +
        esc(taskNoun(c).toLowerCase()) +
        " is the funded PO bucket. " +
        esc(nouns(c)) +
        " are the NTP’d assignments under it — 40+ on one " +
        esc(taskNoun(c).toLowerCase()) +
        " is expected (PSPM IDIQ “task orders”; this office calls them " +
        esc(nouns(c)) +
        "). Close a " +
        esc(noun(c)) +
        " when the work is performed to issue a close-out letter and return unspent NTP to this " +
        esc(taskNoun(c).toLowerCase()) +
        " for the next " +
        esc(noun(c)) +
        ". Close the " +
        esc(taskNoun(c).toLowerCase()) +
        " when that funding is finished to return leftover PO to the agreement.</div>";
    } else {
      banner =
        '<div class="banner info">Imported ledger (' +
        esc(c.code) +
        " · " +
        esc(c.contractor) +
        "). Dollar totals match the source spreadsheet. Open a " +
        esc(noun(c)) +
        " to continue the workflow Finance set on this template.</div>";
    }
    var counts = E.qpCounts(t);
    var agrAvail = E.contractAvailable(c, t.id);
    var taskLetter = t.closed
      ? renderTaskCloseoutLetter(c, t)
      : "";
    return (
      banner +
      taskLetter +
      '<div class="row-between"><div><b>' +
      esc(taskNoun(c)) +
      " " +
      esc(t.number) +
      "</b> · PO " +
      '<input id="poAmount" value="' +
      esc(t.poAmount || 0) +
      '"' +
      (t.closed ? " disabled" : "") +
      ' style="width:120px;background:var(--panel);border:1px solid var(--border);border-radius:6px;padding:4px 6px">' +
      " · " +
      counts.total +
      " " +
      (counts.total === 1 ? noun(c) : nouns(c)) +
      " · NTP " +
      E.fmtMoney(E.taskAllocated(t)) +
      " · spent " +
      E.fmtMoney(E.taskSpent(t)) +
      " · free for next " +
      esc(noun(c)) +
      " " +
      E.fmtMoney(E.taskUnallocated(t)) +
      '<div class="muted" style="margin-top:4px">Agreement still has ' +
      E.fmtMoney(E.contractAvailable(c)) +
      " unfunded (this " +
      esc(taskNoun(c).toLowerCase()) +
      " can be funded up to " +
      E.fmtMoney(E.money(agrAvail + Number(t.poAmount || 0))) +
      ").</div></div><div>" +
      '<input id="filter" placeholder="Filter ' +
      esc(noun(c)) +
      ' / project / T#" value="' +
      esc(ui.filter) +
      '" style="background:var(--panel);border:1px solid var(--border);border-radius:6px;padding:6px 8px;margin-right:8px">' +
      (t.closed
        ? '<button class="btn" data-act="print-task-closeout">Print task close-out</button>' +
          '<button class="btn" data-act="reopen-task">Reopen ' +
          esc(taskNoun(c).toLowerCase()) +
          "</button>"
        : '<button class="btn primary" data-act="add-qp">+ ' +
          esc(noun(c)) +
          "</button>" +
          (!c.historical && !(t.qps || []).length && wf(c).payItems
            ? '<button class="btn" data-act="demo-qp">Insert example ' +
              esc(noun(c)) +
              "</button>"
            : "") +
          '<button class="btn" data-act="goto-task-closeout">Close out ' +
          esc(taskNoun(c).toLowerCase()) +
          "</button>") +
      "</div></div>" +
      (ui.taskCloseout && !t.closed
        ? renderTaskCloseoutForm(c, t)
        : "") +
      '<div class="card" style="padding:0;overflow:auto"><table class="grid"><thead><tr>' +
      "<th>" +
      esc(noun(c)) +
      " #</th><th>Contract</th><th>Project</th><th>Notes</th><th>Status</th><th>NTP date</th><th>NTP amount</th><th>Spent</th><th>Balance</th><th>Invoices</th>" +
      "</tr></thead><tbody>" +
      (rows ||
        '<tr><td colspan="10" class="muted">No ' +
          esc(nouns(c)) +
          " yet. Add a " +
          esc(noun(c)) +
          " to start.</td></tr>") +
      "</tbody></table></div>"
    );
  }

  function renderQpDetail(c, t, q) {
    var st = E.deriveQpStatus(q);
    var w = wf(c);
    var tabNames = ["info"];
    if (w.proposal) tabNames.push("proposal");
    if (w.ntp) tabNames.push("ntp");
    if (w.invoices) tabNames.push("invoice");
    tabNames.push("closeout");
    if (tabNames.indexOf(ui.qpTab) < 0) ui.qpTab = "info";
    var tabs = tabNames
      .map(function (name) {
        return (
          '<button class="tab' +
          (ui.qpTab === name ? " on" : "") +
          '" data-act="qp-tab" data-tab="' +
          name +
          '">' +
          (name === "closeout" ? "CLOSE-OUT" : name.toUpperCase()) +
          "</button>"
        );
      })
      .join("");
    var body =
      ui.qpTab === "proposal"
        ? renderProposal(c, t, q)
        : ui.qpTab === "ntp"
        ? renderNtp(c, t, q)
        :       ui.qpTab === "invoice"
        ? renderInvoice(c, t, q)
        : ui.qpTab === "closeout"
        ? renderCloseout(c, t, q)
        : renderQpInfo(c, t, q);
    return (
      '<div class="row-between no-print"><div><button class="btn" data-act="back-ledger">← Ledger</button> &nbsp; <b>' +
      esc(noun(c)) +
      " " +
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
    var n = noun(c);
    return (
      '<div class="card"><h2>' +
      esc(n) +
      " information</h2><div class=\"fields\">" +
      field("qpNumber", n + " #", q.qpNumber) +
      field("contractNo", "Contract / T#", q.contractNo) +
      field("project", "Project", q.project) +
      field("billingNo", "Project billing number", q.billingNo || "") +
      field("notes", "Notes", q.notes, "textarea") +
      field("ccExtra", "Extra cc on NTP letter (one per line)", (q.ccExtra || []).join("\n"), "textarea") +
      '</div><div style="margin-top:12px;display:flex;gap:8px;flex-wrap:wrap">' +
      '<button class="btn primary" data-act="save-qp-info">Save</button>' +
      '<button class="btn" data-act="add-supplement">Add supplement (e.g. ' +
      esc(q.qpNumber) +
      "A)</button>" +
      (q.qpClosed
        ? '<button class="btn" data-act="qp-tab" data-tab="closeout">View close-out</button>' +
          '<button class="btn" data-act="reopen-qp">Reopen ' +
          esc(n) +
          "</button>"
        : '<button class="btn good" data-act="qp-tab" data-tab="closeout">Close out · return ' +
          E.fmtMoney(Math.max(E.qpNtp(q) - E.qpSpent(q), 0)) +
          " to " +
          esc(taskNoun(c).toLowerCase()) +
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

  function leftoverToTask(q) {
    return E.money(Math.max(E.qpNtp(q) - E.qpSpent(q), 0));
  }

  function renderCloseout(c, t, q) {
    var leftover = leftoverToTask(q);
    var afterTask = E.money(E.taskUnallocated(t) + (q.qpClosed ? 0 : leftover));
    var n = noun(c);
    var tn = taskNoun(c);
    var letter = renderQpCloseoutLetter(c, t, q, leftover);
    return (
      letter +
      '<div class="card no-print"><h2>Close-out letter</h2>' +
      (q.qpClosed
        ? '<div class="banner info">Closed ' +
          E.fmtDate(q.closeoutDate) +
          ". Unspent " +
          E.fmtMoney(E.qpReturned(q)) +
          " returned to " +
          esc(tn) +
          " " +
          esc(t.number) +
          " and is available for the next " +
          esc(n) +
          ".</div>"
        : "<p>After the work is performed, issue a close-out letter. Unspent NTP returns to <b>" +
          esc(tn) +
          " " +
          esc(t.number) +
          "</b> so you can issue another " +
          esc(n) +
          " under this funded task. It does not leave agreement " +
          esc(c.code) +
          " until you close the " +
          esc(tn).toLowerCase() +
          " itself. Closing the consultant agreement is a Finance and Audit action (PSPM §3 / 2 CFR 200.343).</p>") +
      '<div class="fields">' +
      '<label class="f">Close-out date<input id="closeoutDate" type="date" value="' +
      esc(q.closeoutDate || E.todayISO()) +
      '"' +
      (q.qpClosed ? " disabled" : "") +
      "></label>" +
      '<label class="f">NTP amount<input value="' +
      esc(E.fmtMoney(E.qpNtp(q))) +
      '" disabled></label>' +
      '<label class="f">Invoiced / spent<input value="' +
      esc(E.fmtMoney(E.qpSpent(q))) +
      '" disabled></label>' +
      '<label class="f">Unspent returning to ' +
      esc(tn) +
      " " +
      esc(t.number) +
      '<input value="' +
      esc(E.fmtMoney(leftover)) +
      '" disabled></label>' +
      '<label class="f">' +
      esc(tn) +
      " free after this close-out<input value=\"" +
      esc(E.fmtMoney(afterTask)) +
      '" disabled></label>' +
      '<label class="f">Close-out notes<textarea id="closeoutNotes"' +
      (q.qpClosed ? " disabled" : "") +
      ">" +
      esc(q.closeoutNotes || "") +
      "</textarea></label></div>" +
      '<div style="margin-top:12px;display:flex;gap:8px;flex-wrap:wrap">' +
      (q.qpClosed
        ? '<button class="btn primary" data-act="print-closeout">Print close-out letter</button>' +
          '<button class="btn" data-act="reopen-qp">Reopen ' +
          esc(n) +
          "</button>"
        : '<button class="btn good" data-act="issue-closeout">Issue close-out · return ' +
          E.fmtMoney(leftover) +
          "</button>" +
          '<button class="btn" data-act="print-closeout">Preview / print letter</button>') +
      "</div></div>"
    );
  }

  function renderQpCloseoutLetter(c, t, q, leftover) {
    leftover = leftover != null ? leftover : leftoverToTask(q);
    var returned = q.qpClosed ? E.qpReturned(q) : leftover;
    return (
      '<div class="paper-stack" id="closeoutLetter">' +
      '<article class="letter-page">' +
      officialLetterheadHtml(c) +
      '<div class="letter-date">' +
      esc(E.fmtDateLong(q.closeoutDate || E.todayISO())) +
      "</div>" +
      "<p>Agreement <b>" +
      esc(c.code) +
      "</b> · " +
      esc(c.title || "") +
      "<br>Contractor: " +
      esc(c.contractor) +
      "<br>" +
      esc(taskNoun(c)) +
      " " +
      esc(t.number) +
      " · " +
      esc(noun(c)) +
      " " +
      esc(q.qpNumber) +
      "<br>Project: " +
      esc(q.project || "") +
      " · Contract / T#: " +
      esc(q.contractNo || "") +
      "</p>" +
      "<p>Work under this " +
      esc(noun(c)) +
      " is complete. This notice closes the assignment and returns unspent funds to the funded " +
      esc(taskNoun(c).toLowerCase()) +
      " for additional " +
      esc(nouns(c)) +
      ".</p>" +
      "<p>NTP amount: <b>" +
      E.fmtMoney(E.qpNtp(q)) +
      "</b><br>Invoiced / spent: <b>" +
      E.fmtMoney(E.qpSpent(q)) +
      "</b><br>Unspent funds returned to " +
      esc(taskNoun(c)) +
      " " +
      esc(t.number) +
      ": <b>" +
      E.fmtMoney(returned) +
      "</b></p>" +
      "<p>Close-out date: " +
      E.fmtDate(q.closeoutDate || E.todayISO()) +
      "<br>Notes: " +
      esc(q.closeoutNotes || "") +
      "</p>" +
      "<p>cc: DOT Finance; DOT Audit Management. This letter closes the assignment only. Closing the consultant agreement is a Finance and Audit action (2 CFR 200.343).</p>" +
      officialLetterFooterHtml() +
      "</article></div>"
    );
  }

  function renderTaskCloseoutForm(c, t) {
    var leftover = E.money(Math.max(Number(t.poAmount || 0) - E.taskSpent(t), 0));
    var open = E.qpCounts(t).open;
    return (
      '<div class="card no-print"><h2>Close out ' +
      esc(taskNoun(c)) +
      " " +
      esc(t.number) +
      "</h2>" +
      "<p>Use this when the funded " +
      esc(taskNoun(c).toLowerCase()) +
      " is finished. Open " +
      esc(nouns(c)) +
      " will be closed first (their unspent NTP returns here), then leftover PO of <b>" +
      E.fmtMoney(leftover) +
      "</b> returns to agreement <b>" +
      esc(c.code) +
      "</b> and can fund another " +
      esc(taskNoun(c).toLowerCase()) +
      ".</p>" +
      (open
        ? '<div class="banner">' +
          open +
          " open " +
          (open === 1 ? noun(c) : nouns(c)) +
          " will be closed with this " +
          esc(taskNoun(c).toLowerCase()) +
          ".</div>"
        : "") +
      '<div class="fields"><label class="f">Close-out date<input id="taskCloseoutDate" type="date" value="' +
      esc(E.todayISO()) +
      '"></label>' +
      '<label class="f">Notes<textarea id="taskCloseoutNotes"></textarea></label></div>' +
      '<div style="margin-top:12px;display:flex;gap:8px;flex-wrap:wrap">' +
      '<button class="btn good" data-act="issue-task-closeout">Issue task close-out · return ' +
      E.fmtMoney(leftover) +
      " to " +
      esc(c.code) +
      "</button>" +
      '<button class="btn" data-act="cancel-task-closeout">Cancel</button></div></div>'
    );
  }

  function renderTaskCloseoutLetter(c, t) {
    return (
      '<div class="paper-stack" id="taskCloseoutLetter">' +
      '<article class="letter-page">' +
      officialLetterheadHtml(c) +
      '<div class="letter-date">' +
      esc(E.fmtDateLong(t.closeoutDate || E.todayISO())) +
      "</div>" +
      "<p>Agreement <b>" +
      esc(c.code) +
      "</b> · " +
      esc(c.title || "") +
      "<br>Contractor: " +
      esc(c.contractor) +
      "<br>" +
      esc(taskNoun(c)) +
      " " +
      esc(t.number) +
      "</p>" +
      "<p>This funded " +
      esc(taskNoun(c).toLowerCase()) +
      " is complete. Unspent purchase-order funds are returned to the agreement and may be used to fund another " +
      esc(taskNoun(c).toLowerCase()) +
      ".</p>" +
      "<p>Task PO: <b>" +
      E.fmtMoney(t.poAmount) +
      "</b><br>Spent: <b>" +
      E.fmtMoney(E.taskSpent(t)) +
      "</b><br>Unspent funds returned to agreement " +
      esc(c.code) +
      ": <b>" +
      E.fmtMoney(E.taskReturnedToContract(t)) +
      "</b></p>" +
      "<p>Close-out date: " +
      E.fmtDate(t.closeoutDate || E.todayISO()) +
      "<br>Notes: " +
      esc(t.closeoutNotes || "") +
      "</p>" +
      "<p>cc: DOT Finance; DOT Audit Management. Leftover PO returns to the agreement. Closing the consultant agreement itself remains a Finance and Audit action (2 CFR 200.343).</p>" +
      officialLetterFooterHtml() +
      "</article></div>"
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
            esc(it.itemNo || it.code) +
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
    var estVar = E.estimateVariance(q.independentEstimate, review.total);
    var estBanner =
      estVar.status === "ok"
        ? '<div class="banner info">' + esc(estVar.message) + "</div>"
        : '<div class="banner">' + esc(estVar.message) + "</div>";
    E.ensurePspm(q);
    return (
      '<div class="card"><h2>Consultant proposal review</h2>' +
      "<p class=\"muted\">PSPM §14: the PM prepares a scope of work and independent estimate <b>before</b> reviewing the consultant’s cost proposal. The proposal must include a work plan, cost, and schedule. Engineer qty overrides the proposal when you issue the NTP. Unit prices come from this agreement’s catalog.</p>" +
      estBanner +
      '<div class="fields" style="margin-bottom:10px">' +
      '<label class="f">Independent estimate (PM)<input id="indepEst" value="' +
      esc(q.independentEstimate || "") +
      '" placeholder="0"></label>' +
      '<label class="f">Proposal date<input id="propDate" type="date" value="' +
      esc((q.proposal && q.proposal.submittedDate) || "") +
      '"></label>' +
      '<label class="f">Project name on proposal<input id="propProject" value="' +
      esc((q.proposal && q.proposal.projectName) || q.project || "") +
      '"></label></div>' +
      '<div class="chk-grid" style="margin-bottom:10px">' +
      '<label class="chk"><input type="checkbox" id="pspWorkPlan"' +
      (q.pspm.workPlan ? " checked" : "") +
      "> Work plan included</label>" +
      '<label class="chk"><input type="checkbox" id="pspSchedule"' +
      (q.pspm.schedule ? " checked" : "") +
      "> Schedule included</label></div>" +
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
    var pkt = E.buildNtpPacket(c, t, q);
    var lineRows = pkt.proposalRows
      .map(function (l) {
        return (
          "<tr><td>" +
          esc(l.itemNo) +
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
    E.ensurePspm(q);
    var nextAmt = pkt.amount || E.money(q.ntpAmount || 0);
    var scope = q.ntpDate ? E.ntpScopeChange(q.ntpAmount, nextAmt) : { kind: "initial", message: "" };
    var scopeBanner = scope.message
      ? '<div class="banner">' + esc(scope.message) + "</div>"
      : "";
    var gateChecks =
      wf(c).pspNtpGate === false
        ? ""
        : '<div class="chk-grid" style="margin:10px 0">' +
          '<label class="chk"><input type="checkbox" id="pspWorkPlan"' +
          (q.pspm.workPlan ? " checked" : "") +
          "> Work plan in the proposal</label>" +
          '<label class="chk"><input type="checkbox" id="pspSchedule"' +
          (q.pspm.schedule ? " checked" : "") +
          "> Schedule in the proposal</label>" +
          '<label class="chk"><input type="checkbox" id="pspAudit"' +
          (q.pspm.auditReview ? " checked" : "") +
          "> Audit pre-award review / risk assessment</label>" +
          '<label class="chk"><input type="checkbox" id="pspDbe"' +
          (q.pspm.dbeGoal ? " checked" : "") +
          "> DBE goal set (federal)</label>" +
          '<label class="chk"><input type="checkbox" id="pspDbeNa"' +
          (q.pspm.dbeNa ? " checked" : "") +
          "> DBE N/A (state-only)</label>" +
          '<label class="chk"><input type="checkbox" id="pspFunding"' +
          (q.pspm.fundingAuthorized ? " checked" : "") +
          "> Funding authorized for this task</label></div>" +
          '<label class="f">Independent estimate (PM)<input id="indepEst" value="' +
          esc(q.independentEstimate || "") +
          '"></label>';
    return (
      '<div class="card no-print"><h2>Issue NTP</h2>' +
      (q.ntpDate
        ? '<div class="banner info">NTP issued ' +
          E.fmtDate(q.ntpDate) +
          " for " +
          E.fmtMoney(q.ntpAmount) +
          ". Issuing again records a revised NTP from the current proposal. Print sends the DelDOT letter plus the attached proposal.</div>"
        : "<p>PSPM §14: the NTP date is the earliest date work may begin. The Department may disallow payment of fixed fee on work started before NTP. Print produces the same two-page packet you mail: Secretary letter + contractor proposal.</p>") +
      scopeBanner +
      '<div class="fields">' +
      '<label class="f">NTP / ledger date<input id="ntpDate" type="date" value="' +
      esc(q.ntpDate || E.todayISO()) +
      '"></label>' +
      '<label class="f">Letter date<input id="ntpLetterDate" type="date" value="' +
      esc(q.ntpLetterDate || q.ntpDate || E.todayISO()) +
      '"></label>' +
      '<label class="f">Proposal date<input id="propDate" type="date" value="' +
      esc((q.proposal && q.proposal.submittedDate) || q.ntpDate || "") +
      '"></label>' +
      '<label class="f">Lump-sum amount (if no line items)<input id="ntpLump" value="' +
      esc(q.ntpAmount || "") +
      '"></label>' +
      '<label class="f">NTP notes<textarea id="ntpNotes">' +
      esc(q.ntpNotes || "") +
      "</textarea></label></div>" +
      gateChecks +
      "<p>From proposal lines: <b>" +
      E.fmtMoney(pkt.amount) +
      "</b></p>" +
      (lineRows
        ? '<table class="grid"><thead><tr><th>Item No.</th><th>Description</th><th>Unit</th><th>Qty</th><th>Unit price</th><th>Amount</th></tr></thead><tbody>' +
          lineRows +
          "</tbody></table>"
        : "") +
      '<div style="margin-top:12px;display:flex;gap:8px">' +
      '<button class="btn primary" data-act="issue-ntp">Issue / revise NTP</button>' +
      '<button class="btn" data-act="print-ntp">Print NTP packet</button>' +
      "</div></div>" +
      renderNtpGate(c, q) +
      renderNtpPacket(c, t, q, pkt)
    );
  }

  function nl(text) {
    return esc(text || "").replace(/\n/g, "<br>");
  }

  function renderNtpPacket(c, t, q, pkt) {
    pkt = pkt || E.buildNtpPacket(c, t, q);
    var lh = pkt.letterhead;
    var addr = String(lh.contractorAddress || "").split("\n");
    var contactLine = [lh.contractorContact, lh.contractorCredentials]
      .filter(Boolean)
      .join(", ");
    var ccHtml = (pkt.cc || [])
      .map(function (x) {
        return "<div>" + esc(x) + "</div>";
      })
      .join("");
    var propRows = pkt.proposalRows
      .map(function (l) {
        return (
          "<tr><td>" +
          esc(l.itemNo) +
          "</td><td>" +
          esc(l.description) +
          '</td><td class="num">' +
          esc(l.qty) +
          "</td><td>" +
          esc(l.unitMeasure) +
          '</td><td class="num">' +
          E.fmtMoney(l.unitPrice) +
          '</td><td class="num">' +
          E.fmtMoney(l.amount) +
          "</td></tr>"
        );
      })
      .join("");
    var bodyParts = pkt.body.split("\n\n");
    var letterBody = bodyParts
      .map(function (p) {
        return "<p>" + nl(p) + "</p>";
      })
      .join("");
    return (
      '<div class="paper-stack" id="ntpLetter">' +
      '<article class="letter-page ntp-letter">' +
      officialLetterheadHtml(c) +
      '<div class="letter-date">' +
      esc(pkt.letterDateLong) +
      "</div>" +
      '<div class="letter-addr">' +
      (contactLine ? "<div>" + esc(contactLine) + "</div>" : "") +
      (lh.contractorName ? "<div>" + esc(lh.contractorName) + "</div>" : "") +
      addr
        .map(function (line) {
          return line ? "<div>" + esc(line) + "</div>" : "";
        })
        .join("") +
      "</div>" +
      '<p class="letter-salute">' +
      esc(pkt.salutation) +
      "</p>" +
      letterBody +
      '<p class="letter-sign">Sincerely,</p>' +
      '<p class="letter-sign-file">“Signature on File”</p>' +
      "<p><b>" +
      esc(lh.signerName) +
      "</b><br>" +
      esc(lh.signerTitle) +
      "</p>" +
      '<div class="letter-cc"><span>cc:</span><div>' +
      ccHtml +
      "</div></div>" +
      officialLetterFooterHtml() +
      "</article>" +
      '<article class="letter-page ntp-proposal">' +
      '<div class="prop-head"><div class="prop-from"><b>' +
      esc(lh.contractorName || c.contractor || "") +
      "</b>" +
      addr
        .map(function (line) {
          return line ? "<div>" + esc(line) + "</div>" : "";
        })
        .join("") +
      (lh.contractorPhone ? "<div>Phone: " + esc(lh.contractorPhone) + "</div>" : "") +
      '</div><div class="prop-to"><b>' +
      esc(lh.deldotMailName) +
      "</b><div>" +
      esc(lh.deldotStreet) +
      "</div><div>" +
      esc(lh.deldotPoBox) +
      "</div><div>" +
      esc(lh.deldotCity) +
      "</div><div>Attn: " +
      esc(lh.attention) +
      "</div></div></div>" +
      '<table class="prop-meta"><tbody>' +
      "<tr><th>Date:</th><td>" +
      esc(pkt.proposalDateLong) +
      "</td></tr>" +
      "<tr><th>Project Name:</th><td>" +
      esc(pkt.projectName) +
      "</td></tr>" +
      "<tr><th>Project Design Number:</th><td>" +
      esc(pkt.designNo) +
      "</td></tr>" +
      "<tr><th>AGR:</th><td>" +
      esc(pkt.agrLine) +
      "</td></tr>" +
      "<tr><th>Task:</th><td>" +
      esc(pkt.taskLine) +
      "</td></tr>" +
      "<tr><th>Project Billing Number:</th><td>" +
      esc(pkt.billingNo) +
      "</td></tr>" +
      "</tbody></table>" +
      '<table class="prop-items"><thead><tr><th>Item No.</th><th>Description</th><th>Units</th><th>Unit Measure</th><th>Price</th><th>Total</th></tr></thead><tbody>' +
      (propRows || '<tr><td colspan="6">No pay-item lines — lump-sum NTP ' + esc(pkt.amountLetter) + ".</td></tr>") +
      "</tbody></table>" +
      '<div class="prop-foot"><div><b>PROPOSAL</b><div>' +
      esc(pkt.proposalDateLong) +
      "</div></div><div class=\"prop-total\">Total Amount Due: <b>" +
      esc(pkt.amountLetter) +
      "</b></div></div></article></div>"
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
    var ck = E.buildInvoiceChecklist(c, t, q, inv, tpl(c));
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
      '<div class="row-between" style="margin-top:10px"><div class="muted">' +
      (wf(c).payItems
        ? "Line items vs NTP remaining quantities. Leave blank for a lump-sum check (dollar cap only)."
        : "Dollar check against NTP and the task PO. Finance turned unit prices off on this template.") +
      "</div>" +
      (wf(c).payItems
        ? '<button class="btn" data-act="inv-add-line">+ Pay item</button>'
        : "") +
      "</div>" +
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
      '<button class="btn good" data-act="post-inv">Post to ' +
      esc(noun(c)) +
      "</button>" +
      '<button class="btn" data-act="print-checklist">Print checklist</button>' +
      "</div></div>" +
      '<div class="print-only" id="printChecklist"><h2>Invoice checklist</h2>' +
      "<p>" +
      esc(c.code) +
      " · " +
      esc(noun(c)) +
      " " +
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
    var canEditItems = isFinance();
    var lh = E.ensureLetterhead(c);
    var rows = (c.payItems || [])
      .map(function (it, i) {
        if (canEditItems) {
          return (
            "<tr><td><input data-act=\"item-field\" data-field=\"itemNo\" data-i=\"" +
            i +
            '" value="' +
            esc(it.itemNo || "") +
            '" style="width:70px;background:var(--panel);border:1px solid var(--border);border-radius:6px;padding:4px"></td><td><input data-act="item-field" data-field="code" data-i="' +
            i +
            '" value="' +
            esc(it.code) +
            '" style="width:90px;background:var(--panel);border:1px solid var(--border);border-radius:6px;padding:4px"></td><td><input data-act="item-field" data-field="category" data-i="' +
            i +
            '" value="' +
            esc(it.category || "") +
            '" style="width:110px;background:var(--panel);border:1px solid var(--border);border-radius:6px;padding:4px"></td><td><input data-act="item-field" data-field="description" data-i="' +
            i +
            '" value="' +
            esc(it.description || "") +
            '" style="width:100%;background:var(--panel);border:1px solid var(--border);border-radius:6px;padding:4px"></td><td><input data-act="item-field" data-field="unit" data-i="' +
            i +
            '" value="' +
            esc(it.unit || "") +
            '" style="width:70px;background:var(--panel);border:1px solid var(--border);border-radius:6px;padding:4px"></td><td><input data-act="price" data-i="' +
            i +
            '" value="' +
            (it.unitPrice || "") +
            '" style="width:110px;background:var(--panel);border:1px solid var(--border);border-radius:6px;padding:4px;font-family:var(--mono)"></td><td><button class="btn small danger" data-act="del-payitem" data-i="' +
            i +
            '">×</button></td></tr>'
          );
        }
        return (
          "<tr><td>" +
          esc(it.itemNo || it.code) +
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
      '<div class="card"><h2>Pay items · ' +
      esc(c.code) +
      "</h2>" +
      "<p class=\"muted\">Each agreement has its own catalog. Item No. is the Appendix number that prints on the contractor proposal (2, 5, 7…). PMs enter awarded unit prices. Finance can add or remove items.</p>" +
      '<div class="fields">' +
      field("contractor", "Contractor", c.contractor) +
      field("pm", "Project manager", c.pm) +
      field("cap", "Agreement cap", c.cap) +
      "</div>" +
      '<h3 style="margin-top:16px">NTP letterhead</h3>' +
      "<p class=\"muted\">Copied from the Secretary letters you mail. Finance fills the contractor block once per agreement; extra cc on a QP is set on that QP.</p>" +
      '<div class="fields">' +
      field("lhContact", "Contractor contact", lh.contractorContact) +
      field("lhCreds", "Credentials", lh.contractorCredentials) +
      field("lhSalute", "Salutation", lh.contractorSalutation) +
      field("lhPhone", "Contractor phone", lh.contractorPhone) +
      field("lhAddress", "Contractor address", lh.contractorAddress, "textarea") +
      field("lhBillingNo", "Billing contract no.", lh.billingContractNo) +
      field("lhBillingTitle", "Billing contract title", lh.billingContractTitle) +
      field("lhSigner", "Signer", lh.signerName) +
      field("lhSignerTitle", "Signer title", lh.signerTitle) +
      field("lhSignerPhone", "Signer phone", lh.signerPhone) +
      field("lhCc", "Default cc (one per line)", (lh.cc || []).join("\n"), "textarea") +
      "</div>" +
      '<div style="margin:10px 0;display:flex;gap:8px;flex-wrap:wrap"><button class="btn primary" data-act="save-contract-meta">Save agreement header</button>' +
      (canEditItems ? '<button class="btn" data-act="add-payitem">+ Pay item</button>' : "") +
      "</div>" +
      '<table class="grid"><thead><tr><th>Item No.</th>' +
      (canEditItems ? "<th>Code</th>" : "") +
      "<th>Category</th><th>Description</th><th>Unit</th><th>Unit price</th>" +
      (canEditItems ? "<th></th>" : "") +
      "</tr></thead><tbody>" +
      (rows || '<tr><td colspan="7" class="muted">No pay items on this template. Finance can add them, or switch the agreement to a unit-price template.</td></tr>') +
      "</tbody></table></div>"
    );
  }

  function findTemplate(id) {
    var list = state.templates || [];
    for (var i = 0; i < list.length; i++) {
      if (list[i].id === id) return list[i];
    }
    return null;
  }

  function renderFinance(c) {
    var locked = !isFinance();
    var editId = ui.editTemplateId || tpl(c).id;
    var editing = findTemplate(editId) || tpl(c);
    editing = T.ensureShape(editing);
    var templateOptions = (state.templates || [])
      .map(function (x) {
        return (
          '<option value="' +
          esc(x.id) +
          '"' +
          (x.id === editId ? " selected" : "") +
          ">" +
          esc(x.name) +
          (x.builtin ? " · DelDOT starter" : "") +
          "</option>"
        );
      })
      .join("");
    var bindOptions = (state.templates || [])
      .map(function (x) {
        return (
          '<option value="' +
          esc(x.id) +
          '"' +
          (x.id === c.templateId ? " selected" : "") +
          ">" +
          esc(x.name) +
          "</option>"
        );
      })
      .join("");
    var autoRows = T.AUTO_CHECK_META.map(function (m) {
      var on = editing.autoChecks[m.id] !== false;
      return (
        '<label class="chk"><input type="checkbox" data-act="tpl-auto" data-id="' +
        esc(m.id) +
        '"' +
        (on ? " checked" : "") +
        (locked ? " disabled" : "") +
        "> " +
        esc(m.label) +
        "</label>"
      );
    }).join("");
    var adminRows = (editing.adminChecks || [])
      .map(function (a, i) {
        return (
          '<div class="admin-row"><input data-act="tpl-admin-label" data-i="' +
          i +
          '" value="' +
          esc(a.label) +
          '"' +
          (locked ? " disabled" : "") +
          '><button class="btn small danger" data-act="tpl-admin-del" data-i="' +
          i +
          '"' +
          (locked ? " disabled" : "") +
          ">×</button></div>"
        );
      })
      .join("");
    var agreementRows = state.contracts
      .map(function (x) {
        var tt = tpl(x);
        return (
          "<tr><td><b>" +
          esc(x.code) +
          "</b></td><td>" +
          esc(x.contractor || "—") +
          "</td><td>" +
          esc(x.pm || "—") +
          "</td><td>" +
          E.fmtMoney(x.cap) +
          "</td><td>" +
          esc(tt.name) +
          "</td><td>" +
          (x.historical ? "imported" : "live") +
          "</td></tr>"
        );
      })
      .join("");
    var dis = locked ? " disabled" : "";
    return (
      '<main class="stage setup-stage">' +
      (locked
        ? '<div class="banner">You are in <b>PM</b> desk. The ledger, proposals, NTPs, and invoices are yours. Switch to <b>Finance</b> (upper right) to add agreements, pick a template, and set the checklist PMs must pass. Finance can set this up how they want the PM to work.</div>'
        : '<div class="banner info">Finance desk. Add any professional-services agreement, not just 2216F / 2217F. Bind it to a DelDOT starter template or a copy you customize. Agreement types and payment methods follow the Professional Services Procurement Manual (2016). PMs cannot change the rules — they work inside them.</div>') +
      '<div class="card"><h2>PSPM 2016 · how this desk maps</h2>' +
      "<p class=\"muted\">Official manual: registration, solicitation, IDIQ / multiphase / project-specific / state agreements, then Notice to Proceed. Materials &amp; Research still funds work as Agreement → Task (PO) → QP (NTP’d assignment).</p>" +
      '<table class="grid"><thead><tr><th>PSPM 2016</th><th>ConTrak (this office)</th></tr></thead><tbody>' +
      "<tr><td>Agreement type: IDIQ, Multiphase, Project-Specific, or State. IDIQ: max 5 years including extensions, and a pre-set maximum dollar amount.</td><td>Agreement code (2216F) with cap / ceiling and term.</td></tr>" +
      "<tr><td>Task orders issued as-needed under an IDIQ.</td><td>Quick Proposals under a funded Task. 40+ QPs on one Task is normal.</td></tr>" +
      "<tr><td>Payment: cost plus fixed fee, cost per unit of work, specific rates of compensation, or lump sum.</td><td>Template + payment method on the agreement.</td></tr>" +
      "<tr><td>§14 NTP: independent estimate, consultant proposal (work plan / cost / schedule), Audit review, DBE if federal, funding, then NTP. NTP date is the earliest work may begin.</td><td>Proposal tab + NTP gate. The mailed letter is unchanged.</td></tr>" +
      "<tr><td>§3 close-out: PM notifies Finance and Audit (2 CFR 200.343).</td><td>QP close-out returns leftover NTP to the Task. Task close-out returns leftover PO to the agreement. Agreement close-out stays with Finance / Audit.</td></tr>" +
      "</tbody></table>" +
      '<p class="muted" style="margin-top:8px">Source: <a href="https://deldot.gov/Publications/manuals/professional_services/pdfs/ProfessionalServicesProcurementManual2016.pdf" target="_blank" rel="noopener">Professional Services Procurement Manual (2016)</a></p></div>' +
      '<div class="card"><h2>Office</h2><div class="fields">' +
      '<label class="f">Office name<input id="orgName" value="' +
      esc(state.orgName || "") +
      '"' +
      dis +
      "></label></div>" +
      '<div style="margin-top:10px"><button class="btn primary" data-act="save-org"' +
      dis +
      ">Save office name</button></div></div>" +
      '<div class="card"><h2>Agreements in this office</h2>' +
      '<table class="grid"><thead><tr><th>Code</th><th>Contractor</th><th>PM</th><th>Cap</th><th>Template</th><th></th></tr></thead><tbody>' +
      agreementRows +
      "</tbody></table></div>" +
      '<div class="card"><h2>New agreement</h2>' +
      "<p class=\"muted\">Any professional-services agreement. Type and payment method are the PSPM 2016 lists. IDIQ period including extensions shall not exceed 5 years, and the cap is the maximum agreement dollar amount. Finance fills this in; the PM then runs " +
      esc(nouns(c)) +
      " against it.</p>" +
      '<div class="fields">' +
      '<label class="f">Agreement code<input id="newCode" placeholder="2220F"' +
      dis +
      "></label>" +
      '<label class="f">Title<input id="newTitle" placeholder="Bridge design, lab testing, …"' +
      dis +
      "></label>" +
      '<label class="f">Contractor<input id="newContractor"' +
      dis +
      "></label>" +
      '<label class="f">Project manager<input id="newPm"' +
      dis +
      "></label>" +
      '<label class="f">Maximum $ / ceiling<input id="newCap" placeholder="3000000"' +
      dis +
      "></label>" +
      '<label class="f">RFP / solicitation<input id="newRfp"' +
      dis +
      "></label>" +
      '<label class="f">Agreement type' +
      selectField("newType", E.AGREEMENT_TYPES, "IDIQ", dis) +
      "</label>" +
      '<label class="f">Payment method' +
      selectField("newPay", E.PAYMENT_METHODS, "Cost per unit of work", dis) +
      "</label>" +
      '<label class="f">Term<input id="newTerm" placeholder="Three-year term with two 1-year extensions"' +
      dis +
      "></label>" +
      '<label class="f">Funding' +
      selectField(
        "newFunding",
        ["Federal; CFDA 20.205", "State", "Federal and State"],
        "Federal; CFDA 20.205",
        dis
      ) +
      "</label>" +
      '<label class="f">Template<select id="newTemplate"' +
      dis +
      ">" +
      bindOptions +
      "</select></label></div>" +
      '<div style="margin-top:12px"><button class="btn primary" data-act="create-agreement"' +
      dis +
      ">Create agreement</button></div></div>" +
      '<div class="card"><h2>This agreement · ' +
      esc(c.code) +
      "</h2>" +
      "<p class=\"muted\">Point this contract at a template. Changing the template changes the nouns, tabs, and invoice checklist the PM sees.</p>" +
      '<div class="fields"><label class="f">Bound template<select id="bindTemplate"' +
      dis +
      ">" +
      bindOptions +
      "</select></label></div>" +
      '<div style="margin-top:10px"><button class="btn primary" data-act="bind-template"' +
      dis +
      ">Apply template to " +
      esc(c.code) +
      "</button></div></div>" +
      '<div class="card"><h2>Template editor</h2>' +
      "<p class=\"muted\">DelDOT starters ship with unit-price IDIQ and lump-sum PSA. Duplicate one for another section (bridge, traffic, environmental) and change only what that office needs. Built-in starters can be edited in this browser; Reset puts the original back.</p>" +
      '<div class="row-between"><label class="f" style="flex:1">Editing<select id="pickTemplate" data-act="pick-template">' +
      templateOptions +
      "</select></label><div style=\"display:flex;gap:8px;flex-wrap:wrap;align-items:flex-end\">" +
      '<button class="btn" data-act="dup-template"' +
      dis +
      ">Duplicate</button>" +
      '<button class="btn" data-act="new-template"' +
      dis +
      ">New blank</button>" +
      (editing.builtin
        ? '<button class="btn" data-act="reset-template"' + dis + ">Reset to DelDOT default</button>"
        : '<button class="btn danger" data-act="del-template"' + dis + ">Delete template</button>") +
      "</div></div>" +
      '<div class="fields" style="margin-top:12px">' +
      '<label class="f">Name<input id="tplName" value="' +
      esc(editing.name) +
      '"' +
      dis +
      "></label>" +
      '<label class="f">Assignment noun<input id="tplNoun" value="' +
      esc(editing.assignmentNoun) +
      '" placeholder="QP / Task Order / Work Order"' +
      dis +
      "></label>" +
      '<label class="f">Plural<input id="tplNouns" value="' +
      esc(editing.assignmentNounPlural) +
      '"' +
      dis +
      "></label>" +
      '<label class="f">Task noun<input id="tplTask" value="' +
      esc(editing.taskNoun) +
      '"' +
      dis +
      "></label>" +
      '<label class="f">Task plural<input id="tplTasks" value="' +
      esc(editing.taskNounPlural) +
      '"' +
      dis +
      "></label>" +
      '<label class="f">Seed pay-item catalog<select id="tplSeed"' +
      dis +
      ">" +
      '<option value="subsurface"' +
      (editing.seedCatalog === "subsurface" ? " selected" : "") +
      ">Subsurface IDIQ (M&amp;R)</option>" +
      '<option value="none"' +
      (editing.seedCatalog === "none" ? " selected" : "") +
      ">None — Finance adds items</option></select></label></div>" +
      '<label class="f" style="margin-top:10px">What this template is for<textarea id="tplDesc"' +
      dis +
      ">" +
      esc(editing.description || "") +
      "</textarea></label>" +
      '<label class="f" style="margin-top:10px">Ledger banner (optional)<input id="tplBanner" value="' +
      esc(editing.ledgerBanner || "") +
      '" placeholder="Shown at the top of the ledger"' +
      dis +
      "></label>" +
      "<h3 style=\"margin-top:16px\">Workflow the PM sees</h3>" +
      '<div class="chk-grid">' +
      '<label class="chk"><input type="checkbox" data-act="tpl-wf" data-id="proposal"' +
      (editing.workflow.proposal ? " checked" : "") +
      dis +
      "> Budget proposal review</label>" +
      '<label class="chk"><input type="checkbox" data-act="tpl-wf" data-id="ntp"' +
      (editing.workflow.ntp ? " checked" : "") +
      dis +
      "> Notice to proceed</label>" +
      '<label class="chk"><input type="checkbox" data-act="tpl-wf" data-id="payItems"' +
      (editing.workflow.payItems ? " checked" : "") +
      dis +
      "> Unit-price pay items</label>" +
      '<label class="chk"><input type="checkbox" data-act="tpl-wf" data-id="invoices"' +
      (editing.workflow.invoices ? " checked" : "") +
      dis +
      "> Invoice checklist</label>" +
      '<label class="chk"><input type="checkbox" data-act="tpl-wf" data-id="pspNtpGate"' +
      (editing.workflow.pspNtpGate !== false ? " checked" : "") +
      dis +
      "> PSPM §14 NTP process gate</label></div>" +
      "<h3 style=\"margin-top:16px\">Money checks (automatic)</h3>" +
      "<p class=\"muted\">Turn off a check if this office does not use it. Required fails still block posting.</p>" +
      '<div class="chk-grid">' +
      autoRows +
      "</div>" +
      "<h3 style=\"margin-top:16px\">Admin checklist (PM confirms)</h3>" +
      "<p class=\"muted\">These are the boxes Finance wants ticked before an invoice posts — logs received, MOT, backup, whatever this agreement needs.</p>" +
      '<div class="admin-list">' +
      (adminRows || '<div class="muted">No admin items.</div>') +
      "</div>" +
      '<div style="margin-top:10px;display:flex;gap:8px;flex-wrap:wrap">' +
      '<button class="btn" data-act="tpl-admin-add"' +
      dis +
      ">+ Checklist item</button>" +
      '<button class="btn primary" data-act="save-template"' +
      dis +
      ">Save template</button></div></div>" +
      "</main>"
    );
  }

  function renderSettings(c) {
    return (
      '<div class="card"><h2>Backup / import</h2>' +
      "<p>Data lives in this browser (localStorage). Export a JSON backup before switching computers. You can also import a task sheet in the same layout as <b>NEW CGC 2024.xlsx</b> / <b>HCEA Task 3.xlsx</b> (assignment #, Contract, Project, NTP Amount, invoice date/amount columns).</p>" +
      '<div style="display:flex;gap:8px;flex-wrap:wrap;margin:12px 0">' +
      '<button class="btn primary" data-act="export-json">Export JSON</button>' +
      '<label class="btn">Import JSON<input type="file" id="importJson" accept="application/json" hidden></label>' +
      '<label class="btn">Import Excel task sheet<input type="file" id="importXlsx" accept=".xlsx,.xls" hidden></label>' +
      '<button class="btn danger" data-act="reset">Reset to starter data</button>' +
      "</div>" +
      "<p class=\"muted\">Reset restores empty 2216F / 2217F plus the imported 2019F CGC and 2018F HCEA ledgers, and the DelDOT starter templates.</p></div>"
    );
  }

  function saveTemplateFields() {
    var et = findTemplate(ui.editTemplateId);
    if (!et) return;
    var name = val("tplName");
    if (name) et.name = name;
    if (document.getElementById("tplNoun")) et.assignmentNoun = val("tplNoun") || et.assignmentNoun;
    if (document.getElementById("tplNouns")) et.assignmentNounPlural = val("tplNouns") || et.assignmentNounPlural;
    if (document.getElementById("tplTask")) et.taskNoun = val("tplTask") || et.taskNoun;
    if (document.getElementById("tplTasks")) et.taskNounPlural = val("tplTasks") || et.taskNounPlural;
    if (document.getElementById("tplDesc")) et.description = val("tplDesc");
    if (document.getElementById("tplBanner")) et.ledgerBanner = val("tplBanner");
    if (document.getElementById("tplSeed")) et.seedCatalog = val("tplSeed") || et.seedCatalog;
    T.ensureShape(et);
    save();
  }

  function bind() {
    document.getElementById("app").onclick = onClick;
    document.getElementById("app").onchange = onChange;
    document.getElementById("app").onkeydown = onKey;
    var po = document.getElementById("poAmount");
    if (po) {
      po.onchange = function () {
        var t = task();
        var c = contract();
        t.poAmount = E.money(po.value);
        var room = E.contractAvailable(c, t.id);
        if (t.poAmount - room > 0.009) {
          toast(
            "This " +
              taskNoun(c).toLowerCase() +
              " PO is " +
              E.fmtMoney(t.poAmount - room) +
              " over remaining agreement funds"
          );
        }
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
      ui.taskCloseout = false;
      var nc = contract();
      ui.taskId = nc.tasks[0] && nc.tasks[0].id;
      render();
      return;
    }
    if (act === "switch-task") {
      ui.taskId = el.getAttribute("data-id");
      ui.qpId = null;
      ui.view = "ledger";
      ui.taskCloseout = false;
      render();
      return;
    }
    if (act === "view") {
      ui.view = el.getAttribute("data-view");
      ui.qpId = null;
      if (ui.view === "finance") ui.editTemplateId = tpl(c).id;
      render();
      return;
    }
    if (act === "set-role") {
      state.role = el.getAttribute("data-role") === "finance" ? "finance" : "pm";
      save();
      toast(state.role === "finance" ? "Finance desk — you can configure templates" : "PM desk — work inside the template");
      render();
      return;
    }
    if (act === "save-org") {
      if (!isFinance()) return;
      state.orgName = val("orgName");
      save();
      toast("Office name saved");
      render();
      return;
    }
    if (act === "create-agreement") {
      if (!isFinance()) return;
      var code = String(val("newCode") || "").trim();
      if (!code) {
        toast("Agreement code is required");
        return;
      }
      if (
        state.contracts.some(function (x) {
          return String(x.code).toLowerCase() === code.toLowerCase() || x.id === code;
        })
      ) {
        toast("An agreement with that code already exists");
        return;
      }
      var agr = makeAgreement({
        code: code,
        title: val("newTitle"),
        contractor: val("newContractor"),
        pm: val("newPm"),
        cap: val("newCap"),
        rfp: val("newRfp"),
        agreementType: val("newType"),
        paymentMethod: val("newPay"),
        term: val("newTerm"),
        funding: val("newFunding"),
        templateId: val("newTemplate") || T.UNIT_PRICE_ID,
      });
      state.contracts.push(agr);
      ui.contractId = agr.id;
      ui.taskId = agr.tasks[0].id;
      ui.qpId = null;
      ui.view = "ledger";
      save();
      toast("Created " + agr.code);
      render();
      return;
    }
    if (act === "bind-template") {
      if (!isFinance()) return;
      c.templateId = val("bindTemplate") || T.UNIT_PRICE_ID;
      var bound = tpl(c);
      if (bound.workflow.payItems && !(c.payItems && c.payItems.length) && bound.seedCatalog === "subsurface") {
        c.payItems = window.PsaCatalog.cloneCatalog();
      }
      save();
      toast(c.code + " now uses " + bound.name);
      render();
      return;
    }
    if (act === "dup-template") {
      if (!isFinance()) return;
      saveTemplateFields();
      var src = findTemplate(ui.editTemplateId) || tpl(c);
      var copy = T.duplicate(src);
      state.templates.push(copy);
      ui.editTemplateId = copy.id;
      save();
      toast("Duplicated template — rename it for the office that will use it");
      render();
      return;
    }
    if (act === "new-template") {
      if (!isFinance()) return;
      var blank = T.emptyCustom("Custom PSA template");
      state.templates.push(blank);
      ui.editTemplateId = blank.id;
      save();
      render();
      return;
    }
    if (act === "reset-template") {
      if (!isFinance()) return;
      var cur = findTemplate(ui.editTemplateId);
      if (!cur || !cur.builtin) return;
      var fresh = T.byId(cur.id);
      var idx = state.templates.indexOf(cur);
      state.templates[idx] = fresh;
      save();
      toast("Reset to DelDOT starter");
      render();
      return;
    }
    if (act === "del-template") {
      if (!isFinance()) return;
      var doomed = findTemplate(ui.editTemplateId);
      if (!doomed || doomed.builtin) return;
      var used = state.contracts.filter(function (x) {
        return x.templateId === doomed.id;
      });
      if (used.length) {
        toast("Unbind this template from " + used.map(function (x) { return x.code; }).join(", ") + " first");
        return;
      }
      state.templates = state.templates.filter(function (x) {
        return x.id !== doomed.id;
      });
      ui.editTemplateId = T.UNIT_PRICE_ID;
      save();
      toast("Template deleted");
      render();
      return;
    }
    if (act === "save-template") {
      if (!isFinance()) return;
      saveTemplateFields();
      toast("Template saved — PMs see this on the next ledger refresh");
      render();
      return;
    }
    if (act === "tpl-admin-add") {
      if (!isFinance()) return;
      saveTemplateFields();
      var et = findTemplate(ui.editTemplateId);
      if (!et) return;
      et.adminChecks = et.adminChecks || [];
      et.adminChecks.push({
        id: "admin_" + Date.now().toString(36),
        label: "New checklist item",
      });
      save();
      render();
      return;
    }
    if (act === "tpl-admin-del") {
      if (!isFinance()) return;
      var etd = findTemplate(ui.editTemplateId);
      if (!etd) return;
      etd.adminChecks.splice(Number(el.getAttribute("data-i")), 1);
      save();
      render();
      return;
    }
    if (act === "add-payitem") {
      if (!isFinance()) return;
      c.payItems = c.payItems || [];
      c.payItems.push({
        code: "",
        itemNo: "",
        description: "",
        unit: "EA",
        unitMeasure: "Each",
        category: "Custom",
        unitPrice: 0,
      });
      save();
      render();
      return;
    }
    if (act === "del-payitem") {
      if (!isFinance()) return;
      c.payItems.splice(Number(el.getAttribute("data-i")), 1);
      save();
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
      if (t.closed) {
        toast(taskNoun(c) + " is closed — reopen it to add a " + noun(c));
        return;
      }
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
      q.billingNo = val("billingNo");
      q.ccExtra = String(val("ccExtra") || "")
        .split("\n")
        .map(function (s) {
          return s.trim();
        })
        .filter(Boolean);
      save();
      toast(noun(c) + " saved");
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
      sq.notes = "Supplement to " + noun(c) + " " + q.qpNumber;
      t.qps.push(sq);
      ui.qpId = sq.id;
      save();
      render();
      return;
    }
    if (act === "close-qp" || act === "issue-closeout") {
      E.closeQp(q, {
        date: val("closeoutDate") || E.todayISO(),
        notes: val("closeoutNotes"),
      });
      save();
      toast(
        noun(c) +
          " closed · " +
          E.fmtMoney(E.qpReturned(q)) +
          " returned to " +
          taskNoun(c) +
          " " +
          t.number
      );
      ui.qpTab = "closeout";
      render();
      return;
    }
    if (act === "print-closeout" || act === "print-task-closeout") {
      window.print();
      return;
    }
    if (act === "goto-task-closeout") {
      ui.taskCloseout = true;
      render();
      return;
    }
    if (act === "cancel-task-closeout") {
      ui.taskCloseout = false;
      render();
      return;
    }
    if (act === "issue-task-closeout") {
      E.closeTask(t, {
        date: val("taskCloseoutDate") || E.todayISO(),
        notes: val("taskCloseoutNotes"),
      });
      ui.taskCloseout = false;
      ui.qpId = null;
      save();
      toast(
        taskNoun(c) +
          " " +
          t.number +
          " closed · " +
          E.fmtMoney(E.taskReturnedToContract(t)) +
          " returned to " +
          c.code
      );
      render();
      return;
    }
    if (act === "reopen-task") {
      E.reopenTask(t);
      save();
      toast(taskNoun(c) + " " + t.number + " reopened");
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
      q.proposal.submittedDate = val("propDate") || q.proposal.submittedDate;
      q.proposal.projectName = val("propProject") || q.proposal.projectName;
      q.proposal.status = "draft";
      readPspmFromForm(q);
      save();
      toast("Proposal draft saved");
      render();
      return;
    }
    if (act === "prop-approve") {
      q.proposal.reviewNotes = val("reviewNotes");
      q.proposal.submittedDate = val("propDate") || q.proposal.submittedDate || E.todayISO();
      q.proposal.projectName = val("propProject") || q.proposal.projectName;
      q.proposal.status = "approved";
      readPspmFromForm(q);
      save();
      toast("Proposal approved — issue NTP next");
      ui.qpTab = "ntp";
      render();
      return;
    }
    if (act === "prop-revision") {
      q.proposal.reviewNotes = val("reviewNotes");
      q.proposal.submittedDate = val("propDate") || q.proposal.submittedDate;
      q.proposal.projectName = val("propProject") || q.proposal.projectName;
      q.proposal.status = "revision";
      readPspmFromForm(q);
      save();
      toast("Marked for revision");
      render();
      return;
    }
    if (act === "issue-ntp") {
      var prevNtp = q.ntpAmount;
      var date = val("ntpDate") || E.todayISO();
      q.ntpNotes = val("ntpNotes");
      q.ntpLetterDate = val("ntpLetterDate") || date;
      if (val("propDate") && q.proposal) q.proposal.submittedDate = val("propDate");
      readPspmFromForm(q);
      if (!(q.proposal && q.proposal.lines && q.proposal.lines.length)) {
        q.ntpAmount = E.money(val("ntpLump"));
        q.ntpDate = date;
        q.status = "ntp";
      } else {
        E.issueNtp(q, date, q.ntpNotes);
      }
      var gate = E.ntpGate(c, q);
      var scope = E.ntpScopeChange(prevNtp, q.ntpAmount);
      var msg = "NTP issued for " + E.fmtMoney(q.ntpAmount);
      if (scope.message) msg += ". " + scope.message;
      else if (!gate.ready) {
        msg +=
          ". PSPM §14 still open: " +
          gate.missingLabels.slice(0, 3).join("; ") +
          ".";
      }
      save();
      toast(msg);
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
        var ck = E.buildInvoiceChecklist(c, t, q, cur, tpl(c));
        if (ck.requiredFailCount) {
          toast("Checklist failed — not posted");
          save();
          render();
          return;
        }
        cur.status = "posted";
        toast("Invoice posted to " + noun(c));
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
      var lh = E.ensureLetterhead(c);
      lh.contractorContact = val("lhContact");
      lh.contractorCredentials = val("lhCreds");
      lh.contractorSalutation = val("lhSalute");
      lh.contractorPhone = val("lhPhone");
      lh.contractorAddress = val("lhAddress");
      lh.contractorName = c.contractor;
      lh.billingContractNo = val("lhBillingNo");
      lh.billingContractTitle = val("lhBillingTitle");
      lh.signerName = val("lhSigner");
      lh.signerTitle = val("lhSignerTitle");
      lh.signerPhone = val("lhSignerPhone");
      lh.cc = String(val("lhCc") || "")
        .split("\n")
        .map(function (s) {
          return s.trim();
        })
        .filter(Boolean);
      c.letterhead = lh;
      save();
      toast("Agreement header saved");
      render();
      return;
    }
    if (act === "export-json") {
      var blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
      var a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "contrak-backup.json";
      a.click();
      return;
    }
    if (act === "reset") {
      if (!confirm("Reset all ConTrak data in this browser?")) return;
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
    q.notes = "Example " + noun(c) + " — delete after you start real work.";
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
    toast("Example " + noun(c) + " loaded — review quantities, then issue NTP");
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
        line.unitMeasure = item.unitMeasure || "";
        line.itemNo = item.itemNo || item.code;
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
        line.unitMeasure = item.unitMeasure || "";
        line.itemNo = item.itemNo || item.code;
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
    if (act === "item-field") {
      if (!isFinance()) return;
      var it = c.payItems[Number(el.getAttribute("data-i"))];
      if (!it) return;
      it[el.getAttribute("data-field")] = el.value;
      save();
      return;
    }
    if (act === "pick-template") {
      if (isFinance()) saveTemplateFields();
      ui.editTemplateId = el.value;
      render();
      return;
    }
    if (act === "tpl-auto") {
      if (!isFinance()) return;
      var eta = findTemplate(ui.editTemplateId);
      if (!eta) return;
      eta.autoChecks = eta.autoChecks || {};
      eta.autoChecks[el.getAttribute("data-id")] = !!el.checked;
      save();
      return;
    }
    if (act === "tpl-wf") {
      if (!isFinance()) return;
      var etw = findTemplate(ui.editTemplateId);
      if (!etw) return;
      etw.workflow = etw.workflow || {};
      etw.workflow[el.getAttribute("data-id")] = !!el.checked;
      save();
      return;
    }
    if (act === "tpl-admin-label") {
      if (!isFinance()) return;
      var etl = findTemplate(ui.editTemplateId);
      if (!etl || !etl.adminChecks) return;
      var row = etl.adminChecks[Number(el.getAttribute("data-i"))];
      if (row) row.label = el.value;
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
        if (!data.contracts) throw new Error("Not a ConTrak backup");
        state = T.migrateState(data);
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
        toast("Imported " + parsed.qps.length + " " + nouns(contract()) + " from " + sheetName);
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
