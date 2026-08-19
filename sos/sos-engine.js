/* DelDOT Source of Supply — parse contractor XLS grids and apply letter rules.
   Works in the browser (global SOSEngine) and Node (module.exports). */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./sos-data.js'), require('./sos-lists.js'));
  } else {
    root.SOSEngine = factory(root.SOSData, root.SOSLists);
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (DATA, LISTS) {
  'use strict';

  const {
    SPEC_CATALOG,
    SPEC_CORRECTIONS,
    TACK_COAT_APL,
    STRIPING_APL,
    CRACK_SEAL_APL,
    ACTION_TEXT,
    APL_FOOTNOTE,
    CC_ASSIGNMENT_SEEDS,
    assignmentMatchesItems,
    soilStoneOnLetter,
    samplerForDistrict,
    testCoordinationNotes,
  } = DATA;
  const Lists = LISTS || {};

  const STREET_RE = /^\d+\s|\b(rd|road|ave|avenue|st\.?|street|hwy|highway|blvd|boulevard|ln|lane|dr\.?|drive|ct|court|pkwy|pike|way|circle|pl|place|po box)\b/i;
  const CITY_STATE_RE = /^([A-Za-z .'-]+),\s*([A-Z]{2})(?:\s+\d{5}(?:-\d{4})?)?$/;
  const CITY_STATE_LOOSE_RE = /^([A-Za-z .'-]+)\s+([A-Z]{2})(?:\s+\d{5})?$/;
  const PHONE_RE = /(?:\+?1[-.\s]*)?\(?\d{3}\)?[-.\s]*\d{3}[-.\s]*\d{4}|\d-\d{3}-\d{3}-\d{4}/;
  const SPEC_TOKEN_RE = /(\d{6})(?:\.\d+)?/g;

  function cellStr(v) {
    if (v == null || v === '') return '';
    if (typeof v === 'number') {
      if (Number.isInteger(v)) return String(v);
      // Spec numbers arrive as 401005.0
      if (Math.abs(v - Math.round(v)) < 1e-6 && v > 1000) return String(Math.round(v));
      return String(v);
    }
    return String(v).replace(/\s+/g, ' ').trim();
  }

  function normalizeSpec(raw) {
    const s = cellStr(raw).replace(/^#+/, '').trim();
    if (!s) return '';
    const m = s.match(/^(\d{6})(?:\.\d+)?$/);
    if (m) return '#' + m[1];
    const cleaned = s.replace(/\.0$/, '');
    return cleaned.startsWith('#') ? cleaned.toUpperCase() : '#' + cleaned.toUpperCase();
  }

  function extractSpecs(raw) {
    const s = cellStr(raw);
    if (!s) return [];
    const out = [];
    let m;
    const re = new RegExp(SPEC_TOKEN_RE.source, 'g');
    while ((m = re.exec(s))) out.push('#' + m[1]);
    if (!out.length && /^\d{3,6}/.test(s)) {
      const n = normalizeSpec(s);
      if (n) out.push(n);
    }
    return [...new Set(out)];
  }

  function looksLikeSpecStart(raw) {
    const s = cellStr(raw);
    if (!s) return false;
    if (typeof raw === 'number' && raw > 100000) return true;
    return /^\d{6}(\.\d+)?$/.test(s) || /^\d{6}\s*[/-]/.test(s) || /#\d{6}/.test(s);
  }

  function isPhone(s) {
    return PHONE_RE.test(s || '');
  }

  function isCityState(s) {
    const t = cellStr(s);
    return CITY_STATE_RE.test(t) || (CITY_STATE_LOOSE_RE.test(t) && /\b[A-Z]{2}\b/.test(t) && !STREET_RE.test(t));
  }

  function isStreet(s) {
    const t = cellStr(s);
    if (!t) return false;
    if (isPhone(t) || isCityState(t)) return false;
    return STREET_RE.test(t);
  }

  function isCompanyName(s) {
    const t = cellStr(s);
    if (!t) return false;
    if (isPhone(t) || isCityState(t) || isStreet(t)) return false;
    if (/^(n\/?a|none|same|tbd|-)$/i.test(t)) return false;
    return /[A-Za-z]{3,}/.test(t);
  }

  function formatLoc(cityLine) {
    const t = cellStr(cityLine);
    let m = t.match(CITY_STATE_RE);
    if (m) return `${m[1].trim()} ${m[2]}`;
    m = t.match(CITY_STATE_LOOSE_RE);
    if (m) return `${m[1].trim()} ${m[2]}`;
    return t.replace(/,\s*/g, ' ').replace(/\s+\d{5}(?:-\d{4})?$/, '').trim();
  }

  function formatPhone(s) {
    const d = (s || '').replace(/\D/g, '');
    const n = d.length === 11 && d.startsWith('1') ? d.slice(1) : d;
    if (n.length === 10) return `(${n.slice(0, 3)}) ${n.slice(3, 6)}-${n.slice(6)}`;
    return cellStr(s);
  }

  function parseLabeled(text, label) {
    const re = new RegExp(label + '\\s*:\\s*(.*)$', 'i');
    const m = cellStr(text).match(re);
    return m ? m[1].trim() : '';
  }

  function findLabeled(rows, label) {
    const needle = label.toLowerCase();
    for (const row of rows) {
      for (let c = 0; c < row.length; c++) {
        const v = cellStr(row[c]);
        if (!v) continue;
        const lower = v.toLowerCase();
        if (lower === needle || lower.startsWith(needle)) {
          const after = parseLabeled(v, label.replace(/:$/, ''));
          if (after) return after;
          for (let k = c + 1; k < row.length; k++) {
            const n = cellStr(row[k]);
            if (n) return n.replace(new RegExp('^' + label + '\\s*:\\s*', 'i'), '').trim();
          }
        }
        const inline = parseLabeled(v, label.replace(/:$/, ''));
        if (inline) return inline;
      }
    }
    return '';
  }

  function parseDateToISO(raw) {
    const s = cellStr(raw);
    if (!s) return '';
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
    // Excel serial
    if (/^\d+(\.\d+)?$/.test(s)) {
      const n = Number(s);
      if (n > 20000 && n < 80000) {
        const utc = new Date(Math.round((n - 25569) * 86400 * 1000));
        return utc.toISOString().slice(0, 10);
      }
    }
    const m = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
    if (m) {
      let y = Number(m[3]);
      if (y < 100) y += y >= 70 ? 1900 : 2000;
      const mm = String(m[1]).padStart(2, '0');
      const dd = String(m[2]).padStart(2, '0');
      return `${y}-${mm}-${dd}`;
    }
    const d = new Date(s);
    if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10);
    return '';
  }

  function detectDocKind(contract) {
    const s = cellStr(contract).replace(/\s+/g, '');
    if (!s) return 'application';
    if (/^T\d{4}/i.test(s)) return 'contract';
    if (/^(CA-?)?\d{3,5}$/i.test(s) && s.length <= 6) return 'agreement';
    if (/^\d{6,}$/.test(s)) return 'application';
    return 'contract';
  }

  function contractPhrase(project) {
    const num = project.contract || '[CONTRACT #]';
    const title = (project.title || '').trim();
    const kind = project.docKind || detectDocKind(num);
    const label =
      kind === 'application' ? 'Application No.' :
      kind === 'agreement' ? 'Construction Agreement No.' :
      /F\.?A\.?P/i.test(title) ? 'State Contract No.' :
      'State Contract No.';
    return title ? `${label} ${num}, ${title}` : `${label} ${num}`;
  }

  function splitAddress(addr) {
    const parts = cellStr(addr).split(',').map(p => p.trim()).filter(Boolean);
    if (parts.length >= 2) {
      return { street: parts[0], citystatezip: parts.slice(1).join(', ') };
    }
    return { street: cellStr(addr), citystatezip: '' };
  }

  function consumeContactBlock(lines) {
    const block = { name: '', addr: '', loc: '', phone: '', extras: [] };
    for (const line of lines) {
      const t = cellStr(line);
      if (!t) continue;
      if (isPhone(t)) block.phone = formatPhone(t);
      else if (isCityState(t)) block.loc = formatLoc(t);
      else if (isStreet(t)) block.addr = block.addr ? block.addr + ', ' + t : t;
      else if (isCompanyName(t) && !block.name) block.name = t.replace(/,\s*(LLC|Inc\.?|Co\.?)\s*$/i, (m) => m).replace(/\s+/g, ' ').trim();
      else if (isCompanyName(t) && block.name) block.extras.push(t);
      else if (!block.addr) block.addr = t;
      else block.extras.push(t);
    }
    return block;
  }

  function findHeaderRow(rows) {
    for (let r = 0; r < Math.min(rows.length, 40); r++) {
      const joined = rows[r].map(cellStr).join(' ').toLowerCase();
      if (joined.includes('specification') && joined.includes('item description')) return r;
    }
    return -1;
  }

  function parseProject(rows) {
    const contract = findLabeled(rows, 'Agreement /Permit/Contract/Application #') ||
      findLabeled(rows, 'Agreement /Permit/Contract No') ||
      findLabeled(rows, 'Contract') ||
      findLabeled(rows, 'Application');
    const title = findLabeled(rows, 'Title of Contract') || findLabeled(rows, 'Title');
    const contractorRaw = findLabeled(rows, 'Contractor');
    const addr = findLabeled(rows, 'Address');
    const email = findLabeled(rows, 'E-Mail') || findLabeled(rows, 'Email');
    const sub = findLabeled(rows, 'Sub-Contractor');
    const dateRaw = findLabeled(rows, 'Date');
    const district = findLabeled(rows, 'District');
    const contact = findLabeled(rows, 'DelDOT Contact');

    const contractor = contractorRaw.replace(/^Contractor:\s*/i, '').trim();
    const addrParts = splitAddress(addr.replace(/^Address:\s*/i, ''));
    const contractorAddr = [addrParts.street, addrParts.citystatezip].filter(Boolean).join('\n');

    return {
      contract: contract.replace(/^.*?:\s*/, '').trim(),
      title: title.replace(/^Title of Contract:\s*/i, '').trim(),
      contractor,
      contractorAddr,
      contractorEmail: email,
      subContractor: sub.replace(/^n\/?a$/i, ''),
      district: district.replace(/^District:\s*/i, '').trim(),
      contact: contact.replace(/^DelDOT Contact:\s*/i, '').trim(),
      date: parseDateToISO(dateRaw) || new Date().toISOString().slice(0, 10),
      submittedDate: parseDateToISO(dateRaw),
      docKind: detectDocKind(contract.replace(/^.*?:\s*/, '').trim()),
    };
  }

  function pushLine(bucket, val) {
    const t = cellStr(val);
    if (t) bucket.push(t);
  }

  function parseItems(rows) {
    const header = findHeaderRow(rows);
    if (header < 0) return { items: [], warnings: ['Could not find Specification # header row.'] };
    const warnings = [];
    const items = [];
    let current = null;

    const flush = () => {
      if (!current) return;
      const mfg = consumeContactBlock(current.mfgLines);
      const alt = consumeContactBlock(current.altLines);
      const sup = consumeContactBlock(current.supLines);

      // Manufacturer column is a plant address when it has no company name.
      if (!mfg.name && (mfg.addr || mfg.loc)) {
        mfg.name = '';
      }
      if (!alt.name && (alt.addr || alt.loc) && (sup.name || mfg.name)) {
        alt.name = '';
      }

      const materialLines = [...new Set(current.materialLines.map(cellStr).filter(Boolean))];
      const desc = current.descLines.map(cellStr).filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
      const genericMaterial = /^(hot applied|sealant|tack coat|gabc|crusher run|graded aggregate)/i;
      const productish = (s) => /\d/.test(s) || (!genericMaterial.test(s) && s.length < 48);
      const preferredMaterial = [...materialLines].reverse().find(productish) || materialLines[materialLines.length - 1] || desc;
      const subItems = materialLines.filter(s => s.toLowerCase() !== desc.toLowerCase());
      const primaryName = mfg.name || sup.name;
      const altName = alt.name || (!alt.addr && !alt.loc ? '' : '');

      items.push({
        specs: current.specs,
        desc,
        material: preferredMaterial,
        subItems,
        // producer (mfg) vs distributor (supplier)
        supplierName: sup.name,
        supplierLoc: sup.loc,
        supplierAddr: sup.addr,
        supplierPhone: sup.phone,
        mfgName: mfg.name,
        mfgLoc: mfg.loc,
        mfgAddr: mfg.addr,
        mfgPhone: mfg.phone,
        altMfgName: alt.name,
        altLoc: alt.loc,
        altAddr: alt.addr,
        altPhone: alt.phone,
        srcName: primaryName,
        srcLoc: mfg.loc || sup.loc,
        srcAddr: mfg.addr || sup.addr,
        srcPhone: mfg.phone || sup.phone,
        altName: altName || (alt.loc || alt.addr ? (mfg.name || sup.name) : ''),
        raw: current,
      });
      current = null;
    };

    for (let r = header + 1; r < rows.length; r++) {
      const row = rows[r] || [];
      // Spec may be col 0 or col 1 depending on the template.
      const specCell = looksLikeSpecStart(row[1]) ? row[1] : looksLikeSpecStart(row[0]) ? row[0] : '';
      if (specCell) {
        flush();
        current = {
          specs: extractSpecs(specCell),
          descLines: [row[2]],
          materialLines: [row[4]],
          supLines: [row[5]],
          mfgLines: [row[7]],
          altLines: [row[8]],
        };
        continue;
      }
      if (!current) continue;
      const empty = row.every(c => cellStr(c) === '');
      if (empty) {
        // blank row = item separator (Frey template uses one blank between items)
        flush();
        continue;
      }
      pushLine(current.descLines, row[2]);
      pushLine(current.materialLines, row[4]);
      pushLine(current.supLines, row[5]);
      pushLine(current.mfgLines, row[7]);
      pushLine(current.altLines, row[8]);
    }
    flush();

    const nonempty = items.filter(it => it.specs.length || it.desc);
    if (!nonempty.length) warnings.push('No material items found below the header.');
    return { items: nonempty, warnings };
  }

  function parseSosGrid(rows, meta) {
    const grid = (rows || []).map(r => (Array.isArray(r) ? r : []));
    const project = parseProject(grid);
    const parsed = parseItems(grid);
    const warnings = [...parsed.warnings];
    if (!project.contract) {
      warnings.push('Contract / application number is blank on the form — fill it in before issuing.');
    }
    if (meta && meta.filename && !project.contract) {
      const fromName = meta.filename.match(/(\d{7,}|T\d{4}[-_]\d{3}[-_]\d{2}|CA[_\s-]?\d{3,5})/i);
      if (fromName) {
        project.contract = fromName[1].replace(/_/g, '-');
        project.docKind = detectDocKind(project.contract);
        warnings.push(`Contract number taken from filename: ${project.contract}`);
      }
    }
    return { project, items: parsed.items, warnings };
  }

  const OMIT_SPECS = new Set(['#201000', '#202000', '#211000']);

  function shouldOmitItem(item) {
    if ((item.specs || []).some(s => OMIT_SPECS.has(s))) return true;
    const blob = `${item.desc || ''} ${item.material || ''} ${(item.subItems || []).join(' ')}`.toLowerCase();
    return /\bn\/?a\b/.test(blob) && /clearing|excavation and embankment|removal of structures/.test(blob);
  }

  function familyFromDbHit(hit) {
    if (!hit) return '';
    const methods = (hit.methods || []).join(' ');
    const mats = (hit.materials || []).join(' ').toLowerCase();
    if (/AP4\.1/.test(methods)) {
      if (/borrow/.test(mats)) return 'borrow';
      if (/gabc|graded aggregate/.test(mats)) return 'aggregate';
      if (/stone/.test(mats)) return 'aggregate';
      return 'aggregate';
    }
    if (/AP4\.2/.test(methods)) return 'hma-mix';
    if (/AP4\.3/.test(methods)) return 'pcc';
    if (/AP4\.9/.test(methods)) return 'tack';
    if (/\bAPL\b/.test(methods)) return 'apl-product';
    return '';
  }

  function lookupCatalogDesc(spec, lists) {
    const cat = SPEC_CATALOG[spec];
    if (cat && cat.desc) return cat.desc;
    const hit = Lists.lookupSosDatabase && Lists.lookupSosDatabase(lists && lists.sosDatabase, spec);
    return hit && hit.desc ? hit.desc : '';
  }

  function familyFromSpec(spec, desc, material, lists) {
    const blob = `${desc} ${material}`.toLowerCase();
    if (isTack(desc, material, spec)) return 'tack';
    if (/expansion/.test(blob) && !/crack|joint seal/.test(blob)) return 'expansion';
    if (/curing/.test(blob)) return 'curing';
    const cat = SPEC_CATALOG[spec];
    if (cat) return cat.family;
    if (/tack/.test(blob)) return 'tack';
    if (/superpave|hot mix|hma|pg\s*\d{2}/.test(blob)) return 'hma-mix';
    if (/borrow|backfill/.test(blob)) return 'borrow';
    if (/gabc|crusher run|graded aggregate|no\.?\s*57|no\.?\s*3 stone|#57|#3 stone/.test(blob)) return 'aggregate';
    if (/rcp|reinforced concrete pipe|flared end/.test(blob)) return 'rcp';
    if (/drainage inlet|manhole/.test(blob) && /grate|frame|cover/.test(blob)) return 'castings';
    if (/drainage inlet|manhole|precast/.test(blob)) return 'precast';
    if (/sidewalk|curb|pcc /.test(blob)) return 'pcc';
    if (/seed/.test(blob)) return 'seed';
    if (/topsoil/.test(blob)) return 'topsoil';
    if (/silt fence|geotextile|erosion|inlet sediment|filter log/.test(blob)) return 'erosion';
    if (/crack|joint seal/.test(blob)) return 'crack-seal';
    if (/riprap/.test(blob)) return 'riprap';
    if (/pavement strip|thermoplastic arrow|alkyd-thermoplastic|epoxy resin paint/.test(blob)) return 'striping';
    if (/sign|barricade|attenuator|traffic/.test(blob)) return 'ttc';
    if (/pipe|hdpe|ads/.test(blob)) return 'hdpe';
    const hit = Lists.lookupSosDatabase && Lists.lookupSosDatabase(lists && lists.sosDatabase, spec);
    const fromDb = familyFromDbHit(hit);
    if (fromDb) return fromDb;
    const prefix = (spec || '').replace('#', '').slice(0, 3);
    const byPrefix = {
      '207': 'borrow', '209': 'borrow',
      '301': 'aggregate', '302': 'aggregate',
      '401': 'hma-mix', '404': 'crack-seal', '504': 'crack-seal',
      '601': 'rcp', '602': 'precast',
      '701': 'pcc', '702': 'pcc', '705': 'pcc',
      '707': 'riprap',
      '708': 'geotextile', '709': 'hdpe',
      '710': 'utility', '711': 'utility',
      '808': 'ttc', '810': 'ttc', '813': 'ttc',
      '817': 'striping', '818': 'signs',
      '861': 'striping', '862': 'striping',
      '905': 'erosion', '908': 'landscape',
    };
    return byPrefix[prefix] || 'other';
  }

  function isTack(desc, material, spec) {
    const blob = `${desc} ${material} ${spec}`.toLowerCase();
    return /tack/.test(blob) || spec === '#401501';
  }

  function cleanCompany(name) {
    return cellStr(name)
      .replace(/,?\s*(LLC|L\.L\.C\.|Inc\.?|Incorporated|Co\.?|Company|Corp\.?|Corporation)\.?\s*$/i, '')
      .replace(/,\s*$/, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function matchAplList(list, name, loc, product) {
    const n = name || '';
    const l = loc || '';
    const p = product || '';
    for (const entry of list) {
      if (!entry.name.test(n)) continue;
      if (entry.products && p && !entry.products.test(p)) continue;
      if (entry.reject && entry.reject.some(re => re.test(l) || re.test(n))) {
        return { listed: false, entry, rejected: true };
      }
      if (entry.locations && entry.locations.length) {
        const ok = entry.locations.some(re => re.test(l));
        return { listed: ok, entry, locationMismatch: !ok };
      }
      return { listed: true, entry };
    }
    return { listed: null, entry: null };
  }

  function applySpecCorrections(item, warnings) {
    const descBlob = `${item.desc} ${item.material} ${(item.subItems || []).join(' ')}`;
    const specs = item.specs.map(s => {
      for (const rule of SPEC_CORRECTIONS) {
        if (s === rule.whenSpec && rule.whenDesc.test(descBlob)) {
          if (rule.unlessDesc && rule.unlessDesc.test(descBlob)) return s;
          warnings.push(rule.note);
          return rule.toSpec;
        }
      }
      return s;
    });
    return { ...item, specs: [...new Set(specs)] };
  }

  function enrichDescription(item, lists) {
    const catalogDescs = item.specs.map(s => lookupCatalogDesc(s, lists)).filter(Boolean);
    let desc = item.desc;
    if (catalogDescs.length === 1) desc = catalogDescs[0];
    else if (catalogDescs.length > 1) desc = catalogDescs[0];
    else desc = (item.desc || '').replace(/\s+/g, ' ').trim().toUpperCase();

    const family = familyFromSpec(item.specs[0], item.desc, item.material, lists);
    let sectionDesc = desc;
    let subItems = [...(item.subItems || [])].filter(s => s.toLowerCase() !== desc.toLowerCase());
    let letterSpecs = [...item.specs];

    if (family === 'tack') {
      letterSpecs = ['#401xxx'];
      sectionDesc = 'HMA ITEMS';
      const product = (item.material || item.desc || 'Tack Coat').replace(/bituminous asphalt\s*/i, '').trim();
      let bullet = product;
      const grade = product.match(/tack\s*coat\s+(.*)$/i) || product.match(/^(.*)\s+tack\s*coat$/i);
      if (grade && grade[1] && !/^tack$/i.test(grade[1])) bullet = `${grade[1].trim()} Tack Coat`;
      else if (!/tack/i.test(bullet)) bullet = `${bullet} Tack Coat`;
      subItems = [bullet.replace(/\s+/g, ' ').trim() + '*'];
    } else if (family === 'curing') {
      letterSpecs = ['#701/705xxx'];
      sectionDesc = 'CONCRETE ITEMS';
      subItems = [(item.material || item.desc || 'Curing Compound') + '*'];
    } else if (family === 'expansion') {
      letterSpecs = ['#701/705xxx'];
      sectionDesc = 'CONCRETE ITEMS';
      const product = (item.material || item.desc || 'Expansion').replace(/\s+/g, ' ').trim();
      subItems = [product];
    } else if (family === 'crack-seal') {
      const branded = (item.subItems || []).filter(s => /\d/.test(s) || /elastoflex|roadsaver|crackmaster|flex/i.test(s));
      if (branded.length) subItems = branded;
      else if (item.material && item.material.toLowerCase() !== (item.desc || '').toLowerCase()) {
        subItems = [item.material];
      }
      if (catalogDescs[0]) sectionDesc = catalogDescs[0];
    }

    subItems = subItems.filter(s => s && s.toLowerCase() !== sectionDesc.toLowerCase());
    const specDescs = {};
    (item.specs || []).forEach(s => {
      const d = lookupCatalogDesc(s, lists);
      if (d) specDescs[s] = d;
    });
    return { ...item, family, desc: sectionDesc, letterSpecs, subItems, specDescs };
  }

  function pickLetterSource(item) {
    // APL / manufactured products: manufacturer is the SOURCE.
    // Bulk plants: supplier name + plant city from manufacturer address column.
    const manufactured = ['tack', 'crack-seal', 'curing', 'expansion', 'apl-product', 'ttc', 'signs', 'castings', 'striping'].includes(item.family);
    if (manufactured && item.mfgName) {
      return {
        srcName: cleanCompany(item.mfgName),
        srcLoc: item.mfgLoc || item.srcLoc,
        srcAddr: item.mfgAddr,
        srcPhone: item.mfgPhone,
        altName: cleanCompany(item.altMfgName || item.altName),
        altLoc: item.altLoc,
        altAddr: item.altAddr,
        altPhone: item.altPhone,
      };
    }
    const srcName = cleanCompany(item.supplierName || item.mfgName || item.srcName);
    const altIsSameCompany = !item.altMfgName && (item.altLoc || item.altAddr);
    let altName = cleanCompany(item.altMfgName || (altIsSameCompany ? srcName : item.altName));
    let numbered = false;
    if (altIsSameCompany && srcName && (item.mfgLoc || item.srcLoc) && item.altLoc &&
        formatLoc(item.mfgLoc || item.srcLoc) !== formatLoc(item.altLoc)) {
      numbered = true;
    }
    return {
      srcName: numbered ? `${srcName} 1` : srcName,
      srcLoc: item.mfgLoc || item.srcLoc || item.supplierLoc,
      srcAddr: item.mfgAddr || item.srcAddr || item.supplierAddr,
      srcPhone: item.mfgPhone || item.srcPhone || item.supplierPhone,
      altName: numbered ? `${srcName} 2` : altName,
      altLoc: item.altLoc,
      altAddr: item.altAddr,
      altPhone: item.altPhone,
    };
  }

  function applyAction(item, project, warnings, lists) {
    lists = lists || {};
    const family = item.family;
    const oneSource = !!(item.altName && item.altName !== item.srcName) ||
      (item.altLoc && item.altLoc !== item.srcLoc);
    const product = (item.subItems || []).join(' ') + ' ' + (item.material || '');
    const materialBlob = [item.desc, item.material, ...(item.subItems || [])].join(' ');
    let action = 'approved';
    let actionNotes = '';
    let apl = false;
    let highlight = false;
    let rule = family;
    let testDate = item.testDate || '';

    if (family === 'tack') {
      apl = true;
      const liveTack = lists.tack && lists.tack.entries && lists.tack.entries.length;
      const hit = liveTack
        ? Lists.lookupTack(lists.tack, item.srcName, item.srcLoc, product)
        : matchAplList(TACK_COAT_APL, item.srcName, item.srcLoc, product);
      if (hit.rejected || hit.locationMismatch || hit.gradeMismatch || hit.listed === false) {
        action = 'not-approved';
        if (hit.gradeMismatch) {
          const grade = hit.grade || Lists.extractGrade(product);
          actionNotes = `Not Approved. (${grade || 'This grade'} not listed on tack coat APL for this source location)`;
        } else {
          actionNotes = `Not Approved. (${item.srcName} ${item.srcLoc || ''} not listed on tack coat APL)`.replace(/\s+/g, ' ').trim();
        }
        rule = 'tack-not-on-apl';
        warnings.push(actionNotes);
      } else if (hit.listed) {
        action = 'apl';
        actionNotes = ACTION_TEXT.apl;
        rule = 'tack-on-apl';
      } else if (!item.srcName) {
        action = 'submit';
        actionNotes = ACTION_TEXT.submitTack;
        rule = 'tack-missing-mfg';
      } else if (liveTack) {
        action = 'not-approved';
        actionNotes = `Not Approved. (${item.srcName} ${item.srcLoc || ''} not listed on tack coat APL)`.replace(/\s+/g, ' ').trim();
        rule = 'tack-not-on-apl';
        warnings.push(actionNotes);
      } else {
        action = 'apl';
        actionNotes = ACTION_TEXT.apl;
        rule = 'tack-unknown-review';
        warnings.push(`Tack coat producer "${item.srcName}" is not in the local APL table — confirm on deldot.gov/Business/prodlists before issuing.`);
      }
    } else if (family === 'borrow' || family === 'aggregate') {
      const chart = lists.aggregate;
      if (chart && chart.entries && chart.entries.length && Lists.lookupAggregate) {
        const primary = Lists.lookupAggregate(chart, item.srcName, item.srcLoc, materialBlob);
        const altHit = item.altName ? Lists.lookupAggregate(chart, item.altName, item.altLoc, materialBlob) : null;
        const part = (hit, label) => {
          const who = label ? label + ' ' : '';
          if (!hit || !hit.found) {
            return { action: 'test', notes: who + ACTION_TEXT.test, date: '', highlight: true };
          }
          if (hit.status === 'rejected') {
            return { action: 'not-approved', notes: who + 'Not approved on the current aggregate chart.', date: '', highlight: false };
          }
          if (hit.status === 'approved') {
            return { action: 'approved', notes: who + ACTION_TEXT.approved, date: hit.testDate || '', highlight: false };
          }
          return { action: 'test', notes: who + ACTION_TEXT.test, date: '', highlight: true };
        };
        const p = part(primary, item.altName ? (item.srcName || 'Primary') : '');
        const a = altHit ? part(altHit, item.altName) : null;
        const parts = a ? [p, a] : [p];
        if (parts.some(x => x.action === 'not-approved') && !parts.some(x => x.action === 'approved' || x.action === 'test')) {
          action = 'not-approved';
        } else if (parts.some(x => x.action === 'test')) {
          action = 'test';
        } else if (parts.every(x => x.action === 'approved')) {
          action = 'approved';
        } else {
          action = parts[0].action;
        }
        highlight = parts.some(x => x.highlight);
        actionNotes = parts.map(x => x.notes).join('\n');
        if (action === 'test') actionNotes = actionNotes + '\n' + testCoordinationNotes(project.district, lists);
        testDate = p.date || (a && a.date) || testDate;
        rule = 'aggregate-chart';
      } else if (item.testDate) {
        action = 'approved';
        actionNotes = ACTION_TEXT.approved;
        rule = 'tested-aggregate';
      } else {
        action = 'test';
        highlight = true;
        actionNotes = ACTION_TEXT.test + '\n' + testCoordinationNotes(project.district, lists);
        rule = 'must-test-aggregate';
      }
    } else if (family === 'hma-mix') {
      if ((item.specs || []).includes('#401505') || (item.letterSpecs || []).includes('#401505')) {
        action = 'not-approved';
        actionNotes = ACTION_TEXT.pendingJmf;
        rule = 'pending-jmf';
      } else {
        action = 'approved';
        actionNotes = ACTION_TEXT.mixDesigns;
        rule = 'hma-mix-designs';
      }
    } else if (family === 'rcp' || family === 'precast') {
      action = 'on-file';
      actionNotes = ACTION_TEXT.stockOnFile;
      rule = 'state-inspected-stock';
    } else if (family === 'pcc') {
      action = 'approved';
      actionNotes = ACTION_TEXT.mixDesigns;
      rule = 'pcc-mix-designs';
    } else if (family === 'striping') {
      apl = true;
      const live = lists.striping && ((lists.striping.manufacturers || []).length || (lists.striping.entries || []).length);
      const hit = live
        ? Lists.lookupManufacturer(lists.striping, item.srcName)
        : matchAplList(STRIPING_APL, item.srcName, item.srcLoc, product);
      if (/zone\s*strip|pavement\s*markings?/i.test(item.srcName || '') && hit.listed !== true) {
        action = 'submit';
        actionNotes = ACTION_TEXT.submitStriping;
        rule = 'striping-subcontractor';
      } else if (hit.listed === false) {
        action = 'not-approved';
        actionNotes = ACTION_TEXT.notApproved;
        rule = 'striping-not-on-apl';
      } else {
        action = 'apl';
        actionNotes = item.srcName
          ? `${item.srcName} approved. (choose a product from the APL)`
          : ACTION_TEXT.chooseApl;
        rule = 'striping-apl';
      }
    } else if (family === 'utility') {
      action = 'approved';
      actionNotes = ACTION_TEXT.utility;
      rule = 'utility-owner';
    } else if (family === 'riprap') {
      action = 'visual';
      actionNotes = ACTION_TEXT.visual;
      rule = 'riprap-visual';
    } else if (family === 'expansion') {
      if (!item.srcName) {
        action = 'submit';
        actionNotes = ACTION_TEXT.submitExpansion;
        rule = 'expansion-submit';
      } else {
        action = 'approved';
        actionNotes = ACTION_TEXT.expansionAashto;
        rule = 'expansion-aashto';
      }
    } else if (family === 'crack-seal') {
      const live = lists.crack && lists.crack.entries && lists.crack.entries.length >= 2;
      const hit = live
        ? Lists.lookupCrack(lists.crack, item.srcName, product)
        : matchAplList(CRACK_SEAL_APL, item.srcName, item.srcLoc, product);
      if (hit.listed !== false) {
        action = 'apl';
        apl = true;
        actionNotes = ACTION_TEXT.apl;
        rule = 'crack-seal-apl';
      } else {
        action = 'approved';
        actionNotes = ACTION_TEXT.approvedBare;
      }
    } else if (family === 'curing' || family === 'apl-product' || family === 'ttc' || family === 'signs') {
      action = 'apl';
      apl = true;
      actionNotes = ACTION_TEXT.aplOn;
      if (family === 'ttc') actionNotes += '\n' + ACTION_TEXT.ttcInspect;
      rule = family + '-apl';
    } else if (family === 'seed' || family === 'landscape' && /seed/i.test(item.desc)) {
      action = 'approved';
      actionNotes = ACTION_TEXT.seed;
      rule = 'seed-table';
    } else if (family === 'topsoil') {
      action = 'visual';
      actionNotes = ACTION_TEXT.visual;
      rule = 'topsoil-visual';
    } else if (family === 'hdpe') {
      action = 'approved';
      actionNotes = /underdrain|m252/i.test(item.desc) ? ACTION_TEXT.hdpeM252 : ACTION_TEXT.hdpeM294;
      rule = 'hdpe-aashto';
    } else if (family === 'castings') {
      action = 'apl';
      apl = true;
      actionNotes = ACTION_TEXT.apl;
      rule = 'castings-apl';
    } else if (family === 'erosion') {
      action = 'approved';
      const isSuperSilt = (item.specs || []).some(s => s === '#905007');
      actionNotes = isSuperSilt ? ACTION_TEXT.approvedBare : ACTION_TEXT.conforms;
      rule = isSuperSilt ? 'super-silt-fence' : 'erosion-conforms';
    } else {
      action = 'approved';
      actionNotes = ACTION_TEXT.conforms;
      rule = 'default-conforms';
    }

    if (oneSource && !['tack', 'curing', 'expansion', 'crack-seal', 'apl-product', 'ttc', 'signs', 'striping'].includes(family)) {
      actionNotes = (actionNotes ? actionNotes + '\n' : '') + ACTION_TEXT.oneSource;
    }
    if (apl) {
      actionNotes = (actionNotes ? actionNotes + '\n' : '') + APL_FOOTNOTE;
    }

    return {
      ...item,
      action,
      actionNotes: actionNotes.trim(),
      apl,
      oneSource,
      onFile: action === 'on-file',
      highlight,
      rule,
      testDate,
      sampleId: null,
    };
  }

  function sourceKey(item) {
    return [
      cleanCompany(item.srcName).toLowerCase().replace(/\s+\d+$/, ''),
      (item.srcLoc || '').toLowerCase(),
      cleanCompany(item.altName).toLowerCase().replace(/\s+\d+$/, ''),
      (item.altLoc || '').toLowerCase(),
    ].join('|');
  }

  function canGroup(a, b) {
    if (a.family !== b.family) return false;
    if (['tack', 'curing', 'expansion', 'crack-seal', 'apl-product'].includes(a.family)) return false;
    const specsOf = (it) => [...(it.specs || []), ...(it.letterSpecs || [])];
    if (specsOf(a).includes('#401505') || specsOf(b).includes('#401505')) return false;
    if (specsOf(a).includes('#905007') || specsOf(b).includes('#905007')) return false;
    return sourceKey(a) === sourceKey(b);
  }

  function groupItems(items) {
    const groups = [];
    for (const item of items) {
      const prev = groups[groups.length - 1];
      if (prev && canGroup(prev, item)) {
        prev.specs = [...new Set([...prev.specs, ...item.specs])];
        prev.letterSpecs = [...new Set([...(prev.letterSpecs || prev.specs), ...(item.letterSpecs || item.specs)])];
        prev.specDescs = Object.assign({}, prev.specDescs, item.specDescs);
        const extraSubs = (item.subItems || []).filter(s => !(prev.subItems || []).includes(s));
        prev.subItems = [...(prev.subItems || []), ...extraSubs];
        if (item.desc && item.desc !== prev.desc && !prev.desc.includes(item.desc)) {
          // keep first catalog desc; letter prints one line per spec
        }
        prev.groupedFrom = (prev.groupedFrom || [prev.id]) .concat(item.id);
      } else {
        groups.push({ ...item });
      }
    }
    const FAMILY_ORDER = {
      borrow: 10, aggregate: 20, 'hma-mix': 30, tack: 35, 'crack-seal': 40,
      rcp: 50, riprap: 52, hdpe: 55, utility: 56, precast: 60, castings: 65,
      pcc: 70, curing: 75, expansion: 76,
      'apl-product': 80, geotextile: 85, erosion: 90, seed: 95, topsoil: 96, landscape: 97,
      striping: 98, ttc: 100, signs: 105, other: 200,
    };
    groups.sort((a, b) => {
      const fa = FAMILY_ORDER[a.family] || 150;
      const fb = FAMILY_ORDER[b.family] || 150;
      if (fa !== fb) return fa - fb;
      return String((a.letterSpecs || a.specs)[0] || '').localeCompare(String((b.letterSpecs || b.specs)[0] || ''));
    });
    return groups;
  }

  function letterSectionLines(item) {
    const specs = item.letterSpecs || item.specs;
    const specLines = specs.map((s, i) => {
      if (specs.length === 1) return `${s} - ${item.desc}`;
      // First spec gets the shared desc only when all specs share it; otherwise catalog per spec
      const cat = SPEC_CATALOG[s];
      const d = (cat && cat.desc) || (item.specDescs && item.specDescs[s]) || item.desc;
      return `${s} - ${d}`;
    });
    return specLines;
  }

  function applyWorkflow(parsed, opts) {
    const warnings = [...(parsed.warnings || [])];
    const project = { ...parsed.project };
    if (!project.docKind) project.docKind = detectDocKind(project.contract);

    const lists = (opts && opts.lists) || {};
    const prepared = parsed.items.map((raw, idx) => {
      let item = { ...raw, id: raw.id || (idx + 1) };
      item = applySpecCorrections(item, warnings);
      item = enrichDescription(item, lists);
      const src = pickLetterSource(item);
      item = { ...item, ...src };
      item = applyAction(item, project, warnings, lists);
      return item;
    });

    if (prepared.some(it => it.family === 'borrow' || it.family === 'aggregate')) {
      const n = lists.aggregate && lists.aggregate.entries ? lists.aggregate.entries.length : 0;
      if (!n) {
        warnings.push('No aggregate chart loaded — GABC/borrow default to must-be-tested. Drop the current chart on the Lists tab (or run refresh-sos-lists.bat).');
      }
    }

    const omitted = prepared.filter(shouldOmitItem);
    if (omitted.length) {
      const specs = [...new Set(omitted.flatMap(it => it.specs || []))];
      warnings.push('Omitted N/A earthwork from letter: ' + specs.join(', '));
    }
    const items = groupItems(prepared.filter(it => !shouldOmitItem(it))).map((it, i) => ({ ...it, id: i + 1 }));

    if (lists.sosDatabase && lists.sosDatabase.items && Object.keys(lists.sosDatabase.items).length) {
      const unknown = [];
      items.forEach(it => {
        (it.specs || []).forEach(s => {
          if (!/^#\d{6}$/.test(s)) return;
          if (SPEC_CATALOG[s]) return;
          if (Lists.lookupSosDatabase(lists.sosDatabase, s)) return;
          unknown.push(s);
        });
      });
      if (unknown.length) {
        warnings.push('Not in the Source of Supply Database: ' + [...new Set(unknown)].join(', '));
      }
    }

    const cc = buildCcList(project, lists, items);

    return {
      project,
      items,
      cc,
      warnings,
      ungrouped: prepared,
    };
  }

  function samplerName(district, lists) {
    return samplerForDistrict(district, lists).name;
  }

  function buildCcList(project, lists, items) {
    const people = [];
    const add = (name, org, role) => {
      const n = cellStr(name);
      if (!n) return;
      if (people.some(p => p.name.toLowerCase() === n.toLowerCase())) return;
      people.push({ id: people.length + 1, name: n, org: org || 'DelDOT', role: role || '' });
    };
    add(project && project.contact);
    if (soilStoneOnLetter(items)) {
      const s = samplerForDistrict(project && project.district, lists);
      add(s.name, 'DelDOT');
    }
    const assignments = (lists && lists.ccAssignments) || CC_ASSIGNMENT_SEEDS;
    assignments.forEach(a => {
      if (assignmentMatchesItems(a, items)) add(a.name, a.org || 'DelDOT', a.role || '');
    });
    return people;
  }

  function processGrid(rows, meta) {
    const parsed = parseSosGrid(rows, meta);
    return { parsed, ...applyWorkflow(parsed, meta || {}) };
  }

  function workbookToGrid(workbook) {
    // SheetJS workbook
    const XLSX = (typeof globalThis !== 'undefined' && globalThis.XLSX) || (typeof require === 'function' ? require('xlsx') : null);
    if (!XLSX) throw new Error('SheetJS (XLSX) is not loaded.');
    const name = workbook.SheetNames[0];
    const sheet = workbook.Sheets[name];
    return XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true, defval: '' });
  }

  function processWorkbook(workbook, meta) {
    return processGrid(workbookToGrid(workbook), meta);
  }

  function formatLongDate(iso) {
    if (!iso) return '';
    const d = new Date(iso + 'T12:00:00');
    return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  }

  function sourceLine(item) {
    let line = item.srcName || '';
    const useAddr = (item.family === 'borrow' || item.family === 'aggregate') && item.srcAddr;
    if (useAddr && item.srcLoc) {
      line += (line ? ' - ' : '') + item.srcAddr.replace(/,\s*$/, '') + ', ' + item.srcLoc;
    } else if (item.srcLoc) {
      line += (line ? ' - ' : '') + item.srcLoc;
    }
    if (item.testDate) {
      const t = item.testDate;
      const pretty = /^\d{4}-\d{2}-\d{2}$/.test(t)
        ? t.slice(5, 7).replace(/^0/, '') + '.' + t.slice(8).replace(/^0/, '') + '.' + t.slice(2, 4)
        : t;
      line += ` (tested ${pretty})`;
    }
    if (item.altName) {
      line += '\nAlt: ' + item.altName + (item.altLoc ? ' - ' + item.altLoc : '');
    }
    return line;
  }

  function letterPlainText(project, items, cc) {
    const dateStr = formatLongDate(project.date);
    const lines = [];
    if (dateStr) lines.push(dateStr);
    if (project.contractor) lines.push(project.contractor);
    (project.contractorAddr || '').split('\n').forEach(l => { if (l.trim()) lines.push(l.trim()); });
    lines.push(`The following material sources have been reviewed by this office for ${contractPhrase(project)} as to their acceptability for use on this project.`);
    items.forEach(item => {
      lines.push('SECTION: ' + letterSectionLines(item).join(' / '));
      (item.subItems || []).forEach(s => lines.push('  • ' + s));
      lines.push('SOURCE: ' + sourceLine(item).replace(/\n/g, ' | '));
      lines.push('ACTION: ' + (item.actionNotes || item.action).replace(/\n/g, ' | '));
    });
    if (cc && cc.length) lines.push('cc: ' + cc.map(c => c.name + ', ' + c.org).join('; '));
    return lines.filter(Boolean).join('\n');
  }

  return {
    cellStr,
    normalizeSpec,
    extractSpecs,
    parseSosGrid,
    parseProject,
    parseItems,
    applyWorkflow,
    processGrid,
    processWorkbook,
    workbookToGrid,
    contractPhrase,
    detectDocKind,
    formatLongDate,
    sourceLine,
    letterSectionLines,
    letterPlainText,
    familyFromSpec,
    shouldOmitItem,
    buildCcList,
    samplerName,
    isCompanyName,
    isStreet,
    isCityState,
    cleanCompany,
    matchAplList,
  };
});
