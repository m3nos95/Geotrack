/* DelDOT SOS letter app — UI on top of SOSEngine / SOSData */
(function () {
  'use strict';

  const STORE = {
    items: 'deldot_sos_items_v2',
    cc: 'deldot_sos_cc_v2',
    cc_lib: 'deldot_sos_cc_lib',
    cc_lib_ready: 'deldot_sos_cc_lib_ready',
    cc_lib_sort: 'deldot_sos_cc_lib_sort',
    cc_retired: 'deldot_sos_cc_retired',
    revisions: 'deldot_sos_revisions_v2',
    rev: 'deldot_sos_currentrev_v2',
    project: 'deldot_sos_project_v2',
    contractors: 'deldot_sos_contractors',
    projects: 'deldot_sos_projects_lib',
    contacts: 'deldot_sos_contacts_lib',
    sources: 'deldot_sos_sources',
    specs: 'deldot_sos_specs',
    warnings: 'deldot_sos_warnings_v2',
    lists: 'deldot_sos_lists_v1',
    cc_rules: 'deldot_sos_cc_rules_v1',
    cc_samplers: 'deldot_sos_cc_samplers_v1',
    author: 'deldot_sos_author_v1',
    letter: 'deldot_sos_letter_html_v1',
  };

  const actionMeta = {
    approved: { label: 'APPROVED', cls: 'action-approved' },
    test: { label: 'MUST BE TESTED', cls: 'action-test' },
    'not-approved': { label: 'NOT APPROVED', cls: 'action-not-approved' },
    apl: { label: 'APL', cls: 'action-apl' },
    'on-file': { label: 'ON FILE', cls: 'action-on-file' },
    visual: { label: 'VISUAL INSP.', cls: 'action-visual' },
    submit: { label: 'SUBMIT', cls: 'action-submit' },
  };

  function ls_get(key, fallback) {
    try {
      const r = localStorage.getItem(key);
      if (r == null) return fallback;
      return JSON.parse(r);
    } catch (e) { return fallback; }
  }
  function ls_set(key, val) {
    try { localStorage.setItem(key, JSON.stringify(val)); } catch (e) {}
  }

  let items = ls_get(STORE.items, []);
  let ccList = ls_get(STORE.cc, []);
  let ccLib = [];
  let ccLibSortDir = 'asc';
  let ccRetired = [];
  let ccAssignments = [];
  let samplerContacts = {};
  let revisions = ls_get(STORE.revisions, []);
  let currentRev = ls_get(STORE.rev, 1);
  let sourceLib = [];
  let specLib = [];
  let specTags = [];
  let subItemTags = [];
  let editingItemId = null;
  let parsedImport = null;
  let liveLists = (typeof SOSLists !== 'undefined' && SOSLists.emptyBundle) ? SOSLists.emptyBundle() : { tack: { entries: [] }, aggregate: { entries: [] } };
  let warnings = ls_get(STORE.warnings, []);
  let signatureImage = localStorage.getItem('sosSignatureImage') || '';
  let signedAt = '';
  let highlightMode = false;
  let letterPreviewDirty = false;
  let srcFocusIdx = { primary: -1, alt: -1 };
  let specDdFocusIdx = -1;
  let slActiveTags = [];
  let _srcModalCallback = null;
  let _pdfJsLoading = null;
  let _xlsxLoading = null;
  let lastSubmittal = null;
  const PDFJS_SRC = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.min.js';
  const PDFJS_WORKER_SRC = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js';
  const XLSX_SRC = 'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js';
  const LIB_TABLE_CAP = 250;

  function persistAll() {
    ls_set(STORE.items, items);
    ls_set(STORE.cc, ccList);
    ls_set(STORE.revisions, revisions);
    ls_set(STORE.rev, currentRev);
    ls_set(STORE.warnings, warnings);
    persistProject();
  }
  function persistProject() {
    ls_set(STORE.project, {
      contract: val('ph-contract'),
      title: val('ph-title'),
      contractor: val('ph-contractor'),
      contractorAddr: val('ph-contractor-addr'),
      district: val('ph-district'),
      contact: val('ph-contact'),
      date: val('ph-date'),
      docKind: val('ph-dockind'),
      signedAt: signedAt || '',
    });
    const name = val('ph-contractor');
    const addr = val('ph-contractor-addr');
    if (name) saveContractorToLib(name, addr);
    const contract = val('ph-contract');
    const title = val('ph-title');
    if (contract) saveProjectToLib(contract, title);
    if (val('ph-contact')) saveContactToLib(val('ph-contact'));
    persistAuthor();
  }
  function defaultAuthor() {
    const a = (typeof SOSData !== 'undefined' && SOSData.CONTACTS && SOSData.CONTACTS.letterAuthor)
      ? SOSData.CONTACTS.letterAuthor
      : { name: 'Steven Peretiatko', title: 'Materials Technician', phone: '302-760-2375' };
    return { name: a.name || '', title: a.title || '', phone: a.phone || '' };
  }
  function currentAuthor() {
    const d = defaultAuthor();
    return {
      name: val('ph-author-name').trim() || d.name,
      title: val('ph-author-title').trim() || d.title,
      phone: val('ph-author-phone').trim() || d.phone,
    };
  }
  function persistAuthor() {
    ls_set(STORE.author, currentAuthor());
  }
  function loadAuthor() {
    const saved = ls_get(STORE.author, null) || {};
    const d = defaultAuthor();
    setVal('ph-author-name', saved.name || d.name);
    setVal('ph-author-title', saved.title || d.title);
    setVal('ph-author-phone', saved.phone || d.phone);
  }
  function val(id) {
    const el = document.getElementById(id);
    return el ? el.value : '';
  }
  function setVal(id, v) {
    const el = document.getElementById(id);
    if (el) el.value = v == null ? '' : v;
  }

  function headerToday() {
    if (typeof SOSEngine !== 'undefined' && SOSEngine.todayISO) return SOSEngine.todayISO();
    const d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }

  function saveContractorToLib(name, addr) {
    let lib = ls_get(STORE.contractors, []);
    const idx = lib.findIndex(c => c.name.toLowerCase() === name.toLowerCase());
    const entry = { name, addr: addr || '' };
    if (idx >= 0) lib[idx] = entry; else lib.unshift(entry);
    ls_set(STORE.contractors, lib.slice(0, 40));
  }
  function saveProjectToLib(contract, title) {
    let lib = ls_get(STORE.projects, []);
    const idx = lib.findIndex(p => p.contract.toLowerCase() === contract.toLowerCase());
    const entry = { contract, title: title || '' };
    if (idx >= 0) lib[idx] = entry; else lib.unshift(entry);
    ls_set(STORE.projects, lib.slice(0, 40));
  }
  function saveContactToLib(name) {
    let lib = ls_get(STORE.contacts, []);
    if (!lib.find(c => c.toLowerCase() === name.toLowerCase())) {
      lib.unshift(name);
      ls_set(STORE.contacts, lib.slice(0, 40));
    }
  }

  function loadProjectHeader() {
    const p = ls_get(STORE.project, {});
    setVal('ph-contract', p.contract || '');
    setVal('ph-title', p.title || '');
    setVal('ph-contractor', p.contractor || '');
    setVal('ph-contractor-addr', p.contractorAddr || '');
    if (p.district) setVal('ph-district', p.district);
    setVal('ph-contact', p.contact || '');
    setVal('ph-date', p.date || headerToday());
    if (p.docKind) setVal('ph-dockind', p.docKind);
    signedAt = p.signedAt || '';
    document.getElementById('rev-display').textContent = 'REV ' + String(currentRev).padStart(2, '0');
    updateContractWarn();
    refreshSpecYearFromContract();
  }

  function updateContractWarn() {
    const el = document.getElementById('ph-contract');
    if (!el) return;
    el.classList.toggle('warn', !el.value.trim());
  }

  function refreshSpecYearFromContract() {
    const el = document.getElementById('ph-specyear');
    if (!el) return;
    const contract = val('ph-contract');
    const rec = (typeof SOSLists !== 'undefined' && SOSLists.lookupAwardedContract)
      ? SOSLists.lookupAwardedContract(listsForEngine(), contract)
      : null;
    if (rec && rec.specYear) {
      el.value = rec.specYear;
      const bits = [rec.specYear];
      if (rec.fap) bits.push(rec.fap);
      if (rec.title) bits.push(rec.title);
      el.title = bits.join(' · ');
      return;
    }
    if (rec) {
      el.value = rec.catalogYear ? ('spec year ' + rec.catalogYear) : '';
      el.placeholder = rec.catalogYear ? '' : 'on awarded list — spec year not listed';
      el.title = rec.title
        ? rec.title + (rec.specYear ? '' : ' · spec year not listed on the Awarded Contract List')
        : 'On the Awarded Contract List, but no spec year is printed.';
      return;
    }
    const book = (typeof SOSLists !== 'undefined' && SOSLists.currentBookMeta)
      ? SOSLists.currentBookMeta(listsForEngine())
      : null;
    if (book) {
      el.value = book.shortLabel;
      const why = (contract && /^T/i.test(contract.trim()))
        ? 'Not on the Awarded Contract List'
        : 'Not on the Awarded Contract List (application / agreement)';
      el.title = why + ' — item numbers checked against the ' + book.bookName + '.';
      return;
    }
    el.value = '';
    el.placeholder = (contract && /^T/i.test(contract.trim())) ? 'not on awarded list' : '—';
    el.title = 'Controlling specification year from the Awarded Contract List.';
  }

  function wireProjectPersist() {
    ['ph-contract', 'ph-title', 'ph-contractor', 'ph-contractor-addr', 'ph-district', 'ph-contact', 'ph-date', 'ph-dockind', 'ph-author-name', 'ph-author-title', 'ph-author-phone'].forEach(id => {
      const el = document.getElementById(id);
      if (!el) return;
      el.addEventListener('input', () => {
        persistProject();
        updateContractWarn();
        if (id === 'ph-contract') refreshSpecYearFromContract();
        if (id === 'ph-district' || id === 'ph-contact') {
          if (items.length) applyCcRulesToLetter();
        }
        if (id === 'ph-contract' && items.length && !letterPreviewDirty) applyListsToOpenLetter();
        if (!letterPreviewDirty) renderLetter();
        renderWarnings();
      });
      el.addEventListener('blur', persistProject);
    });
  }

  function loadSourceLib() {
    sourceLib = ls_get(STORE.sources, []);
    if (!sourceLib.length) {
      sourceLib = SOSData.SOURCE_SEEDS.map((s, i) => ({ id: 's' + (i + 1), contact: '', ...s }));
      ls_set(STORE.sources, sourceLib);
    }
  }
  function saveSourceLib() {
    ls_set(STORE.sources, sourceLib);
    updateSourceLibCounts();
  }
  function specPickerDesc(entry) {
    if (!entry) return '';
    const catalog = (SOSData.SPEC_CATALOG && (SOSData.SPEC_CATALOG[entry.num] || SOSData.SPEC_CATALOG[String(entry.num || '').replace(/^#/, '')])) || {};
    const extra = [entry.lastSrcName].filter(Boolean);
    return SOSData.cleanSpecLibraryDesc(entry.desc, extra) || catalog.desc || '';
  }

  function updateSourceLibCounts() {
    const n = document.getElementById('sources-count');
    if (n) n.textContent = sourceLib.length;
    const l = document.getElementById('lib-count-label');
    if (l) l.textContent = sourceLib.length + ' suppliers';
  }
  function updateSpecLibCounts() {
    const n = document.getElementById('specs-count');
    if (n) n.textContent = specLib.length;
  }
  function loadSpecLib() {
    specLib = ls_get(STORE.specs, []);
    if (!Array.isArray(specLib)) specLib = [];
    if (!specLib.length) {
      specLib = Object.entries(SOSData.SPEC_CATALOG).map(([num, v]) => ({
        num, desc: v.desc, tags: v.tags || [], notes: '', lastSrcName: '', lastSrcLoc: '', lastSrcAddr: '', lastSrcPhone: '',
      }));
      saveSpecLib();
      return;
    }
    const byNum = new Map();
    specLib.forEach((s) => {
      const num = String(s.num || '').toUpperCase().replace(/^([^#])/, '#$1');
      if (!num || num === '#') return;
      if (!byNum.has(num)) byNum.set(num, s);
    });
    let added = 0;
    Object.entries(SOSData.SPEC_CATALOG).forEach(([num, v]) => {
      const key = String(num).toUpperCase().replace(/^([^#])/, '#$1');
      if (byNum.has(key)) return;
      byNum.set(key, {
        num: key, desc: v.desc || '', tags: v.tags || [], notes: '',
        lastSrcName: '', lastSrcLoc: '', lastSrcAddr: '', lastSrcPhone: '',
      });
      added += 1;
    });
    specLib = [...byNum.values()];
    if (added) saveSpecLib();
    else updateSpecLibCounts();
  }
  function saveSpecLib() {
    ls_set(STORE.specs, specLib);
    updateSpecLibCounts();
  }
  function ccNameKey(name) {
    return (SOSData.normalizeCcName || ((n) => String(n || '').trim().toLowerCase()))(name);
  }

  function loadRetiredNames() {
    const raw = ls_get(STORE.cc_retired, []);
    ccRetired = Array.isArray(raw) ? raw.map(ccNameKey).filter(Boolean) : [];
  }

  function persistRetiredNames() {
    ls_set(STORE.cc_retired, ccRetired);
  }

  function isRetiredName(name) {
    return ccRetired.indexOf(ccNameKey(name)) !== -1;
  }

  function retireName(name) {
    const n = ccNameKey(name);
    if (!n || isRetiredName(n)) return;
    ccRetired.push(n);
    persistRetiredNames();
  }

  function unretireName(name) {
    const n = ccNameKey(name);
    ccRetired = ccRetired.filter(x => x !== n);
    persistRetiredNames();
  }

  function persistCCLib() {
    ccLib = SOSData.sortCcPeople(ccLib, ccLibSortDir);
    ls_set(STORE.cc_lib, ccLib);
    ls_set(STORE.cc_lib_sort, ccLibSortDir);
  }

  function loadCCLib() {
    loadRetiredNames();
    const ready = !!ls_get(STORE.cc_lib_ready, false);
    ccLibSortDir = ls_get(STORE.cc_lib_sort, 'asc') === 'desc' ? 'desc' : 'asc';
    ccLib = ls_get(STORE.cc_lib, []);
    if (!Array.isArray(ccLib)) ccLib = [];
    if (!ready && !ccLib.length) {
      ccLib = SOSData.CC_LIBRARY_SEEDS.map((p, i) => ({ id: 'cl' + (i + 1), role: p.role || '', ...p }));
    }
    ccLib = SOSData.filterRetiredCcPeople(ccLib, ccRetired);
    persistCCLib();
    ls_set(STORE.cc_lib_ready, true);
  }

  function cloneCcAssignments(list) {
    return (list || []).map((a, i) => ({
      id: a.id || ('cc-' + Date.now() + '-' + i),
      name: a.name || '',
      org: a.org || 'DelDOT',
      phone: a.phone || '',
      role: a.role || '',
      always: !!a.always,
      groups: Array.isArray(a.groups) ? a.groups.slice() : [],
      districts: Array.isArray(a.districts) ? a.districts.slice() : [],
    })).filter(a => !a.name || !isRetiredName(a.name));
  }

  function loadCcRules() {
    const saved = ls_get(STORE.cc_rules, null);
    ccAssignments = cloneCcAssignments(saved && saved.length ? saved : SOSData.CC_ASSIGNMENT_SEEDS);
    const sam = ls_get(STORE.cc_samplers, null);
    samplerContacts = {
      sampling: Object.assign({}, SOSData.CONTACTS.sampling, sam && sam.sampling),
      samplingNorth: Object.assign({}, SOSData.CONTACTS.samplingNorth, sam && sam.samplingNorth),
      samplingCanal: Object.assign({}, SOSData.CONTACTS.samplingCanal, sam && sam.samplingCanal),
    };
  }

  function persistCcRules() {
    ls_set(STORE.cc_rules, ccAssignments);
    ls_set(STORE.cc_samplers, samplerContacts);
  }

  function listsForEngine() {
    return Object.assign({}, liveLists, {
      ccAssignments,
      contacts: samplerContacts,
      retiredCc: ccRetired,
    });
  }

  function currentProjectForCc() {
    return {
      contact: val('ph-contact'),
      district: val('ph-district'),
    };
  }

  window.applyCcRulesToLetter = function () {
    ccList = SOSEngine.buildCcList(currentProjectForCc(), listsForEngine(), items);
    persistAll();
    renderCC();
    renderCCLib();
    renderLetter();
  };

  window.renderCcRules = function () {
    const tbody = document.getElementById('cc-rules-tbody');
    if (!tbody) return;
    const groups = SOSData.CC_MATERIAL_GROUPS || [];
    const districts = SOSData.CC_DISTRICTS || [];
    tbody.innerHTML = ccAssignments.map(a => {
      const chips = groups.map(g => {
        const on = (a.groups || []).includes(g.id);
        return `<label style="display:inline-flex;align-items:center;gap:4px;margin:2px 8px 2px 0;font-size:11px;white-space:nowrap;">
          <input type="checkbox" ${on ? 'checked' : ''} onchange="toggleCcRuleGroup('${esc(a.id)}','${g.id}',this.checked)"> ${esc(g.label)}
        </label>`;
      }).join('');
      const districtChips = districts.map(d => {
        const on = (a.districts || []).includes(d.id);
        return `<label style="display:inline-flex;align-items:center;gap:4px;margin:2px 8px 2px 0;font-size:11px;white-space:nowrap;">
          <input type="checkbox" ${on ? 'checked' : ''} onchange="toggleCcRuleDistrict('${esc(a.id)}','${d.id}',this.checked)"> ${esc(d.label)}
        </label>`;
      }).join('');
      const always = a.always
        ? 'checked' : '';
      const results = a.role === 'results' ? 'checked' : '';
      return `<tr>
        <td>
          <input class="form-input" value="${esc(a.name)}" onchange="setCcRuleField('${esc(a.id)}','name',this.value)" style="min-width:120px;">
          <div style="font-size:10px;color:var(--text-dim);margin-top:4px;">
            <label><input type="checkbox" ${results} onchange="setCcRuleField('${esc(a.id)}','role',this.checked?'results':'')"> Lab results (ACTION notes)</label>
          </div>
        </td>
        <td><input class="form-input" value="${esc(a.phone)}" onchange="setCcRuleField('${esc(a.id)}','phone',this.value)" placeholder="optional"></td>
        <td>
          ${chips}
          <div style="margin-top:4px;">${districtChips}
            <span style="font-size:10px;color:var(--text-dim);">(blank = all districts)</span>
          </div>
          <label style="display:inline-flex;align-items:center;gap:4px;margin:2px 0;font-size:11px;font-weight:600;">
            <input type="checkbox" ${always} onchange="setCcRuleField('${esc(a.id)}','always',this.checked)"> Always
          </label>
        </td>
        <td><button class="btn btn-ghost btn-sm btn-icon" onclick="deleteCcRule('${esc(a.id)}')" style="color:var(--red);">✕</button></td>
      </tr>`;
    }).join('');
    renderSamplerFields();
  };

  function renderSamplerFields() {
    const el = document.getElementById('cc-sampler-fields');
    if (!el) return;
    const rows = [
      ['sampling', 'South'],
      ['samplingNorth', 'North'],
      ['samplingCanal', 'Canal'],
    ];
    el.innerHTML = rows.map(([key, label]) => {
      const c = samplerContacts[key] || {};
      return `<div style="background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);padding:10px;">
        <div style="font-size:11px;font-weight:700;margin-bottom:6px;">${label}</div>
        <input class="form-input" value="${esc(c.name || '')}" onchange="setSamplerField('${key}','name',this.value)" placeholder="Name" style="margin-bottom:6px;">
        <input class="form-input" value="${esc(c.phone || '')}" onchange="setSamplerField('${key}','phone',this.value)" placeholder="Phone">
      </div>`;
    }).join('');
  }

  window.setCcRuleField = function (id, field, value) {
    const row = ccAssignments.find(a => a.id === id);
    if (!row) return;
    const prevName = row.name;
    if (field === 'always') row.always = !!value;
    else row[field] = value;
    if (field === 'name' && value && String(value).trim()) {
      const next = String(value).trim();
      row.name = next;
      if (prevName && ccNameKey(prevName) !== ccNameKey(next)) {
        applyCcNameChange(prevName, { name: next, org: row.org || 'DelDOT', role: row.role || '' });
        row.name = next;
      } else {
        upsertCcLibPerson(next, row.org || 'DelDOT', { force: true });
      }
    }
    persistCcRules();
    if (items.length) applyCcRulesToLetter();
    else { renderLetter(); renderCCLib(); renderCC(); }
  };

  window.toggleCcRuleGroup = function (id, groupId, on) {
    const row = ccAssignments.find(a => a.id === id);
    if (!row) return;
    const set = new Set(row.groups || []);
    if (on) set.add(groupId); else set.delete(groupId);
    row.groups = [...set];
    persistCcRules();
    if (items.length) applyCcRulesToLetter();
  };

  window.toggleCcRuleDistrict = function (id, districtId, on) {
    const row = ccAssignments.find(a => a.id === id);
    if (!row) return;
    const set = new Set(row.districts || []);
    if (on) set.add(districtId); else set.delete(districtId);
    row.districts = [...set];
    persistCcRules();
    if (items.length) applyCcRulesToLetter();
  };

  window.addCcRule = function () {
    ccAssignments.push({
      id: 'cc-' + Date.now(),
      name: '',
      org: 'DelDOT',
      phone: '',
      role: '',
      always: false,
      groups: [],
      districts: [],
    });
    persistCcRules();
    renderCcRules();
  };

  window.deleteCcRule = function (id) {
    ccAssignments = ccAssignments.filter(a => a.id !== id);
    persistCcRules();
    renderCcRules();
    if (items.length) applyCcRulesToLetter();
  };

  window.resetCcRules = function () {
    ccAssignments = cloneCcAssignments(SOSData.CC_ASSIGNMENT_SEEDS);
    samplerContacts = {
      sampling: Object.assign({}, SOSData.CONTACTS.sampling),
      samplingNorth: Object.assign({}, SOSData.CONTACTS.samplingNorth),
      samplingCanal: Object.assign({}, SOSData.CONTACTS.samplingCanal),
    };
    persistCcRules();
    renderCcRules();
    if (items.length) applyCcRulesToLetter();
  };

  window.setSamplerField = function (key, field, value) {
    if (!samplerContacts[key]) samplerContacts[key] = { name: '', phone: '', org: 'Materials & Research' };
    samplerContacts[key][field] = value;
    persistCcRules();
    if (items.length) applyCcRulesToLetter();
    renderWarnings();
  };

  function autoSaveSource(name, loc, addr, phone, extra) {
    if (!name) return;
    const exists = sourceLib.find(s => s.name.toLowerCase() === name.toLowerCase() && (s.loc || '').toLowerCase() === (loc || '').toLowerCase());
    if (exists) {
      if (loc && !exists.loc) exists.loc = loc;
      if (addr && !exists.addr) exists.addr = addr;
      if (phone && !exists.phone) exists.phone = phone;
      if (extra && extra.tags) {
        exists.tags = [...new Set([...(exists.tags || []), ...extra.tags])];
      }
      if (!(extra && extra.silent)) saveSourceLib();
      return;
    }
    sourceLib.push({
      id: 's' + Date.now() + '-' + sourceLib.length,
      name,
      loc: loc || '',
      addr: addr || '',
      phone: phone || '',
      contact: '',
      tags: (extra && extra.tags) || [],
    });
    if (!(extra && extra.silent)) saveSourceLib();
  }
  function autoSaveSpec(num, desc, srcName, srcLoc, srcAddr, srcPhone, extra) {
    if (!num) return;
    const key = String(num).toUpperCase().replace(/^([^#])/, '#$1');
    const cleaned = SOSData.cleanSpecLibraryDesc(desc, srcName ? [srcName] : []);
    const existing = specLib.find(s => s.num === key);
    if (!existing) {
      specLib.push({ num: key, desc: cleaned || '', lastSrcName: srcName || '', lastSrcLoc: srcLoc || '', lastSrcAddr: srcAddr || '', lastSrcPhone: srcPhone || '', tags: [], notes: '' });
    } else {
      existing.desc = SOSData.preferSpecDesc(existing.desc, cleaned);
      if (srcName) existing.lastSrcName = srcName;
      if (srcLoc) existing.lastSrcLoc = srcLoc;
      if (srcAddr) existing.lastSrcAddr = srcAddr;
      if (srcPhone) existing.lastSrcPhone = srcPhone;
    }
    if (!(extra && extra.silent)) saveSpecLib();
  }

  window.switchTab = function (name, el) {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
    (el || document.querySelector('.tab[data-tab="' + name + '"]')).classList.add('active');
    document.getElementById('tab-' + name).classList.add('active');
    if (name === 'cc') { renderCCLib(); renderCCHarvestStatus(); renderCcRules(); }
    if (name === 'sources') renderSourceLib();
    if (name === 'specs') renderSpecLibTab();
    if (name === 'lists') renderLists();
  };

  window.renderItems = function () {
    const tbody = document.getElementById('items-tbody');
    const filter = val('filter-action');
    const visible = filter ? items.filter(i => i.action === filter) : items;
    tbody.innerHTML = '';
    document.getElementById('items-empty').style.display = items.length ? 'none' : 'block';
    document.getElementById('items-table-wrap').style.display = items.length ? 'block' : 'none';
    visible.forEach(item => {
      const am = actionMeta[item.action] || actionMeta.approved;
      const specs = item.letterSpecs || item.specs || [];
      const flags = item.reviewFlags || [];
      const altHtml = item.altName
        ? `<div class="source-alt">${esc(item.altName)}${item.altLoc ? ' — ' + esc(item.altLoc) : ''}</div>` : '';
      const subHtml = (item.subItems || []).map(s => `<div style="font-size:11px;color:var(--text-mid);">• ${esc(s)}</div>`).join('');
      const flagHtml = flags.map(f => `<div class="review-flag">⚠ ${esc(f)}</div>`).join('');
      const tr = document.createElement('tr');
      if (flags.length) tr.classList.add('item-review');
      tr.innerHTML = `
        <td><div class="spec-multi">${specs.map(s => `<div class="spec-num">${esc(s)}</div>`).join('')}</div></td>
        <td><span style="font-weight:500;">${esc(item.desc || '')}</span>${subHtml ? `<div style="margin-top:3px;">${subHtml}</div>` : ''}</td>
        <td>
          <div class="source-primary">${esc(item.srcName || '')}${item.srcLoc ? ' — ' + esc(item.srcLoc) : ''}</div>
          ${altHtml}
        </td>
        <td>
          <span class="action-badge ${am.cls}"><span class="action-dot"></span>${am.label}</span>
          ${item.apl ? '<span class="apl-flag">APL</span>' : ''}
          ${item.actionNotes ? `<div class="action-notes">${esc(item.actionNotes).slice(0, 90)}${item.actionNotes.length > 90 ? '…' : ''}</div>` : ''}
          ${flagHtml}
          ${item.rule ? `<div class="rule-chip">${esc(item.rule)}</div>` : ''}
          <div style="display:flex;gap:4px;margin-top:6px;">
            <button class="btn btn-ghost btn-sm" onclick="editItem(${item.id})" style="font-size:11px;padding:3px 10px;">✎ Edit</button>
            <button class="btn btn-ghost btn-sm" onclick="deleteItem(${item.id})" style="font-size:11px;padding:3px 10px;color:var(--red);">✕</button>
          </div>
        </td>`;
      tbody.appendChild(tr);
    });
    document.getElementById('items-count').textContent = items.length;
  };

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  window.renderCC = function () {
    const tbody = document.getElementById('cc-tbody');
    tbody.innerHTML = ccList.map(cc => `
      <tr>
        <td style="font-weight:500;">${esc(cc.name)}</td>
        <td><span style="font-family:var(--mono);font-size:10px;background:var(--blue-bg);color:var(--deldot);border:1px solid #b0c4e0;border-radius:2px;padding:2px 5px;">${esc(cc.org)}</span></td>
        <td>
          <div style="display:flex;align-items:center;gap:4px;">
            <button class="btn btn-ghost btn-sm btn-icon" onclick="openCCModal('', '${esc(String(cc.id))}')" title="Edit name / org">✎</button>
            <button class="btn btn-ghost btn-sm btn-icon" onclick="deleteCC(${cc.id})" style="color:var(--red);" title="Remove from this letter">✕</button>
          </div>
        </td>
      </tr>`).join('');
    document.getElementById('cc-count').textContent = ccList.length;
    const activeEl = document.getElementById('cc-active-count');
    if (activeEl) activeEl.textContent = `(${ccList.length})`;
  };

  window.renderCCLib = function () {
    const q = (document.getElementById('cc-lib-search')?.value || '').toLowerCase();
    const tbody = document.getElementById('cc-lib-tbody');
    const activeNames = new Set(ccList.map(c => c.name.toLowerCase()));
    const filtered = SOSData.sortCcPeople(
      ccLib.filter(p => !q || p.name.toLowerCase().includes(q) || (p.org || '').toLowerCase().includes(q)),
      ccLibSortDir
    );
    tbody.innerHTML = filtered.map(p => {
      const onLetter = activeNames.has(p.name.toLowerCase());
      const idJs = JSON.stringify(p.id);
      return `<tr style="${onLetter ? 'opacity:.55;' : ''}">
        <td style="font-weight:500;">${esc(p.name)}</td>
        <td>${esc(p.org)}</td>
        <td>
          <div style="display:flex;align-items:center;gap:4px;flex-wrap:nowrap;">
            <button class="btn btn-ghost btn-sm btn-icon" onclick='openCCModal(${idJs})' title="Edit spelling / org">✎</button>
            ${onLetter ? '<span style="font-size:10px;color:var(--text-dim);">on letter</span>'
              : `<button class="btn btn-primary btn-sm" style="font-size:10px;padding:2px 8px;" onclick='addCCFromLib(${idJs})'>+ Add</button>`}
            <button class="btn btn-ghost btn-sm btn-icon" onclick='deleteCCFromLib(${idJs})' title="Remove from master list (retired)" style="color:var(--red);">✕</button>
          </div>
        </td>
      </tr>`;
    }).join('');
    document.getElementById('cc-lib-count').textContent = `(${filtered.length})`;
    const ind = document.getElementById('cc-lib-sort-ind');
    if (ind) ind.textContent = ccLibSortDir === 'desc' ? 'Z–A' : 'A–Z';
    const btn = document.getElementById('cc-lib-sort-btn');
    if (btn) btn.title = ccLibSortDir === 'desc' ? 'Sorted Z–A. Click for A–Z.' : 'Sorted A–Z. Click for Z–A.';
  };
  window.sortCCLib = function (dir) {
    if (dir === 'asc' || dir === 'desc') ccLibSortDir = dir;
    else ccLibSortDir = ccLibSortDir === 'asc' ? 'desc' : 'asc';
    ls_set(STORE.cc_lib, ccLib);
    renderCCLib();
  };
  window.addCCFromLib = function (libId) {
    const entry = ccLib.find(p => p.id === libId);
    if (!entry || ccList.find(c => c.name.toLowerCase() === entry.name.toLowerCase())) return;
    ccList.push({ id: Date.now(), name: entry.name, org: entry.org, role: entry.role || '' });
    persistAll(); renderCC(); renderCCLib(); renderLetter();
  };
  window.deleteCC = function (id) {
    ccList = ccList.filter(c => c.id !== id);
    persistAll(); renderCC(); renderCCLib(); renderLetter();
  };
  window.deleteCCFromLib = function (libId) {
    const person = ccLib.find(p => p.id === libId);
    if (!person) return;
    const key = ccNameKey(person.name);
    retireName(person.name);
    ccLib = ccLib.filter(p => p.id !== libId);
    persistCCLib();
    ccList = ccList.filter(c => ccNameKey(c.name) !== key);
    ccAssignments = ccAssignments.filter(a => ccNameKey(a.name) !== key);
    persistCcRules();
    if (liveLists.ccAlways && liveLists.ccAlways.length) {
      liveLists.ccAlways = liveLists.ccAlways.filter(p => ccNameKey(typeof p === 'string' ? p : p.name) !== key);
      persistLists();
    }
    persistAll();
    renderCCLib();
    renderCC();
    renderCcRules();
    renderLetter();
  };
  function setCcOrgSelect(org) {
    const sel = document.getElementById('cc-org');
    if (!sel) return;
    const v = org || 'DelDOT';
    if (![...sel.options].some(o => o.value === v || o.text === v)) {
      const opt = document.createElement('option');
      opt.value = v;
      opt.textContent = v;
      sel.appendChild(opt);
    }
    sel.value = v;
  }

  function applyCcNameChange(oldName, person) {
    const name = String(person.name || '').trim();
    if (!name) return;
    const org = person.org || 'DelDOT';
    const role = person.role || '';
    const oldKey = ccNameKey(oldName);
    const newKey = ccNameKey(name);
    unretireName(name);
    if (oldKey && oldKey !== newKey) retireName(oldName);
    let lib = (oldKey && ccLib.find(p => ccNameKey(p.name) === oldKey))
      || ccLib.find(p => ccNameKey(p.name) === newKey);
    if (lib) {
      lib.name = name;
      lib.org = org;
      lib.role = role;
    } else {
      ccLib.push({ id: 'cl' + Date.now(), name, org, role });
    }
    persistCCLib();
    ccList.forEach(c => {
      if (ccNameKey(c.name) === oldKey || ccNameKey(c.name) === newKey) {
        c.name = name;
        c.org = org;
        if (role) c.role = role;
      }
    });
    ccAssignments.forEach(a => {
      if (oldKey && ccNameKey(a.name) === oldKey) a.name = name;
    });
    persistCcRules();
    if (liveLists.ccAlways && liveLists.ccAlways.length) {
      liveLists.ccAlways = liveLists.ccAlways.map(p => {
        const n = typeof p === 'string' ? p : p.name;
        if (ccNameKey(n) !== oldKey) return p;
        return typeof p === 'string' ? name : Object.assign({}, p, { name, org });
      });
      persistLists();
    }
  }

  window.saveCC = function () {
    const name = val('cc-name').trim();
    if (!name) return;
    const org = val('cc-org') || 'DelDOT';
    const role = val('cc-role').trim();
    const libId = val('cc-edit-lib-id');
    const letterId = val('cc-edit-letter-id');
    const addToLetter = !!(document.getElementById('cc-add-to-letter') && document.getElementById('cc-add-to-letter').checked);
    let oldName = name;
    if (libId) {
      const p = ccLib.find(x => String(x.id) === String(libId));
      if (p) oldName = p.name;
    } else if (letterId) {
      const c = ccList.find(x => String(x.id) === String(letterId));
      if (c) oldName = c.name;
    }
    applyCcNameChange(oldName, { name, org, role });
    if (addToLetter) addPersonToLetter(name, org);
    closeModal('cc-modal');
    persistAll();
    renderCCLib();
    renderCC();
    renderCcRules();
    renderLetter();
  };

  window.renderRevisions = function () {
    const tl = document.getElementById('rev-timeline');
    if (!revisions.length) {
      tl.innerHTML = '<div class="empty-state"><div class="empty-label">No revisions yet — import a form to start REV 01</div></div>';
    } else {
      tl.innerHTML = [...revisions].reverse().map(rev => `
        <div class="rev-item">
          <div class="rev-num">REV ${String(rev.num).padStart(2, '0')}</div>
          <div class="rev-meta">
            <div class="rev-date">${esc(rev.date)}</div>
            <div class="rev-note">${esc(rev.notes)}</div>
            ${(rev.items || []).length ? `<div class="rev-changes">${rev.items.map(i => `<span class="rev-change-chip">${esc(i)}</span>`).join('')}</div>` : ''}
          </div>
        </div>`).join('');
    }
    document.getElementById('rev-count').textContent = revisions.length;
    document.getElementById('rev-display').textContent = 'REV ' + String(currentRev).padStart(2, '0');
  };
  window.saveRevision = function () {
    const notes = val('rev-notes').trim();
    const itemsStr = val('rev-items').trim();
    currentRev++;
    revisions.push({
      num: currentRev,
      date: headerToday(),
      notes: notes || 'No notes.',
      items: itemsStr ? itemsStr.split(',').map(s => s.trim()) : [],
    });
    persistAll();
    closeModal('rev-modal');
    renderRevisions();
  };

  function actionHtml(item) {
    const notes = (item.actionNotes || '').split('\n').filter(Boolean);
    const first = notes[0] || '';
    const rest = notes.slice(1);
    let html = '';
    if (item.action === 'test') html += `<span class="letter-highlight" style="background:#ffff80;">${esc(first || 'Must be tested and approved prior to use.')}</span>`;
    else if (item.action === 'not-approved') html += `<strong>${esc(first || 'Not approved.')}</strong>`;
    else html += esc(first);
    rest.forEach(line => { html += '<br>' + esc(line); });
    return html;
  }

  function letterEditAttr(kind) {
    return `contenteditable="true" spellcheck="true" class="letter-edit" data-edit="${kind}"`;
  }

  function persistLetterHtml() {
    const doc = document.getElementById('letter-doc');
    if (!doc) return;
    ls_set(STORE.letter, { dirty: !!letterPreviewDirty, html: letterPreviewDirty ? doc.innerHTML : '' });
  }

  function clearLetterEdits() {
    letterPreviewDirty = false;
    ls_set(STORE.letter, { dirty: false, html: '' });
    updateLetterEditBanner();
  }

  function markLetterDirty() {
    letterPreviewDirty = true;
    persistLetterHtml();
    updateLetterEditBanner();
  }

  function updateLetterEditBanner() {
    const el = document.getElementById('letter-edit-banner');
    if (!el) return;
    el.hidden = !letterPreviewDirty;
  }

  function setLetterEditable(on) {
    document.querySelectorAll('#letter-doc [data-edit]').forEach((el) => {
      el.setAttribute('contenteditable', on ? 'true' : 'false');
    });
  }

  function itemByEditId(id) {
    const want = String(id);
    return items.find((i) => String(i.id) === want);
  }

  function applyLetterFieldEdit(el) {
    const kind = el.getAttribute('data-edit');
    const id = el.getAttribute('data-item-id');
    const text = (el.innerText || '').replace(/\u00a0/g, ' ').replace(/\r/g, '').replace(/\n{3,}/g, '\n\n').trim();
    if (kind === 'source') {
      const item = itemByEditId(id);
      if (!item || !SOSEngine.parseSourceLineText) return;
      const parsed = SOSEngine.parseSourceLineText(text);
      if (parsed.srcName) {
        item.srcName = parsed.srcName;
        item.srcLoc = parsed.srcLoc;
        item.mfgName = parsed.srcName;
        item.mfgLoc = parsed.srcLoc;
      }
      item.altName = parsed.altName;
      item.altLoc = parsed.altLoc;
      if (parsed.altName) item.altMfgName = parsed.altName;
      persistAll();
      renderItems();
    } else if (kind === 'action') {
      const item = itemByEditId(id);
      if (!item) return;
      item.actionNotes = text;
      persistAll();
      renderItems();
    } else if (kind === 'to') {
      const lines = text.split('\n').map((s) => s.trim()).filter(Boolean);
      if (lines[0] && lines[0] !== '[Contractor]') {
        setVal('ph-contractor', lines[0]);
        setVal('ph-contractor-addr', lines.slice(1).join('\n'));
        persistProject();
      }
    } else if (kind === 'questions') {
      const m = text.match(/call me at\s+(.+)$/i);
      if (m) {
        setVal('ph-author-phone', m[1].trim());
        persistAuthor();
      }
    }
  }

  function wireLetterEditing() {
    const doc = document.getElementById('letter-doc');
    if (!doc) return;
    if (doc.dataset.editWired !== '1') {
      doc.dataset.editWired = '1';
      doc.addEventListener('input', (e) => {
        const t = e.target && e.target.closest && e.target.closest('[data-edit]');
        if (!t) return;
        markLetterDirty();
      });
      doc.addEventListener('focusout', (e) => {
        const t = e.target && e.target.closest && e.target.closest('[data-edit]');
        if (!t) return;
        applyLetterFieldEdit(t);
      });
      doc.addEventListener('paste', (e) => {
        const t = e.target && e.target.closest && e.target.closest('[data-edit]');
        if (!t) return;
        e.preventDefault();
        const paste = (e.clipboardData || window.clipboardData).getData('text/plain');
        document.execCommand('insertText', false, paste);
      });
      doc.addEventListener('dragover', (e) => { e.preventDefault(); });
      doc.addEventListener('drop', (e) => { e.preventDefault(); });
    }
    setLetterEditable(!highlightMode);
  }

  function loadLetterEdits() {
    const saved = ls_get(STORE.letter, null);
    if (!saved || !saved.dirty || !saved.html) return;
    const doc = document.getElementById('letter-doc');
    if (!doc) return;
    letterPreviewDirty = true;
    doc.innerHTML = saved.html;
    wireLetterEditing();
    updateLetterEditBanner();
  }

  window.renderLetter = function (force) {
    const rebuild = force === true || (force && force.force);
    if (letterPreviewDirty && !rebuild) {
      updateLetterEditBanner();
      return;
    }
    if (rebuild) letterPreviewDirty = false;
    const contract = val('ph-contract');
    const title = (val('ph-title') || '').toUpperCase();
    const contractor = val('ph-contractor');
    const contrAddr = (val('ph-contractor-addr') || '').trim();
    const dateStr = SOSEngine.formatLongDate(val('ph-date'));
    if (!signedAt) {
      signedAt = new Date().toISOString();
      persistProject();
    }
    const author = currentAuthor();
    const digitalLines = (SOSEngine.digitalSignatureLines
      ? SOSEngine.digitalSignatureLines(signedAt, author.name)
      : ['Digitally signed by', author.name]).map(esc).join('<br>');
    const sigImg = signatureImage
      ? `<img class="letter-sig-img" src="${signatureImage}" alt="signature" contenteditable="false">`
      : '';
    const addrHtml = contrAddr
      ? contrAddr.split('\n').map(l => esc(l.trim())).filter(Boolean).join('<br>')
      : '<em style="color:#aaa;">[Contractor address — click ✎]</em>';
    const phrase = SOSEngine.contractPhrase({
      contract: contract || '[NUMBER]',
      title,
      docKind: val('ph-dockind'),
    });

    const sections = SOSLetterExport.letterItemsHtml(items, {
      esc,
      letterSectionLines: SOSEngine.letterSectionLines,
      sourceLine: SOSEngine.sourceLine,
      actionHtml,
    });

    const ccHtml = ccList.map(cc => `${esc(cc.name)}, ${esc(cc.org)}`).join('<br>');
    const empty = !items.length
      ? '<p style="color:#888;font-style:italic;">Drop a contractor SOS spreadsheet or form PDF on the Import tab to generate this letter.</p>' : '';

    const headerSrc = new URL('sos/letterhead-header.jpg', window.location.href).href;
    const footerSrc = new URL('sos/letterhead-footer.png', window.location.href).href;
    const inner = `
      <div class="letter-letterhead" contenteditable="false">
        <img src="${headerSrc}" alt="State of Delaware Department of Transportation">
        <div class="letter-secretary">${esc(SOSData.CONTACTS.secretary)}<br>Secretary</div>
      </div>
      <div class="letter-date" ${letterEditAttr('date')}>${esc(dateStr)}</div>
      <div class="letter-to" ${letterEditAttr('to')}>${esc(contractor || '[Contractor]')}<br>${addrHtml}</div>
      <div class="letter-body">
        <p ${letterEditAttr('intro')}>The following material sources have been reviewed by this office for <strong>${esc(phrase)}</strong> as to their acceptability for use on this project. Please note that all materials must conform to the Standard Specifications, and Special Provisions, and/or Plans governing this project. The following action must be taken in order that we may expedite the inspection and approval of the material.</p>
      </div>
      ${empty}${sections}
      <div class="letter-closing">
      <hr class="letter-divider">
      <div class="letter-questions" ${letterEditAttr('questions')}>If you have any questions, please call me at ${esc(author.phone)}.</div>
      <div class="letter-sig${signatureImage ? ' has-image' : ''}">
        Sincerely,
        <div class="letter-sig-row">
          ${sigImg}
          <div class="letter-sig-digital">${digitalLines}</div>
        </div>
        <div class="letter-sig-name">${esc(author.name)}<br>${esc(author.title)}</div>
      </div>
      <div class="letter-cc" ${letterEditAttr('cc')}>cc: ${ccHtml || '<em style="color:#aaa;">(none)</em>'}</div>
      </div>
    `;
    const wrap = window.SOSLetterExport && SOSLetterExport.wrapLetterPages;
    const doc = document.getElementById('letter-doc');
    doc.innerHTML = wrap
      ? wrap(inner, footerSrc)
      : inner + `<div class="letter-official-footer"><img src="${footerSrc}" alt="DelDOT"></div>`;
    wireLetterEditing();
    updateLetterEditBanner();
    persistLetterHtml();
  };
  window.refreshLetter = function () {
    persistProject();
    clearLetterEdits();
    if (typeof applyListsToOpenLetter === 'function' && items.length) applyListsToOpenLetter();
    else renderLetter(true);
  };

  window.renderWarnings = function () {
    const box = document.getElementById('warn-box');
    const contractFilled = !!val('ph-contract').trim();
    const list = [...warnings].filter(w => {
      if (!contractFilled) return true;
      return !/blank on the form|application \/ contract number is blank/i.test(w);
    });
    if (!contractFilled && items.length && !list.some(w => /blank/i.test(w))) {
      list.unshift('Application / contract number is blank — required on the issued letter.');
    }
    if (!list.length) { box.style.display = 'none'; box.innerHTML = ''; return; }
    box.style.display = 'block';
    box.innerHTML = `<div class="warn-banner"><strong>REVIEW</strong><div style="margin-top:4px;">${list.map(w => '• ' + esc(w)).join('<br>')}</div></div>`;
  };

  window.openModal = function (id) { document.getElementById(id).classList.add('open'); };
  window.closeModal = function (id) { document.getElementById(id).classList.remove('open'); };
  window.openContractorModal = function () {
    const addr = val('ph-contractor-addr');
    const parts = addr.split('\n');
    setVal('cm-name', val('ph-contractor'));
    setVal('cm-street', parts[0] || '');
    setVal('cm-citystatezip', parts.slice(1).join(', ') || '');
    openModal('contractor-modal');
  };
  window.saveContractorModal = function () {
    const name = val('cm-name').trim();
    const addr = [val('cm-street').trim(), val('cm-citystatezip').trim()].filter(Boolean).join('\n');
    if (!name) { alert('Company name required.'); return; }
    setVal('ph-contractor', name);
    setVal('ph-contractor-addr', addr);
    persistProject(); renderLetter(true); closeModal('contractor-modal');
  };
  window.openAddModal = function () {
    editingItemId = null;
    specTags = []; subItemTags = [];
    renderSpecTags(); renderSubItemTags();
    ['f-desc', 'f-src-name', 'f-src-loc', 'f-src-addr', 'f-src-phone', 'f-alt-name', 'f-alt-loc', 'f-alt-addr', 'f-action-notes', 'f-test-date'].forEach(id => setVal(id, ''));
    setVal('f-action', 'approved');
    document.getElementById('f-apl').checked = false;
    document.getElementById('f-one-source').checked = false;
    document.getElementById('f-on-file').checked = false;
    fillActionNotePresets();
    fillActionNotesForType('approved', { force: true });
    openModal('add-modal');
  };

  function fillActionNotePresets() {
    const sel = document.getElementById('f-action-note-preset');
    if (!sel) return;
    const current = val('f-action-notes');
    const presets = SOSData.actionNotePresets(val('ph-district'), listsForEngine());
    sel.innerHTML = '<option value="">Choose a stock note…</option>' + presets.map(p =>
      `<option value="${esc(p.id)}">${esc(p.label)}</option>`
    ).join('');
    const match = presets.find(p => p.notes.trim() === String(current || '').trim());
    sel.value = match ? match.id : '';
  }

  function notesAreStock(text) {
    const t = String(text || '').trim();
    if (!t) return true;
    return SOSData.actionNotePresets(val('ph-district'), listsForEngine()).some(p => p.notes.trim() === t)
      || Object.values(SOSData.ACTION_TEXT).some(s => String(s).trim() === t);
  }

  function fillActionNotesForType(action, opts) {
    const notes = SOSData.stockNotesForAction(action, val('ph-district'), listsForEngine());
    const el = document.getElementById('f-action-notes');
    if (!el) return;
    const force = !!(opts && opts.force);
    if (!force && !notesAreStock(el.value)) return;
    el.value = notes;
    if (action === 'apl') document.getElementById('f-apl').checked = true;
    if (action === 'on-file') document.getElementById('f-on-file').checked = true;
    fillActionNotePresets();
  }

  window.onItemActionTypeChange = function () {
    fillActionNotesForType(val('f-action'), { force: editingItemId == null || notesAreStock(val('f-action-notes')) });
  };

  window.applyActionNotePreset = function (id) {
    if (!id) return;
    const preset = SOSData.actionNotePresets(val('ph-district'), listsForEngine()).find(p => p.id === id);
    if (!preset) return;
    setVal('f-action-notes', preset.notes);
    if (preset.action) setVal('f-action', preset.action);
    if (preset.action === 'apl') document.getElementById('f-apl').checked = true;
    if (preset.action === 'on-file') document.getElementById('f-on-file').checked = true;
  };
  window.openCCModal = function (libId, letterId) {
    setVal('cc-edit-lib-id', libId || '');
    setVal('cc-edit-letter-id', letterId != null && letterId !== '' ? String(letterId) : '');
    setVal('cc-name', '');
    setVal('cc-role', '');
    setCcOrgSelect('DelDOT');
    const addBox = document.getElementById('cc-add-to-letter');
    const title = document.getElementById('cc-modal-title');
    if (libId) {
      const p = ccLib.find(x => String(x.id) === String(libId));
      if (p) {
        setVal('cc-name', p.name);
        setCcOrgSelect(p.org || 'DelDOT');
        setVal('cc-role', p.role || '');
      }
      if (title) title.textContent = 'Edit library person';
      if (addBox) addBox.checked = !!(p && ccList.some(c => ccNameKey(c.name) === ccNameKey(p.name)));
    } else if (letterId != null && letterId !== '') {
      const c = ccList.find(x => String(x.id) === String(letterId));
      if (c) {
        setVal('cc-name', c.name);
        setCcOrgSelect(c.org || 'DelDOT');
        setVal('cc-role', c.role || '');
      }
      if (title) title.textContent = 'Edit name on this letter';
      if (addBox) addBox.checked = true;
    } else {
      if (title) title.textContent = 'Add CC person';
      if (addBox) addBox.checked = true;
    }
    openModal('cc-modal');
  };
  window.openRevModal = function () { setVal('rev-notes', ''); setVal('rev-items', ''); openModal('rev-modal'); };

  window.renderSpecTags = function () {
    const container = document.getElementById('spec-tags-container');
    const input = document.getElementById('spec-tag-input');
    container.querySelectorAll('.spec-tag').forEach(e => e.remove());
    specTags.forEach((tag, i) => {
      const span = document.createElement('span');
      span.className = 'spec-tag';
      span.innerHTML = `${esc(tag)} <span class="spec-tag-x" onclick="removeSpecTag(${i})">×</span>`;
      container.insertBefore(span, input);
    });
  };
  window.removeSpecTag = function (i) { specTags.splice(i, 1); renderSpecTags(); };
  window.handleSpecTagInput = function (e) {
    const input = e.target;
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      let v = input.value.trim().replace(/,$/, '');
      if (v) {
        if (!v.startsWith('#')) v = '#' + v;
        v = v.toUpperCase();
        if (!specTags.includes(v)) specTags.push(v);
        input.value = '';
        renderSpecTags();
        document.getElementById('spec-dd').classList.remove('open');
      }
    }
    if (e.key === 'Backspace' && input.value === '' && specTags.length) { specTags.pop(); renderSpecTags(); }
  };
  window.specDropdownSearch = function (q) {
    const dd = document.getElementById('spec-dd');
    q = (q || '').trim().toLowerCase().replace(/^#/, '');
    if (!q) { dd.classList.remove('open'); dd.innerHTML = ''; return; }
    const seen = new Set();
    const matches = specLib.filter((s) => {
      const num = String(s.num || '').toUpperCase();
      if (seen.has(num)) return false;
      const label = specPickerDesc(s);
      const hit = num.replace('#', '').toLowerCase().includes(q) || label.toLowerCase().includes(q);
      if (!hit) return false;
      seen.add(num);
      return true;
    }).slice(0, 12);
    if (!matches.length) { dd.classList.remove('open'); return; }
    dd.innerHTML = matches.map(s => {
      const label = specPickerDesc(s);
      return `<div class="spec-dd-option" onmousedown="specDdSelect(event,'${s.num.replace(/'/g, "\\'")}')"><span class="spec-dd-num">${esc(s.num)}</span><span class="spec-dd-desc">${esc(label)}</span></div>`;
    }).join('');
    dd.classList.add('open');
  };
  window.specDdSelect = function (e, num) {
    e.preventDefault();
    if (!specTags.includes(num)) specTags.push(num);
    const entry = specLib.find(s => s.num === num);
    const label = specPickerDesc(entry);
    if (label && !val('f-desc')) setVal('f-desc', label);
    document.getElementById('spec-tag-input').value = '';
    document.getElementById('spec-dd').classList.remove('open');
    renderSpecTags();
  };

  window.renderSubItemTags = function () {
    const container = document.getElementById('subitem-tags-container');
    const input = document.getElementById('subitem-tag-input');
    container.querySelectorAll('.spec-tag').forEach(e => e.remove());
    subItemTags.forEach((tag, i) => {
      const span = document.createElement('span');
      span.className = 'spec-tag';
      span.style.background = 'var(--green-bg)';
      span.innerHTML = `${esc(tag)} <span class="spec-tag-x" onclick="removeSubItemTag(${i})">×</span>`;
      container.insertBefore(span, input);
    });
  };
  window.removeSubItemTag = function (i) { subItemTags.splice(i, 1); renderSubItemTags(); };
  window.handleSubItemInput = function (e) {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      const v = e.target.value.trim().replace(/,$/, '');
      if (v) { subItemTags.push(v); e.target.value = ''; renderSubItemTags(); }
    }
  };

  window.srcAutocomplete = function (which, q) {
    const dd = document.getElementById(which === 'primary' ? 'src-dd-primary' : 'src-dd-alt');
    q = (q || '').trim().toLowerCase();
    srcFocusIdx[which] = -1;
    if (!q) { dd.classList.remove('open'); return; }
    const matches = sourceLib.filter(s =>
      s.name.toLowerCase().includes(q) || (s.loc || '').toLowerCase().includes(q) || (s.tags || []).some(t => t.toLowerCase().includes(q))
    ).slice(0, 8);
    dd.innerHTML = matches.map(s =>
      `<div class="src-option" onmousedown="srcSelect(event,'${which}','${s.id}')">
        <div class="src-option-name">${esc(s.name)}</div>
        <div class="src-option-detail">${esc(s.loc || '')}${s.addr ? ' · ' + esc(s.addr) : ''}</div>
      </div>`
    ).join('') || '<div style="padding:8px 10px;font-size:11px;color:var(--text-dim);">No matches</div>';
    dd.classList.add('open');
  };
  window.srcSelect = function (e, which, id) {
    e.preventDefault();
    const s = sourceLib.find(x => x.id === id);
    if (!s) return;
    document.getElementById(which === 'primary' ? 'src-dd-primary' : 'src-dd-alt').classList.remove('open');
    if (which === 'primary') {
      setVal('f-src-name', s.name); setVal('f-src-loc', s.loc || ''); setVal('f-src-addr', s.addr || ''); setVal('f-src-phone', s.phone || '');
    } else {
      setVal('f-alt-name', s.name); setVal('f-alt-loc', s.loc || ''); setVal('f-alt-addr', s.addr || '');
    }
  };
  window.srcKeyNav = function () {};

  window.saveItem = function () {
    const pending = val('spec-tag-input').trim();
    if (pending) {
      specTags.push(pending.startsWith('#') ? pending.toUpperCase() : '#' + pending.toUpperCase());
      setVal('spec-tag-input', '');
    }
    const subPend = val('subitem-tag-input').trim();
    if (subPend) subItemTags.push(subPend);
    if (!specTags.length) { alert('Add at least one spec number.'); return; }
    const newItem = {
      id: editingItemId || Date.now(),
      specs: [...specTags],
      letterSpecs: [...specTags],
      desc: SOSData.cleanSpecLibraryDesc(val('f-desc'), val('f-src-name') ? [val('f-src-name')] : []) || val('f-desc'),
      subItems: [...subItemTags],
      srcName: val('f-src-name'),
      srcLoc: val('f-src-loc'),
      srcAddr: val('f-src-addr'),
      srcPhone: val('f-src-phone'),
      altName: val('f-alt-name'),
      altLoc: val('f-alt-loc'),
      altAddr: val('f-alt-addr'),
      action: val('f-action'),
      actionNotes: val('f-action-notes'),
      apl: document.getElementById('f-apl').checked,
      oneSource: document.getElementById('f-one-source').checked,
      onFile: document.getElementById('f-on-file').checked,
      testDate: val('f-test-date'),
      family: SOSEngine.familyFromSpec(specTags[0], val('f-desc'), subItemTags.join(' ')),
    };
    autoSaveSource(newItem.srcName, newItem.srcLoc, newItem.srcAddr, newItem.srcPhone);
    newItem.specs.forEach(n => autoSaveSpec(n, newItem.desc, newItem.srcName, newItem.srcLoc, newItem.srcAddr, newItem.srcPhone));
    if (editingItemId != null) {
      const idx = items.findIndex(i => i.id === editingItemId);
      if (idx >= 0) items[idx] = newItem;
      editingItemId = null;
    } else items.push(newItem);
    persistAll();
    closeModal('add-modal');
    renderItems(); renderLetter(true); renderSourceLib();
  };
  window.editItem = function (id) {
    const item = items.find(i => i.id === id);
    if (!item) return;
    editingItemId = id;
    specTags = [...(item.letterSpecs || item.specs || [])];
    subItemTags = [...(item.subItems || [])];
    renderSpecTags(); renderSubItemTags();
    setVal('f-desc', item.desc || '');
    setVal('f-src-name', item.srcName || '');
    setVal('f-src-loc', item.srcLoc || '');
    setVal('f-src-addr', item.srcAddr || '');
    setVal('f-src-phone', item.srcPhone || '');
    setVal('f-alt-name', item.altName || '');
    setVal('f-alt-loc', item.altLoc || '');
    setVal('f-alt-addr', item.altAddr || '');
    setVal('f-action', item.action || 'approved');
    setVal('f-action-notes', item.actionNotes || '');
    setVal('f-test-date', item.testDate || '');
    document.getElementById('f-apl').checked = !!item.apl;
    document.getElementById('f-one-source').checked = !!item.oneSource;
    document.getElementById('f-on-file').checked = !!item.onFile;
    fillActionNotePresets();
    openModal('add-modal');
  };
  window.deleteItem = function (id) {
    if (!confirm('Remove this item?')) return;
    items = items.filter(i => i.id !== id);
    persistAll(); renderItems(); renderLetter(true);
  };
  window.clearAllItems = function () {
    newLetter();
  };

  window.newLetter = function (opts) {
    const silent = !!(opts && opts.silent);
    if (!silent && jobIsDirty() && !confirm('Start a new letter? This clears the current job (header, items, CC on this letter, revisions). The name library, APL, and chart stay.')) {
      return false;
    }
    resetCurrentJob();
    switchTab('import', document.querySelector('.tab[data-tab="import"]'));
    return true;
  };

  function jobIsDirty() {
    return items.length > 0
      || ccList.length > 0
      || !!(val('ph-contract') || val('ph-title') || val('ph-contractor'));
  }

  function resetCurrentJob() {
    items = [];
    ccList = [];
    warnings = [];
    revisions = [];
    currentRev = 1;
    parsedImport = null;
    lastSubmittal = null;
    setVal('ph-contract', '');
    setVal('ph-title', '');
    setVal('ph-contractor', '');
    setVal('ph-contractor-addr', '');
    setVal('ph-contact', '');
    setVal('ph-dockind', 'application');
    setVal('ph-date', headerToday());
    signedAt = new Date().toISOString();
    const rev = document.getElementById('rev-display');
    if (rev) rev.textContent = 'REV 01';
    const preview = document.getElementById('import-preview-block');
    if (preview) preview.style.display = 'none';
    const drop = document.getElementById('drop-label');
    if (drop) drop.textContent = 'Drop DelDOT SOS spreadsheet here';
    const file = document.getElementById('file-input');
    if (file) file.value = '';
    const status = document.getElementById('import-status');
    if (status) status.style.display = 'none';
    persistAll();
    updateContractWarn();
    refreshSpecYearFromContract();
    clearLetterEdits();
    renderItems();
    renderCC();
    renderCCLib();
    renderRevisions();
    renderLetter(true);
    renderWarnings();
  }

  window.renderSourceLib = function () {
    const tbody = document.getElementById('lib-tbody');
    const q = (document.getElementById('lib-search')?.value || '').toLowerCase();
    const filtered = q
      ? sourceLib.filter(s => s.name.toLowerCase().includes(q) || (s.loc || '').toLowerCase().includes(q) || (s.tags || []).some(t => t.toLowerCase().includes(q)))
      : sourceLib;
    const shown = filtered.slice(0, LIB_TABLE_CAP);
    const extra = (filtered.length > LIB_TABLE_CAP)
      ? `<tr><td colspan="6" style="font-size:11px;color:var(--text-mid);padding:10px;">Showing ${LIB_TABLE_CAP} of ${filtered.length} sources. Type more of the name to narrow it down.</td></tr>`
      : '';
    tbody.innerHTML = shown.map(s => `
      <tr>
        <td style="font-weight:500;">${esc(s.name)}</td>
        <td>${esc(s.loc || '')}</td>
        <td>${esc(s.addr || '')}</td>
        <td style="font-family:var(--mono);font-size:11px;">${esc(s.phone || '')}</td>
        <td>${(s.tags || []).map(t => `<span class="lib-tag">${esc(t)}</span>`).join('')}</td>
        <td><button class="btn btn-ghost btn-sm" onclick="openSourceModal('${s.id}')">✎</button></td>
      </tr>`).join('') + extra;
    saveSourceLib();
  };
  window.openSourceModal = function (editId, prefillName, callback) {
    setVal('sl-edit-id', editId || '');
    slActiveTags = [];
    _srcModalCallback = callback || null;
    ['sl-name', 'sl-loc', 'sl-addr', 'sl-phone', 'sl-contact'].forEach(id => setVal(id, ''));
    if (editId) {
      const s = sourceLib.find(x => x.id === editId);
      if (s) {
        setVal('sl-name', s.name); setVal('sl-loc', s.loc || ''); setVal('sl-addr', s.addr || '');
        setVal('sl-phone', s.phone || ''); setVal('sl-contact', s.contact || '');
        slActiveTags = [...(s.tags || [])];
      }
    } else if (prefillName) setVal('sl-name', prefillName);
    renderSlPresetTags(); renderSlActiveTags();
    openModal('source-modal');
  };
  function renderSlPresetTags() {
    document.getElementById('sl-tag-preset').innerHTML = SOSData.PRESET_TAGS.map(t => {
      const active = slActiveTags.includes(t);
      return `<button class="btn btn-sm" style="font-size:10px;font-family:var(--mono);padding:3px 8px;${active ? 'background:var(--deldot);color:white;' : 'background:var(--surface2);border:1px solid var(--border);'}" onclick="togglePresetTag('${t}')">${t}</button>`;
    }).join('');
  }
  window.togglePresetTag = function (tag) {
    const i = slActiveTags.indexOf(tag);
    if (i >= 0) slActiveTags.splice(i, 1); else slActiveTags.push(tag);
    renderSlPresetTags(); renderSlActiveTags();
  };
  window.addCustomTag = function () {
    const v = val('sl-tag-input').trim();
    if (v && !slActiveTags.includes(v)) slActiveTags.push(v);
    setVal('sl-tag-input', '');
    renderSlActiveTags();
  };
  function renderSlActiveTags() {
    document.getElementById('sl-tags-active').innerHTML = slActiveTags.map((t, i) =>
      `<span class="lib-tag">${esc(t)} <span class="lib-tag-x" onclick="removeSlTag(${i})">×</span></span>`
    ).join('') || '<span style="font-size:11px;color:var(--text-dim);">No tags</span>';
  }
  window.removeSlTag = function (i) { slActiveTags.splice(i, 1); renderSlActiveTags(); renderSlPresetTags(); };
  window.saveSource = function () {
    const name = val('sl-name').trim();
    if (!name) return;
    const entry = { id: val('sl-edit-id') || ('s' + Date.now()), name, loc: val('sl-loc'), addr: val('sl-addr'), phone: val('sl-phone'), contact: val('sl-contact'), tags: [...slActiveTags] };
    const idx = sourceLib.findIndex(s => s.id === entry.id);
    if (idx >= 0) sourceLib[idx] = entry; else sourceLib.push(entry);
    saveSourceLib(); closeModal('source-modal'); renderSourceLib();
  };

  window.renderSpecLibTab = function () {
    const tbody = document.getElementById('spec-lib-tbody');
    const q = (document.getElementById('spec-lib-search')?.value || '').toLowerCase();
    const filtered = (q ? specLib.filter(s => s.num.toLowerCase().includes(q) || (s.desc || '').toLowerCase().includes(q)) : [...specLib])
      .sort((a, b) => a.num.localeCompare(b.num));
    const shown = filtered.slice(0, LIB_TABLE_CAP);
    const extra = (filtered.length > LIB_TABLE_CAP)
      ? `<tr><td colspan="4" style="font-size:11px;color:var(--text-mid);padding:10px;">Showing ${LIB_TABLE_CAP} of ${filtered.length} specs. Type a spec number to find the rest.</td></tr>`
      : '';
    tbody.innerHTML = shown.map(s => `
      <tr>
        <td><span style="font-family:var(--mono);font-weight:700;color:var(--deldot);">${esc(s.num)}</span></td>
        <td>${esc(specPickerDesc(s) || s.desc || '')}</td>
        <td>${esc(s.lastSrcName || '—')}</td>
        <td><button class="btn btn-ghost btn-sm" onclick="openSpecLibModal('${s.num.replace(/'/g, "\\'")}')">✎</button></td>
      </tr>`).join('') + extra;
    document.getElementById('specs-count').textContent = specLib.length;
    const lab = document.getElementById('spec-lib-count-label');
    if (lab) lab.textContent = shown.length + ' of ' + specLib.length + ' specs';
  };
  window.openSpecLibModal = function (num) {
    setVal('sl-spec-edit-id', num || '');
    setVal('sl-spec-num', ''); setVal('sl-spec-desc', ''); setVal('sl-spec-notes', '');
    if (num) {
      const e = specLib.find(s => s.num === num);
      if (e) { setVal('sl-spec-num', e.num); setVal('sl-spec-desc', e.desc || ''); setVal('sl-spec-notes', e.notes || ''); }
    }
    openModal('spec-lib-modal');
  };
  window.saveSpecLibEntry = function () {
    let num = val('sl-spec-num').trim().toUpperCase();
    if (!num) return;
    if (!num.startsWith('#')) num = '#' + num;
    const existing = specLib.find(s => s.num === num);
    if (existing) { existing.desc = SOSData.cleanSpecLibraryDesc(val('sl-spec-desc')) || val('sl-spec-desc'); existing.notes = val('sl-spec-notes'); }
    else specLib.push({ num, desc: SOSData.cleanSpecLibraryDesc(val('sl-spec-desc')) || val('sl-spec-desc'), notes: val('sl-spec-notes'), tags: [], lastSrcName: '', lastSrcLoc: '' });
    saveSpecLib(); closeModal('spec-lib-modal'); renderSpecLibTab();
  };

  function persistLists() {
    ls_set(STORE.lists, {
      aggregate: liveLists.aggregate || { entries: [] },
      sosDatabase: liveLists.sosDatabase && liveLists.sosDatabase.items
        ? { kind: 'sos-database', file: liveLists.sosDatabase.file || '', modified: liveLists.sosDatabase.modified || '', items: liveLists.sosDatabase.items }
        : undefined,
      fetchedAt: liveLists.fetchedAt || '',
      ccAlways: liveLists.ccAlways || [],
      language: liveLists.language || null,
    });
  }

  function looksLikeLanguageHarvest(obj) {
    return !!(obj && obj.kind === 'issued-language' && obj.bySpec && typeof obj.bySpec === 'object');
  }

  function looksLikeLibraryHarvest(obj) {
    return !!(obj && (obj.kind === 'issued-libraries' || obj.kind === 'issued-sources')
      && (Array.isArray(obj.sources) || Array.isArray(obj.specs)));
  }

  function ingestLibraryHarvest(bundle) {
    (bundle.sources || []).forEach(s => {
      autoSaveSource(s.name, s.loc, s.addr, s.phone, { tags: s.tags || [], silent: true });
    });
    (bundle.specs || []).forEach(s => {
      autoSaveSpec(s.num, s.desc, s.lastSrcName, s.lastSrcLoc, s.lastSrcAddr, s.lastSrcPhone, { silent: true });
    });
    saveSourceLib();
    saveSpecLib();
    renderSourceLib();
    renderSpecLibTab();
    const el = document.getElementById('lists-status') || document.getElementById('lib-harvest-status') || document.getElementById('spec-harvest-status');
    const msg = 'Loaded ' + (bundle.sources || []).length + ' sources and ' + (bundle.specs || []).length + ' specs from ' + (bundle.letters || 0) + ' issued letters. Saved in this browser.';
    ['lib-harvest-status', 'spec-harvest-status', 'lists-status'].forEach(id => {
      const n = document.getElementById(id);
      if (!n) return;
      n.style.display = 'block';
      n.className = 'ok-banner';
      n.textContent = msg;
    });
    if (el && el.id === 'lists-status') { /* already set */ }
  }

  function mergeLiveListsIntoLibraries() {
    const specByNum = new Set(specLib.map(s => String(s.num || '').toUpperCase()));
    let specAdded = 0;
    if (liveLists.sosDatabase && liveLists.sosDatabase.items) {
      Object.keys(liveLists.sosDatabase.items).forEach(num => {
        const rec = liveLists.sosDatabase.items[num];
        if (!rec || rec.na) return;
        const key = '#' + String(num).replace(/^#/, '');
        if (specByNum.has(key.toUpperCase())) return;
        autoSaveSpec(key, rec.desc || '', '', '', '', '', { silent: true });
        specAdded += 1;
      });
    }
    const srcKey = (n, loc) => String(n || '').toLowerCase() + '\0' + String(loc || '').toLowerCase();
    const haveSrc = new Set(sourceLib.map(s => srcKey(s.name, s.loc)));
    let srcAdded = 0;
    (liveLists.aggregate && liveLists.aggregate.entries || []).forEach(e => {
      if (!e.name) return;
      if (haveSrc.has(srcKey(e.name, e.loc))) return;
      const tags = e.material ? [e.material] : [];
      autoSaveSource(e.name, e.loc || '', '', '', { tags, silent: true });
      haveSrc.add(srcKey(e.name, e.loc));
      srcAdded += 1;
    });
    if (srcAdded) saveSourceLib();
    else updateSourceLibCounts();
    if (specAdded) saveSpecLib();
    else updateSpecLibCounts();
  }

  function ingestLanguageHarvest(language) {
    liveLists.language = language;
    persistLists();
    renderLists();
    applyListsToOpenLetter();
    const el = document.getElementById('lists-status');
    if (el) {
      const n = Object.keys((language && language.bySpec) || {}).length;
      el.style.display = 'block';
      el.className = 'ok-banner';
      el.textContent = 'Loaded issued-letter language for ' + n + ' spec numbers from ' + (language.letters || 0) + ' letters. Chart / APL still decide approved vs must-be-tested.';
    }
  }

  function looksLikeCcHarvest(obj) {
    if (!obj || typeof obj !== 'object') return false;
    if (obj.tack || obj.striping || obj.crack) return false;
    return Array.isArray(obj.always) || Array.isArray(obj.people);
  }

  function upsertCcLibPerson(name, org, opts) {
    const n = String(name || '').trim();
    if (!n) return null;
    if (!(opts && opts.force) && isRetiredName(n)) return null;
    const existing = ccLib.find(p => p.name.toLowerCase() === n.toLowerCase());
    if (existing) return existing;
    const entry = { id: 'cl' + Date.now() + '-' + ccLib.length, name: n, org: org || 'DelDOT', role: '' };
    ccLib.push(entry);
    persistCCLib();
    return entry;
  }

  function addPersonToLetter(name, org) {
    const n = String(name || '').trim();
    if (!n) return;
    if (ccList.find(c => c.name.toLowerCase() === n.toLowerCase())) return;
    ccList.push({ id: Date.now() + ccList.length, name: n, org: org || 'DelDOT', role: '' });
  }

  function ingestCcHarvest(harvest) {
    const always = harvest.always || [];
    const people = harvest.people && harvest.people.length ? harvest.people : always;
    people.forEach(p => {
      const name = typeof p === 'string' ? p : p.name;
      const org = (p && p.org) || 'DelDOT';
      upsertCcLibPerson(name, org);
    });
    liveLists.ccAlways = always.map(p => (
      typeof p === 'string' ? { name: p, org: 'DelDOT' } : { name: p.name, org: p.org || 'DelDOT' }
    )).filter(p => p.name && !isRetiredName(p.name));
    persistLists();
    renderCCLib();
    renderCCHarvestStatus(harvest);
    renderLists();
    applyListsToOpenLetter();
    if (parsedImport && parsedImport.cc) {
      ccList = parsedImport.cc;
      persistAll();
      renderCC();
      renderLetter();
    }
  }

  function renderCCHarvestStatus(harvest) {
    const el = document.getElementById('cc-harvest-status');
    if (!el) return;
    const always = (harvest && harvest.always) || liveLists.ccAlways || [];
    const letters = harvest && harvest.letters;
    if (!always.length && !letters) {
      el.textContent = 'Use + Add person to put someone in the library (and on this letter). ✎ fixes spelling — the old spelling is retired so SOS-cc.json will not put the typo back. ✕ on a library row removes a retired person from the master list.';
      return;
    }
    const names = always.map(p => typeof p === 'string' ? p : p.name).filter(Boolean);
    el.textContent = (letters ? ('Read from ' + letters + ' issued letters. ') : '') +
      'Library names: ' + (names.join(', ') || '(none)') + '. They are not auto-copied — assign materials above, or use + Harvested names.';
  }

  window.addStandardCcToLetter = window.applyCcRulesToLetter;

  window.addHarvestedAlwaysToLetter = function () {
    (liveLists.ccAlways || []).forEach(p => {
      const name = typeof p === 'string' ? p : p.name;
      if (isRetiredName(name)) return;
      addPersonToLetter(name, (p && p.org) || 'DelDOT');
    });
    persistAll(); renderCC(); renderCCLib(); renderLetter();
  };

  window.handleCcFile = async function (file) {
    if (!file) return;
    try {
      const harvest = JSON.parse(await file.text());
      if (!looksLikeCcHarvest(harvest)) {
        const el = document.getElementById('cc-harvest-status');
        if (el) el.textContent = 'That JSON is not a SOS-cc.json harvest (needs an always or people list).';
        return;
      }
      ingestCcHarvest(harvest);
    } catch (e) {
      const el = document.getElementById('cc-harvest-status');
      if (el) el.textContent = 'Could not read CC file: ' + e.message;
    }
  };

  function ingestSosDatabase(db) {
    liveLists.sosDatabase = db;
    persistLists();
    mergeLiveListsIntoLibraries();
    renderLists();
    renderSpecLibTab();
    applyListsToOpenLetter();
  }

  function workbookToNamedSheets(wb) {
    return (wb.SheetNames || []).map(name => ({
      name,
      rows: XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, raw: true, defval: '' }),
    }));
  }

  function ingestAggregateGrid(grid, filename) {
    liveLists.aggregate = SOSLists.parseAggregateChartGrid(grid, { filename });
    persistLists();
    mergeLiveListsIntoLibraries();
    renderLists();
    renderSourceLib();
    applyListsToOpenLetter();
  }

  function applyListsToOpenLetter() {
    const parsed = (parsedImport && parsedImport.parsed && parsedImport.parsed.items && parsedImport.parsed.items.length)
      ? parsedImport.parsed
      : (items.length ? {
        project: {
          contract: val('ph-contract'),
          title: val('ph-title'),
          contractor: val('ph-contractor'),
          contractorAddr: val('ph-contractor-addr'),
          contact: val('ph-contact'),
          district: val('ph-district'),
          date: val('ph-date'),
          docKind: val('ph-dockind'),
        },
        items: items,
        warnings: [],
      } : null);
    if (!parsed) return;
    const result = SOSEngine.applyWorkflow(parsed, { lists: listsForEngine() });
    if (parsedImport && parsedImport.parsed) parsedImport = { parsed: parsedImport.parsed, ...result };
    items = (result.items || []).map((it, i) => ({ ...it, id: it.id || Date.now() + i }));
    warnings = result.warnings || [];
    persistAll();
    renderImportPreview();
    renderItems();
    renderLetter(true);
    renderWarnings();
  }

  window.handleListFile = async function (file) {
    if (!file) return;
    try {
      if (/\.json$/i.test(file.name)) {
        const text = await file.text();
        const bundle = JSON.parse(text);
        if (looksLikeCcHarvest(bundle)) {
          ingestCcHarvest(bundle);
          return;
        }
        if (looksLikeLanguageHarvest(bundle)) {
          ingestLanguageHarvest(bundle);
          return;
        }
        if (looksLikeLibraryHarvest(bundle)) {
          ingestLibraryHarvest(bundle);
          return;
        }
        liveLists = SOSLists.mergeBundle(liveLists, bundle);
        persistLists();
        renderLists();
        refreshSpecYearFromContract();
        applyListsToOpenLetter();
        return;
      }
      if (!/\.xlsx?$/i.test(file.name)) return;
      await loadXlsx();
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: 'array', cellDates: false });
      const sheets = workbookToNamedSheets(wb);
      if (SOSLists.looksLikeSosDatabase(file.name, sheets)) {
        ingestSosDatabase(SOSLists.parseSosDatabaseSheets(sheets, { filename: file.name }));
        return;
      }
      const grid = SOSEngine.workbookToGrid(wb);
      ingestAggregateGrid(grid, file.name);
    } catch (e) {
      console.error(e);
      const el = document.getElementById('lists-status');
      if (el) { el.style.display = 'block'; el.className = 'warn-banner'; el.textContent = 'Could not load list file: ' + e.message; }
    }
  };

  window.reloadAplSnapshot = async function () {
    await loadAplSnapshot();
    applyListsToOpenLetter();
    renderLists();
  };

  window.pullOfficeChart = async function () {
    const status = document.getElementById('lists-status');
    const setStatus = (msg, ok) => {
      if (!status) return;
      status.style.display = 'block';
      status.className = ok ? 'ok-banner' : 'warn-banner';
      status.textContent = msg;
    };
    setStatus('Pulling Approved Source List from the Geo Construction share…', true);
    const urls = ['/api/pull-chart', 'http://127.0.0.1:18765/api/pull-chart', 'http://localhost:18765/api/pull-chart'];
    let lastErr = '';
    for (const url of urls) {
      try {
        const res = await fetch(url, { cache: 'no-store' });
        if (!res.ok) {
          lastErr = url + ' HTTP ' + res.status;
          continue;
        }
        const body = await res.json();
        if (body && body.ok && body.aggregate && body.aggregate.entries && body.aggregate.entries.length) {
          liveLists.aggregate = body.aggregate;
          persistLists();
          applyListsToOpenLetter();
          renderLists();
          setStatus('Loaded ' + body.aggregate.entries.length + ' chart rows from ' + (body.path || 'Approved Source List.xlsx') + '. GABC / borrow / millings ACTIONS were refreshed.', true);
          return;
        }
        lastErr = (body && body.error) || 'Helper returned no chart rows.';
      } catch (e) {
        lastErr = e.message || String(e);
      }
    }
    setStatus(
      'Could not read the office share from this browser. Double-click start-sos.bat, leave that window open, then click Pull chart again. Or drop Approved Source List.xlsx here. Last error: ' + lastErr,
      false
    );
  };

  window.clearAggregateChart = function () {
    liveLists.aggregate = { kind: 'aggregate', file: '', entries: [] };
    persistLists();
    renderLists();
  };

  async function loadAplSnapshot() {
    try {
      const res = await fetch('sos/lists/apl-snapshot.json', { cache: 'no-store' });
      if (!res.ok) return;
      const bundle = await res.json();
      const saved = ls_get(STORE.lists, null);
      liveLists = SOSLists.mergeBundle(bundle, saved ? {
        aggregate: saved.aggregate,
        ccAlways: saved.ccAlways,
        sosDatabase: saved.sosDatabase,
        language: saved.language,
      } : {});
      if (bundle.fetchedAt) liveLists.fetchedAt = bundle.fetchedAt;
      if (!liveLists.sosDatabase || !liveLists.sosDatabase.items || !Object.keys(liveLists.sosDatabase.items).length) {
        await loadSosDatabaseSnapshot();
      }
      await loadAggregateSnapshot();
    } catch (e) {
      const saved = ls_get(STORE.lists, null);
      if (saved && saved.aggregate) liveLists.aggregate = saved.aggregate;
      if (saved && saved.ccAlways) liveLists.ccAlways = saved.ccAlways;
      if (saved && saved.sosDatabase) liveLists.sosDatabase = saved.sosDatabase;
      if (saved && saved.language) liveLists.language = saved.language;
      if (!liveLists.sosDatabase || !liveLists.sosDatabase.items || !Object.keys(liveLists.sosDatabase.items).length) {
        await loadSosDatabaseSnapshot();
      }
      await loadAggregateSnapshot();
    }
  }

  async function loadSosDatabaseSnapshot() {
    try {
      const res = await fetch('sos/lists/sos-database-snapshot.json', { cache: 'no-store' });
      if (!res.ok) return;
      const db = await res.json();
      if (db && db.items) liveLists.sosDatabase = db;
    } catch (e) {}
  }

  async function loadAggregateSnapshot() {
    try {
      const res = await fetch('sos/lists/aggregate-snapshot.json', { cache: 'no-store' });
      if (!res.ok) return;
      const chart = await res.json();
      if (chart && chart.entries && chart.entries.length) liveLists.aggregate = chart;
    } catch (e) {}
  }

  window.renderLists = function () {
    const tbody = document.getElementById('lists-tbody');
    const status = document.getElementById('lists-status');
    const links = document.getElementById('apl-link-list');
    if (!tbody) return;
    if (status) {
      status.style.display = 'block';
      status.className = 'ok-banner';
      status.textContent = SOSLists.summary(liveLists);
    }
    const rows = [
      ['Tack coat APL', liveLists.tack && liveLists.tack.modified, (liveLists.tack && liveLists.tack.entries || []).length],
      ['Pavement marking APL', liveLists.striping && liveLists.striping.modified, (liveLists.striping && (liveLists.striping.manufacturers || liveLists.striping.entries) || []).length],
      ['Crack seal APL', liveLists.crack && liveLists.crack.modified, (liveLists.crack && liveLists.crack.entries || []).length],
      ['Aggregate chart', liveLists.aggregate && liveLists.aggregate.file, (liveLists.aggregate && liveLists.aggregate.entries || []).length],
      ['SOS Database', liveLists.sosDatabase && liveLists.sosDatabase.modified, liveLists.sosDatabase && liveLists.sosDatabase.items ? Object.keys(liveLists.sosDatabase.items).length : 0],
      ['Awarded contracts / spec year', (function () {
        const cat = typeof SOSLists !== 'undefined' && SOSLists.specYearCatalog
          ? SOSLists.specYearCatalog(liveLists) : null;
        return cat && cat.awarded && cat.awarded.asOf;
      })(), (function () {
        const cat = typeof SOSLists !== 'undefined' && SOSLists.specYearCatalog
          ? SOSLists.specYearCatalog(liveLists) : null;
        return cat && cat.awarded && cat.awarded.contracts ? Object.keys(cat.awarded.contracts).length : 0;
      })()],
      ['Current book (jobs not on awarded list)', (function () {
        const book = typeof SOSLists !== 'undefined' && SOSLists.currentBookMeta
          ? SOSLists.currentBookMeta(liveLists) : null;
        return book ? book.bookName : '';
      })(), (function () {
        const book = typeof SOSLists !== 'undefined' && SOSLists.currentBookMeta
          ? SOSLists.currentBookMeta(liveLists) : null;
        return book ? book.catalogYear : 0;
      })()],
      ['CC harvest (library)', (liveLists.ccAlways || []).length ? 'library only' : '', (liveLists.ccAlways || []).length],
      ['Issued letter language', liveLists.language && liveLists.language.letters ? (liveLists.language.letters + ' letters') : '', liveLists.language && liveLists.language.bySpec ? Object.keys(liveLists.language.bySpec).length : 0],
    ];
    tbody.innerHTML = rows.map(r => `<tr><td>${esc(r[0])}</td><td>${esc(r[1] || '—')}</td><td>${esc(String(r[2]))}</td></tr>`).join('');
    const n = (liveLists.aggregate && liveLists.aggregate.entries || []).length + (liveLists.tack && liveLists.tack.entries || []).length;
    const count = document.getElementById('lists-count');
    if (count) count.textContent = n;
    if (links && !links.childElementCount && SOSLists.APL_PDFS) {
      links.innerHTML = Object.values(SOSLists.APL_PDFS).map(info =>
        `<a class="btn btn-ghost btn-sm" href="${esc(info.url)}" target="_blank" rel="noopener">${esc(info.label)}</a>`
      ).join('');
    }
  };

  function setImportStatus(msg, color) {
    const wrap = document.getElementById('import-status');
    const txt = document.getElementById('import-status-text');
    wrap.style.display = 'block';
    txt.className = color === 'green' ? 'ok-banner' : color === 'red' ? 'warn-banner' : 'warn-banner';
    if (color !== 'green' && color !== 'red') txt.style.background = 'var(--blue-bg)';
    txt.textContent = msg;
  }

  function commitImportResult(result, file, kindLabel) {
    parsedImport = result;
    const rows = (result.ungrouped && result.ungrouped.length) ? result.ungrouped.length : (result.parsed && result.parsed.items ? result.parsed.items.length : result.items.length);
    if (jobIsDirty() && !confirm('Replace the current letter with ' + file.name + '?\n\nThis clears the previous job. Click Cancel to keep it and only preview the new form.')) {
      warnings = result.warnings || [];
      setImportStatus('Parsed ' + result.items.length + ' items. Current letter was kept. Click Load into letter to replace it, or New letter to start blank.', 'blue');
      renderImportPreview();
      renderWarnings();
      return;
    }
    warnings = result.warnings || [];
    setImportStatus(`Parsed ${result.items.length} letter item${result.items.length === 1 ? '' : 's'} from ${rows} ${kindLabel} row${rows === 1 ? '' : 's'}. Loaded as a new letter.`, 'green');
    renderImportPreview();
    importAllParsed();
  }

  function loadCdnScript(src, globalName, loadingSlot, missingMsg, networkMsg) {
    if (window[globalName]) return Promise.resolve(window[globalName]);
    if (loadingSlot.get()) return loadingSlot.get();
    const pending = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = src;
      s.onload = function () {
        if (!window[globalName]) {
          loadingSlot.set(null);
          reject(new Error(missingMsg));
          return;
        }
        resolve(window[globalName]);
      };
      s.onerror = function () {
        loadingSlot.set(null);
        reject(new Error(networkMsg));
      };
      document.head.appendChild(s);
    });
    loadingSlot.set(pending);
    return pending;
  }

  function loadPdfJs() {
    return loadCdnScript(
      PDFJS_SRC,
      'pdfjsLib',
      { get: function () { return _pdfJsLoading; }, set: function (v) { _pdfJsLoading = v; } },
      'PDF reader loaded but pdfjsLib is missing.',
      'Could not load the PDF reader (needs network). Drop the .xls if you have it.'
    ).then(function (lib) {
      if (lib.GlobalWorkerOptions && !lib.GlobalWorkerOptions.workerSrc) {
        lib.GlobalWorkerOptions.workerSrc = PDFJS_WORKER_SRC;
      }
      return lib;
    });
  }

  function loadXlsx() {
    return loadCdnScript(
      XLSX_SRC,
      'XLSX',
      { get: function () { return _xlsxLoading; }, set: function (v) { _xlsxLoading = v; } },
      'Spreadsheet reader loaded but XLSX is missing.',
      'Could not load the spreadsheet reader (needs network). Drop the form PDF if you have it.'
    );
  }

  async function handleImportPdf(file) {
    const label = document.getElementById('drop-label');
    if (label) label.textContent = file.name;
    setImportStatus('Loading PDF reader…', 'blue');
    try {
      await loadPdfJs();
      if (typeof SosFormPdf === 'undefined') {
        setImportStatus('PDF importer is not loaded. Refresh the page.', 'red');
        return;
      }
      setImportStatus('Reading PDF…', 'blue');
      const buf = await file.arrayBuffer();
      const kept = copyFileBytes(buf);
      rememberSubmittal(file, kept);
      const parsed = await SosFormPdf.parsePdf(buf, { filename: file.name });
      if (parsed.kind === 'issued-letter') {
        setImportStatus('That PDF is an issued M&R letter. Drop the contractor SOS form (.xls, .xlsx, or the form PDF).', 'red');
        return;
      }
      if (parsed.kind !== 'contractor-form' || !(parsed.items || []).length) {
        setImportStatus(parsed.error || 'Could not read a Source of Supply form from this PDF. Scanned phone photos usually have no selectable text — drop the .xls if you have it.', 'red');
        return;
      }
      const grid = SosFormPdf.gridFromForm(parsed);
      const result = SOSEngine.processGrid(grid, { filename: file.name, lists: listsForEngine() });
      if (parsed.project) {
        const p = parsed.project;
        result.project = Object.assign({}, result.project, {
          contract: p.contract || result.project.contract,
          title: p.title || result.project.title,
          contractor: p.contractor || result.project.contractor,
          contractorAddr: p.contractorAddr || p.address || result.project.contractorAddr,
          contact: p.contact || result.project.contact,
          district: p.district || result.project.district,
          docKind: p.docKind || result.project.docKind,
        });
      }
      commitImportResult(result, file, 'form');
    } catch (e) {
      console.error(e);
      setImportStatus('Could not parse this PDF: ' + e.message, 'red');
    } finally {
      const input = document.getElementById('file-input');
      if (input) input.value = '';
    }
  }

  window.handleImportFile = async function (file) {
    if (!file) return;
    if (/\.json$/i.test(file.name) || SOSLists.looksLikeAggregateChart(file.name) || SOSLists.looksLikeSosDatabase(file.name, [])) {
      return handleListFile(file);
    }
    if (/\.pdf$/i.test(file.name)) {
      return handleImportPdf(file);
    }
    if (!/\.xlsx?$/i.test(file.name)) {
      setImportStatus('Drop the contractor SOS .xls / .xlsx / .pdf form (not an issued M&R letter PDF).', 'red');
      return;
    }
    document.getElementById('drop-label').textContent = file.name;
    setImportStatus('Loading spreadsheet reader…', 'blue');
    try {
      await loadXlsx();
      setImportStatus('Reading spreadsheet…', 'blue');
      const buf = await file.arrayBuffer();
      const kept = copyFileBytes(buf);
      rememberSubmittal(file, kept);
      const wb = XLSX.read(buf, { type: 'array', cellDates: false });
      const grid = SOSEngine.workbookToGrid(wb);
      if (SOSLists.looksLikeAggregateChart(file.name, grid)) {
        ingestAggregateGrid(grid, file.name);
        setImportStatus('Loaded aggregate chart from ' + file.name + '. SOS form still needed on this drop zone.', 'green');
        switchTab('lists', document.querySelector('.tab[data-tab="lists"]'));
        return;
      }
      const result = SOSEngine.processWorkbook(wb, { filename: file.name, lists: listsForEngine() });
      commitImportResult(result, file, 'spreadsheet');
    } catch (e) {
      console.error(e);
      setImportStatus('Could not parse this file: ' + e.message, 'red');
    } finally {
      const input = document.getElementById('file-input');
      if (input) input.value = '';
    }
  };

  function applyProjectToHeader(p, replace) {
    const current = {
      contract: val('ph-contract'),
      title: val('ph-title'),
      contractor: val('ph-contractor'),
      contractorAddr: val('ph-contractor-addr'),
      contact: val('ph-contact'),
      district: val('ph-district'),
      docKind: val('ph-dockind'),
      date: val('ph-date'),
    };
    const overlay = (SOSEngine && SOSEngine.overlayProject)
      ? SOSEngine.overlayProject
      : function (c, i) { return Object.assign({}, c, i); };
    const next = overlay(current, p || {}, !!replace);
    setVal('ph-contract', next.contract);
    setVal('ph-title', next.title);
    setVal('ph-contractor', next.contractor);
    setVal('ph-contractor-addr', next.contractorAddr);
    setVal('ph-contact', next.contact);
    if (next.docKind) setVal('ph-dockind', next.docKind);
    if (next.district) {
      const sel = document.getElementById('ph-district');
      const want = String(next.district).toLowerCase();
      if (sel) {
        for (const opt of sel.options) {
          if (opt.value.toLowerCase() === want || want.includes(opt.value.toLowerCase()) || opt.value.toLowerCase().includes(want.split(/\s+/)[0])) {
            sel.value = opt.value; break;
          }
        }
      }
    }
    if (next.date) setVal('ph-date', next.date);
    else if (replace || !val('ph-date')) setVal('ph-date', headerToday());
    if (replace) signedAt = new Date().toISOString();
    updateContractWarn();
    refreshSpecYearFromContract();
    persistProject();
  }

  function renderImportPreview() {
    const block = document.getElementById('import-preview-block');
    const tbody = document.getElementById('import-preview-tbody');
    if (!parsedImport) { block.style.display = 'none'; return; }
    tbody.innerHTML = parsedImport.items.map(item => {
      const am = actionMeta[item.action] || actionMeta.approved;
      const specs = item.letterSpecs || item.specs;
      const flags = item.reviewFlags || [];
      return `<tr class="${flags.length ? 'item-review' : ''}">
        <td>${specs.map(s => `<div class="spec-num">${esc(s)}</div>`).join('')}</td>
        <td><div style="font-weight:500;">${esc(item.desc)}</div>${(item.subItems || []).map(s => `<div style="font-size:11px;color:var(--text-mid);">• ${esc(s)}</div>`).join('')}${flags.map(f => `<div class="review-flag">⚠ ${esc(f)}</div>`).join('')}</td>
        <td><div class="source-primary">${esc(item.srcName || '')}${item.srcLoc ? ' — ' + esc(item.srcLoc) : ''}</div>
            ${item.altName ? `<div class="source-alt">${esc(item.altName)}${item.altLoc ? ' — ' + esc(item.altLoc) : ''}</div>` : ''}</td>
        <td><span class="action-badge ${am.cls}">${am.label}</span></td>
        <td><div class="rule-chip">${esc(item.rule || '')}</div></td>
      </tr>`;
    }).join('');
    document.getElementById('import-preview-title').textContent =
      `${parsedImport.items.length} letter items (rules applied)`;
    block.style.display = 'block';
  }

  window.importAllParsed = function () {
    if (!parsedImport) return 0;
    applyProjectToHeader(parsedImport.project, true);
    items = (parsedImport.items || []).map((it, i) => ({ ...it, id: Date.now() + i }));
    ccList = parsedImport.cc || [];
    warnings = parsedImport.warnings || [];
    revisions = [{ num: 1, date: val('ph-date') || headerToday(), notes: 'Initial issue from contractor SOS spreadsheet.', items: [] }];
    currentRev = 1;
    items.forEach(it => {
      autoSaveSource(it.srcName, it.srcLoc, it.srcAddr, it.srcPhone);
      if (it.altName) autoSaveSource(it.altName, it.altLoc, it.altAddr, it.altPhone);
      (it.specs || []).forEach(n => autoSaveSpec(n, it.desc, it.srcName, it.srcLoc, it.srcAddr, it.srcPhone));
    });
    persistAll();
    renderItems(); renderCC(); renderCCLib(); renderRevisions(); renderSourceLib(); renderSpecLibTab();
    clearLetterEdits();
    renderLetter(true); renderWarnings();
    switchTab('items', document.querySelector('.tab[data-tab="items"]'));
    setImportStatus('Letter loaded. Fill the application/contract number if it is highlighted, then print. Drop another .xls or click New letter to start the next job.', 'green');
    return items.length;
  };
  window.clearImportPreview = function () {
    parsedImport = null;
    document.getElementById('import-preview-block').style.display = 'none';
    document.getElementById('drop-label').textContent = 'Drop DelDOT SOS spreadsheet here';
    document.getElementById('file-input').value = '';
  };

  window.exportItemsXls = async function () {
    try {
      await loadXlsx();
    } catch (e) {
      setImportStatus(e.message, 'red');
      return;
    }
    const rows = [['Spec', 'Description', 'Sub-items', 'Source', 'Location', 'Alt', 'Action', 'Notes', 'Rule']];
    items.forEach(it => {
      rows.push([
        (it.letterSpecs || it.specs || []).join(' '),
        it.desc, (it.subItems || []).join('; '),
        it.srcName, it.srcLoc, it.altName ? it.altName + ' - ' + (it.altLoc || '') : '',
        it.action, it.actionNotes, it.rule,
      ]);
    });
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), 'SOS');
    const slug = (val('ph-contract') || 'sos').replace(/[^\w.-]+/g, '_');
    XLSX.writeFile(wb, slug + '_SOS_items.xlsx');
  };

  window.uploadSignature = function (event) {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function (e) {
      normalizeSignatureImage(e.target.result, (dataUrl) => {
        signatureImage = dataUrl;
        localStorage.setItem('sosSignatureImage', signatureImage);
        renderLetter(true);
      });
    };
    reader.readAsDataURL(file);
    event.target.value = '';
  };

  function normalizeSignatureImage(dataUrl, done) {
    const img = new Image();
    img.onload = function () {
      try {
        const maxSide = 1800;
        let srcW = img.naturalWidth || img.width;
        let srcH = img.naturalHeight || img.height;
        const shrink = Math.min(1, maxSide / Math.max(srcW, srcH));
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(srcW * shrink));
        canvas.height = Math.max(1, Math.round(srcH * shrink));
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        const trimmed = trimSignatureCanvas(canvas);
        const TARGET_H = 140;
        const TARGET_W = 320;
        const scale = Math.min(1, TARGET_H / trimmed.height, TARGET_W / trimmed.width);
        const out = document.createElement('canvas');
        out.width = Math.max(1, Math.round(trimmed.width * scale));
        out.height = Math.max(1, Math.round(trimmed.height * scale));
        const octx = out.getContext('2d');
        octx.imageSmoothingEnabled = true;
        octx.imageSmoothingQuality = 'high';
        octx.drawImage(trimmed, 0, 0, out.width, out.height);
        done(out.toDataURL('image/png'));
      } catch (err) {
        done(dataUrl);
      }
    };
    img.onerror = function () { done(dataUrl); };
    img.src = dataUrl;
  }

  function trimSignatureCanvas(canvas) {
    const ctx = canvas.getContext('2d');
    const { width, height } = canvas;
    const data = ctx.getImageData(0, 0, width, height).data;
    let top = 0, bottom = height - 1, left = 0, right = width - 1;
    const empty = (x, y) => {
      const i = (y * width + x) * 4;
      const a = data[i + 3];
      if (a < 12) return true;
      return data[i] > 246 && data[i + 1] > 246 && data[i + 2] > 246;
    };
    while (top < height && Array.from({ length: width }, (_, x) => empty(x, top)).every(Boolean)) top++;
    while (bottom > top && Array.from({ length: width }, (_, x) => empty(x, bottom)).every(Boolean)) bottom--;
    while (left < width && Array.from({ length: height }, (_, y) => empty(left, y)).every(Boolean)) left++;
    while (right > left && Array.from({ length: height }, (_, y) => empty(right, y)).every(Boolean)) right--;
    const pad = 4;
    const x = Math.max(0, left - pad);
    const y = Math.max(0, top - pad);
    const w = Math.min(width - x, right - left + 1 + pad * 2);
    const h = Math.min(height - y, bottom - top + 1 + pad * 2);
    if (w < 8 || h < 8) return canvas;
    const out = document.createElement('canvas');
    out.width = w;
    out.height = h;
    out.getContext('2d').drawImage(canvas, x, y, w, h, 0, 0, w, h);
    return out;
  }

  function printLetterCss() {
    return (window.SOSLetterExport && SOSLetterExport.printLetterCss()) || '';
  }

  function rememberSubmittal(file, buf) {
    if (!file || !buf) return;
    try {
      const view = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
      const bytes = new Uint8Array(view.byteLength);
      bytes.set(view);
      lastSubmittal = { name: file.name || 'submittal.xls', bytes };
    } catch (e) {
      lastSubmittal = { name: file.name || 'submittal.xls', bytes: null };
    }
  }

  function copyFileBytes(buf) {
    const view = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
    const out = new Uint8Array(view.byteLength);
    out.set(view);
    return out;
  }

  function safeFolderBit(raw, fallback) {
    const s = String(raw || '')
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/['’`]/g, '')
      .replace(/[^A-Za-z0-9_-]+/g, '_')
      .replace(/_+/g, '_')
      .replace(/^[-_.]+|[-_.]+$/g, '')
      .slice(0, 60)
      .replace(/[-_.]+$/g, '');
    if (!s || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i.test(s)) return fallback || '';
    return s;
  }

  /** Date + application/contract # only. Titles like "Chapel Creek (Gaines) #602951138" are not used — # & ' / trailing dots break Windows. */
  function trainingSlug() {
    const rawDay = String(headerToday() || '');
    const day = /^\d{4}-\d{2}-\d{2}$/.test(rawDay) ? rawDay : new Date().toISOString().slice(0, 10);
    let rawId = val('ph-contract');
    if (typeof SOSEngine !== 'undefined' && SOSEngine.cleanContractNo) {
      rawId = SOSEngine.cleanContractNo(rawId) || rawId;
    }
    const id = safeFolderBit(rawId, '');
    return id ? (day + '_' + id) : (day + '_letter');
  }

  function currentLetterText() {
    const el = document.getElementById('letter-doc');
    return el ? String(el.innerText || el.textContent || '').trim() : '';
  }

  function trainingReadmeText() {
    const who = [val('ph-contract'), val('ph-title'), val('ph-contractor')].filter(Boolean).join(' · ') || '(fill the header)';
    return [
      'SOS training pack',
      'Job: ' + who,
      '',
      'This folder is how the program keeps learning:',
      '  1. submittal.xls / .xlsx / .pdf  — contractor Source of Supply form',
      '  2. program-output.html / .txt    — the letter this tool produced (your typed edits included)',
      '  3. issued.pdf                    — the SOS letter that was actually sent',
      '',
      'After you send the letter, copy that PDF into this folder and name it issued.pdf.',
      'Once a week, double-click learn-sos.bat, then drop SOS-language.json on APL / Chart,',
      'SOS-libraries.json on Source Library, and SOS-cc.json on CC.',
      '',
    ].join('\n');
  }

  function trainingItemsJson() {
    return JSON.stringify({
      kind: 'training-pack',
      savedAt: new Date().toISOString(),
      project: {
        contract: val('ph-contract'),
        title: val('ph-title'),
        contractor: val('ph-contractor'),
        contractorAddr: val('ph-contractor-addr'),
        contact: val('ph-contact'),
        district: val('ph-district'),
        date: val('ph-date'),
        docKind: val('ph-dockind'),
      },
      cc: ccList,
      warnings: warnings,
      items: items.map(it => ({
        specs: it.letterSpecs || it.specs,
        family: it.family,
        action: it.action,
        rule: it.rule,
        section: (typeof SOSEngine !== 'undefined' && SOSEngine.letterSectionLines)
          ? SOSEngine.letterSectionLines(it).join(' / ')
          : (it.desc || ''),
        source: (typeof SOSEngine !== 'undefined' && SOSEngine.sourceLine)
          ? SOSEngine.sourceLine(it).replace(/\n/g, ' | ')
          : (it.srcName || ''),
        notes: it.actionNotes,
        subs: it.subItems || [],
      })),
    }, null, 2);
  }

  function bytesToBase64(u8) {
    let s = '';
    const step = 0x8000;
    for (let i = 0; i < u8.length; i += step) {
      s += String.fromCharCode.apply(null, u8.subarray(i, i + step));
    }
    return btoa(s);
  }

  function crc32(u8) {
    let c = 0xffffffff;
    for (let i = 0; i < u8.length; i++) {
      c ^= u8[i];
      for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
    }
    return (c ^ 0xffffffff) >>> 0;
  }

  function zipStore(files) {
    const enc = new TextEncoder();
    const locals = [];
    const centrals = [];
    let offset = 0;
    files.forEach(f => {
      const name = enc.encode(f.name);
      const data = f.bytes;
      const crc = crc32(data);
      const local = new Uint8Array(30 + name.length + data.length);
      const lv = new DataView(local.buffer);
      lv.setUint32(0, 0x04034b50, true);
      lv.setUint16(4, 20, true);
      lv.setUint16(8, 0, true);
      lv.setUint16(10, 0, true);
      lv.setUint16(12, 0, true);
      lv.setUint32(14, crc, true);
      lv.setUint32(18, data.length, true);
      lv.setUint32(22, data.length, true);
      lv.setUint16(26, name.length, true);
      local.set(name, 30);
      local.set(data, 30 + name.length);
      const central = new Uint8Array(46 + name.length);
      const cv = new DataView(central.buffer);
      cv.setUint32(0, 0x02014b50, true);
      cv.setUint16(4, 20, true);
      cv.setUint16(6, 20, true);
      cv.setUint32(16, crc, true);
      cv.setUint32(20, data.length, true);
      cv.setUint32(24, data.length, true);
      cv.setUint16(28, name.length, true);
      cv.setUint32(42, offset, true);
      central.set(name, 46);
      locals.push(local);
      centrals.push(central);
      offset += local.length;
    });
    const centralSize = centrals.reduce((n, b) => n + b.length, 0);
    const end = new Uint8Array(22);
    const ev = new DataView(end.buffer);
    ev.setUint32(0, 0x06054b50, true);
    ev.setUint16(8, files.length, true);
    ev.setUint16(10, files.length, true);
    ev.setUint32(12, centralSize, true);
    ev.setUint32(16, offset, true);
    const out = new Uint8Array(offset + centralSize + 22);
    let p = 0;
    locals.forEach(b => { out.set(b, p); p += b.length; });
    centrals.forEach(b => { out.set(b, p); p += b.length; });
    out.set(end, p);
    return out;
  }

  function utf8Bytes(s) {
    return new TextEncoder().encode(String(s || ''));
  }

  function buildTrainingFiles() {
    const files = [
      { name: 'README.txt', text: trainingReadmeText() },
      { name: 'program-output.html', text: (document.getElementById('letter-doc') || {}).innerHTML || '' },
      { name: 'program-output.txt', text: currentLetterText() },
      { name: 'items.json', text: trainingItemsJson() },
    ];
    if (lastSubmittal && lastSubmittal.bytes && lastSubmittal.bytes.length) {
      const ext = (String(lastSubmittal.name).match(/\.(xlsx?|pdf)$/i) || ['.xls'])[0].toLowerCase();
      const entry = { name: 'submittal' + ext, bytes: lastSubmittal.bytes };
      try {
        if (lastSubmittal.bytes.length <= 6 * 1024 * 1024) {
          entry.base64 = bytesToBase64(lastSubmittal.bytes);
        }
      } catch (e) {}
      files.push(entry);
    }
    return files;
  }

  function downloadTrainingZip(slug, files) {
    const packed = files.map(f => ({
      name: f.name,
      bytes: f.bytes || utf8Bytes(f.text || ''),
    }));
    const zip = zipStore(packed);
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([zip], { type: 'application/zip' }));
    a.download = slug + '_training.zip';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }

  function trainingSaveUrls() {
    const proto = (typeof location !== 'undefined' && location.protocol) || '';
    const host = (typeof location !== 'undefined' && location.hostname) || '';
    const port = (typeof location !== 'undefined' && location.port) || '';
    const local = 'http://127.0.0.1:18765/api/save-training';
    if (proto === 'http:' || proto === 'https:') {
      const urls = ['/api/save-training'];
      const onHelper = (host === '127.0.0.1' || host === 'localhost') && port === '18765';
      if (!onHelper) urls.push(local);
      return urls;
    }
    return [local];
  }

  function fetchWithTimeout(url, opts, ms) {
    const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timer = setTimeout(() => { if (ctrl) ctrl.abort(); }, ms);
    const req = fetch(url, Object.assign({}, opts, ctrl ? { signal: ctrl.signal } : {}));
    return req.finally(() => clearTimeout(timer));
  }

  function setLetterActionStatus(msg, color) {
    const el = document.getElementById('letter-save-status');
    if (el) {
      el.hidden = !msg;
      el.textContent = msg || '';
      el.className = 'letter-save-status' + (
        color === 'green' ? ' is-ok' : color === 'red' ? ' is-err' : ' is-info'
      );
    }
    try {
      if (msg) setImportStatus(msg, color);
    } catch (e) {}
  }

  window.saveTrainingPack = async function () {
    if (window.saveTrainingPack.busy) return;
    window.saveTrainingPack.busy = true;
    try {
      if (!items.length && !currentLetterText()) {
        setLetterActionStatus('Load a contractor form and build the letter before saving a training pack.', 'red');
        return;
      }
      setLetterActionStatus('Saving training pack…', 'blue');
      const slug = trainingSlug();
      const files = buildTrainingFiles();
      const payload = {
        slug,
        files: files.map(f => ({ name: f.name, text: f.text, base64: f.base64 })),
      };
      const urls = trainingSaveUrls();
      let lastErr = '';
      for (const url of urls) {
        try {
          const ms = url.charAt(0) === '/' ? 8000 : 2500;
          const res = await fetchWithTimeout(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          }, ms);
          const text = await res.text();
          let body = null;
          try { body = JSON.parse(text); } catch (e) {
            lastErr = url + ' HTTP ' + res.status;
            continue;
          }
          if (body && body.ok && body.dest) {
            setLetterActionStatus('Saved to ' + body.dest + '. After you send the letter, copy that PDF into the same folder as issued.pdf.', 'green');
            return;
          }
          lastErr = (body && body.error) || ('HTTP ' + res.status);
        } catch (e) {
          lastErr = (e && e.name === 'AbortError') ? 'helper did not answer in time' : (e.message || String(e));
        }
      }
      downloadTrainingZip(slug, files);
      setLetterActionStatus(
        'Downloaded ' + slug + '_training.zip. If start-sos.bat is open, the helper did not take the file (' + (lastErr || 'no response') + '). Unzip into Desktop SOS Program\\jobs\\.',
        'blue'
      );
    } catch (e) {
      setLetterActionStatus('Could not save the training pack: ' + (e.message || String(e)), 'red');
    } finally {
      window.saveTrainingPack.busy = false;
    }
  };

  window.printLetter = function () {
    const html = document.getElementById('letter-doc').innerHTML;
    const w = window.open('', '_blank');
    w.document.write(`<!DOCTYPE html><html><head><title>SOS Letter</title>
<style>${printLetterCss()}</style></head><body>${html}</body></html>`);
    w.document.close();
    setTimeout(() => w.print(), 400);
  };

  function waitForImage(img) {
    if (img.complete && img.naturalWidth) return Promise.resolve();
    return new Promise(resolve => {
      const done = () => resolve();
      img.addEventListener('load', done, { once: true });
      img.addEventListener('error', done, { once: true });
      setTimeout(done, 1500);
    });
  }

  function canvasImageDataUrl(img) {
    const src = img.getAttribute('src') || img.src || '';
    if (src.indexOf('data:') === 0) return src;
    const w = img.naturalWidth || img.width;
    const h = img.naturalHeight || img.height;
    if (!w || !h) return '';
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    c.getContext('2d').drawImage(img, 0, 0);
    const jpeg = /\.jpe?g(\?|$)/i.test(src);
    return c.toDataURL(jpeg ? 'image/jpeg' : 'image/png');
  }

  async function fetchImageDataUrl(src) {
    const res = await fetch(src);
    const blob = await res.blob();
    return await new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result);
      r.onerror = reject;
      r.readAsDataURL(blob);
    });
  }

  async function embedImagesAsDataUrls(root) {
    const imgs = Array.from(root.querySelectorAll('img'));
    for (const img of imgs) {
      await waitForImage(img);
      const src = img.getAttribute('src') || img.src || '';
      if (!src || src.indexOf('data:') === 0) continue;
      let data = '';
      try { data = canvasImageDataUrl(img); } catch (e) { data = ''; }
      if (!data) {
        try { data = await fetchImageDataUrl(src); } catch (e2) { data = src; }
      }
      if (data) img.setAttribute('src', data);
    }
  }

  function convertLayoutForWord(root) {
    root.querySelectorAll('.letter-row').forEach(row => {
      const kids = Array.from(row.children);
      if (kids.length < 2) return;
      const table = document.createElement('table');
      table.setAttribute('class', 'letter-row-table');
      table.setAttribute('width', '100%');
      table.setAttribute('border', '0');
      table.setAttribute('cellpadding', '0');
      table.setAttribute('cellspacing', '0');
      const tr = document.createElement('tr');
      const tdLabel = document.createElement('td');
      tdLabel.setAttribute('class', kids[0].className || 'letter-field-label');
      tdLabel.setAttribute('valign', 'top');
      tdLabel.setAttribute('width', '90');
      tdLabel.style.width = '72pt';
      tdLabel.style.fontWeight = /letter-label-section/.test(tdLabel.className) ? '700' : '400';
      tdLabel.style.textDecoration = 'none';
      tdLabel.style.paddingRight = '6pt';
      tdLabel.style.paddingBottom = '0';
      tdLabel.innerHTML = kids[0].innerHTML;
      const tdVal = document.createElement('td');
      tdVal.setAttribute('valign', 'top');
      tdVal.style.paddingBottom = '3pt';
      tdVal.innerHTML = kids.slice(1).map(k => k.innerHTML).join('');
      tr.appendChild(tdLabel);
      tr.appendChild(tdVal);
      table.appendChild(tr);
      row.parentNode.replaceChild(table, row);
    });
    root.querySelectorAll('.letter-sig-row').forEach(row => {
      const table = document.createElement('table');
      table.setAttribute('border', '0');
      table.setAttribute('cellpadding', '0');
      table.setAttribute('cellspacing', '0');
      const tr = document.createElement('tr');
      Array.from(row.children).forEach(child => {
        const td = document.createElement('td');
        td.setAttribute('valign', 'bottom');
        td.style.paddingRight = '16pt';
        td.appendChild(child.cloneNode(true));
        tr.appendChild(td);
      });
      table.appendChild(tr);
      row.parentNode.replaceChild(table, row);
    });
  }

  window.exportLetterDoc = async function () {
    const src = document.getElementById('letter-doc');
    if (!src || !window.SOSLetterExport) return;
    const clone = src.cloneNode(true);
    await embedImagesAsDataUrls(clone);
    convertLayoutForWord(clone);
    const body = SOSLetterExport.rewriteHighlightsForWord(clone.innerHTML);
    const contract = val('ph-contract');
    const filename = SOSLetterExport.letterExportFilename(contract, 'doc');
    const html = SOSLetterExport.wrapWordHtml(body, filename.replace(/\.doc$/i, ''));
    const blob = new Blob(['\ufeff', html], { type: 'application/msword' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  };

  window.toggleHighlightMode = function () {
    highlightMode = !highlightMode;
    const btn = document.getElementById('highlight-btn');
    const scroll = document.querySelector('.letter-scroll');
    btn.classList.toggle('active', highlightMode);
    scroll.classList.toggle('highlight-mode', highlightMode);
    btn.textContent = highlightMode ? '🖊 Highlighting…' : '🖊 Highlight';
    setLetterEditable(!highlightMode);
  };
  window.clearHighlights = function () {
    const doc = document.getElementById('letter-doc');
    doc.querySelectorAll('mark.user-highlight').forEach(el => {
      const p = el.parentNode;
      while (el.firstChild) p.insertBefore(el.firstChild, el);
      p.removeChild(el);
      p.normalize();
    });
  };
  document.addEventListener('mouseup', () => {
    if (!highlightMode) return;
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed) return;
    const range = sel.getRangeAt(0);
    const doc = document.getElementById('letter-doc');
    if (!doc.contains(range.commonAncestorContainer)) return;
    try {
      const mark = document.createElement('mark');
      mark.className = 'user-highlight';
      range.surroundContents(mark);
      sel.removeAllRanges();
    } catch (e) {
      try {
        const mark = document.createElement('mark');
        mark.className = 'user-highlight';
        mark.appendChild(range.extractContents());
        range.insertNode(mark);
        sel.removeAllRanges();
      } catch (e2) {}
    }
  });

  function wireDropZone(el) {
    if (!el) return;
    el.addEventListener('dragover', e => { e.preventDefault(); el.classList.add('drag-over'); });
    el.addEventListener('dragleave', () => el.classList.remove('drag-over'));
    el.addEventListener('drop', e => {
      e.preventDefault();
      el.classList.remove('drag-over');
      const file = e.dataTransfer.files[0];
      if (!file) return;
      if (el.id === 'lists-drop-zone' || el.id === 'sources-drop-zone' || el.id === 'specs-drop-zone') handleListFile(file);
      else if (el.id === 'cc-drop-zone') handleCcFile(file);
      else handleImportFile(file);
    });
  }

  document.querySelectorAll('.modal-backdrop').forEach(bd => {
    bd.addEventListener('click', e => { if (e.target === bd) bd.classList.remove('open'); });
  });

  function initApp() {
    loadAuthor();
    loadProjectHeader();
    wireProjectPersist();
    wireDropZone(document.getElementById('drop-zone'));
    document.querySelectorAll('.landing-drop').forEach(wireDropZone);
    wireDropZone(document.getElementById('lists-drop-zone'));
    wireDropZone(document.getElementById('cc-drop-zone'));
    wireDropZone(document.getElementById('sources-drop-zone'));
    wireDropZone(document.getElementById('specs-drop-zone'));
    renderItems();
    renderCC();
    renderRevisions();
    renderLetter();
    renderWarnings();
    loadLetterEdits();
    setTimeout(function () {
      loadSourceLib();
      loadSpecLib();
      loadCCLib();
      loadCcRules();
      updateSourceLibCounts();
      updateSpecLibCounts();
      renderCcRules();
      renderCCHarvestStatus();
      loadAplSnapshot().then(() => {
        mergeLiveListsIntoLibraries();
        renderLists();
        renderCCHarvestStatus();
      });
    }, 0);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initApp);
  else initApp();
})();
