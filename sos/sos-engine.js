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
    samplerForDistrict,
    testCoordinationNotes,
    filterRetiredCcPeople,
  } = DATA;
  const Lists = LISTS || {};
  let bundledSosDb = undefined;

  const STREET_RE = /^\d+\s|\b(rd|road|ave|avenue|st\.?|street|hwy|highway|blvd|boulevard|ln|lane|dr\.?|drive|ct|court|pkwy|pike|way|circle|pl|place|po box)\b/i;
  const CITY_STATE_RE = /^([A-Za-z .'-]+),\s*([A-Z]{2})(?:\s+\d{5}(?:-\d{4})?)?$/;
  const CITY_STATE_LOOSE_RE = /^([A-Za-z .'-]+)\s+([A-Z]{2})(?:\s+\d{5})?$/;
  const PHONE_RE = /(?:\+?1[-.\s]*)?\(?\d{3}\)?[-.\s]*\d{3}[-.\s]*\d{4}|\d-\d{3}-\d{3}-\d{4}/;
  const SPEC_TOKEN_RE = /(\d{6})(?:\.\d+)?/g;

  function cellStr(v) {
    if (v == null || v === '') return '';
    if (v instanceof Date && !Number.isNaN(v.getTime())) {
      return v.toISOString().slice(0, 10);
    }
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

  function normalizeCityStateText(s) {
    return cellStr(s)
      .replace(/,\s*([A-Z]{2}),\s*(\d{5}(?:-\d{4})?)/, ', $1 $2')
      .replace(/\s+,/g, ',')
      .replace(/,\s+/g, ', ')
      .trim();
  }

  function isCityState(s) {
    const t = normalizeCityStateText(s);
    return CITY_STATE_RE.test(t) || (CITY_STATE_LOOSE_RE.test(t) && /\b[A-Z]{2}\b/.test(t) && !STREET_RE.test(t));
  }

  function isStreet(s) {
    const t = cellStr(s);
    if (!t) return false;
    if (isPhone(t) || isCityState(t)) return false;
    if (/\bp\.?\s*o\.?\s*box\b/i.test(t)) return true;
    if (!/\d/.test(t)) return false;
    return STREET_RE.test(t);
  }

  function isProductLabel(s) {
    const t = cellStr(s);
    if (!t) return false;
    if (/^(gabc|millings|topsoil|cntt|em-?50-?tt|class\s*[abc]|silencure(\s+dot)?|curlex|bituminous|concrete)$/i.test(t)) return true;
    return /superpave|tack coat|curing compound|expansion joint|erosion control blanket|ada paver|pg\s*\d{2}-\d{2}|1600[-\s]?white|subdivision mix/i.test(t);
  }

  function isCompanyName(s) {
    const t = cellStr(s);
    if (!t) return false;
    if (isPhone(t) || isCityState(t) || isStreet(t) || isProductLabel(t)) return false;
    if (/^(n\/?a|none|same|tbd|-)$/i.test(t)) return false;
    if (/^(spec(?:ification)?s?|#|item description|material|supplier|manufacturer|alternate manufacturer|address\s*&\s*contact)$/i.test(t)) return false;
    return /[A-Za-z]{3,}/.test(t);
  }

  function formatLoc(cityLine) {
    const t = normalizeCityStateText(cityLine);
    let m = t.match(CITY_STATE_RE);
    if (m) return `${m[1].trim()} ${m[2]}`;
    m = t.match(CITY_STATE_LOOSE_RE);
    if (m) return `${m[1].trim()} ${m[2]}`;
    return t.replace(/,\s*/g, ' ').replace(/\s+\d{5}(?:-\d{4})?$/, '').trim();
  }

  function splitStreetCity(s) {
    const t = normalizeCityStateText(s);
    if (!t) return [];
    const tail = t.match(/^(.*),\s*([A-Za-z .'-]+,\s*[A-Z]{2}(?:\s+\d{5}(?:-\d{4})?)?)$/);
    if (tail && (isStreet(tail[1]) || /\d/.test(tail[1]))) return [tail[1].trim(), tail[2].trim()];
    const city = t.match(/\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?),\s*([A-Z]{2})(?:\s+\d{5}(?:-\d{4})?)?\s*$/);
    if (city && isStreet(t.slice(0, city.index))) {
      return [t.slice(0, city.index).replace(/[,\s]+$/, ''), t.slice(city.index).trim()];
    }
    return [t];
  }

  function splitPackedContact(p) {
    const s = cellStr(p);
    if (!s) return [];
    const bits = s.split(/\s*[-–—]\s+/).map(x => x.trim()).filter(Boolean);
    if (bits.length < 2) return splitStreetCity(s);
    const parts = [];
    bits.forEach((bit) => {
      if (isPhone(bit)) parts.push(bit);
      else splitStreetCity(bit).forEach(x => parts.push(x));
    });
    return parts.length ? parts : [s];
  }

  function expandContactLines(val) {
    if (val == null || val === '') return [];
    const raw = String(val);
    const chunks = raw.split(/\r\n|\n|\r|\s*\|\s*/)
      .map(s => s.replace(/^\s*phone:\s*/i, '').trim())
      .filter(Boolean);
    const out = [];
    chunks.forEach((chunk) => {
      splitPackedContact(chunk).forEach((p) => {
        const t = cellStr(p);
        if (t && !out.includes(t)) out.push(t);
      });
    });
    return out.length ? out : [cellStr(val)].filter(Boolean);
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
          // "Contractor Email" is not the Contractor name field.
          if (needle === 'contractor' && /e-?mail/i.test(lower)) continue;
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

  function todayISO() {
    const d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }

  function cleanContractNo(value) {
    const raw = cellStr(value)
      .replace(/^(application|contract|state contract|agreement)\s*(no\.?)?\s*#?\s*/i, '')
      .replace(/^#\s*/, '')
      .trim();
    const packed = raw.replace(/\s+/g, '');
    const dashed = packed.match(/^T(\d{4})-(\d{3})-(\d{2})$/i);
    if (dashed) return `T${dashed[1]}-${dashed[2]}-${dashed[3]}`;
    const digits = packed.match(/^T(\d{4})(\d{3})(\d{2})$/i);
    if (digits) return `T${digits[1]}-${digits[2]}-${digits[3]}`;
    return raw;
  }

  function detectDocKind(contract) {
    const s = cleanContractNo(contract).replace(/\s+/g, '');
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
    const t = cellStr(addr);
    const parts = t.split(',').map(p => p.trim()).filter(Boolean);
    if (parts.length >= 2) {
      return { street: parts[0], citystatezip: parts.slice(1).join(', ') };
    }
    const tail = t.match(/^(.*)\s+([A-Z]{2})\s+(\d{5}(?:-\d{4})?)$/);
    if (tail) {
      const words = tail[1].trim().split(/\s+/);
      let splitAt = -1;
      for (let i = 0; i < words.length; i++) {
        if (/^(rd|road|ave|avenue|st|street|hwy|highway|blvd|boulevard|ln|lane|dr|drive|ct|court|pkwy|pike|way|circle|pl|place)$/i.test(words[i].replace(/\./g, ''))) {
          splitAt = i;
        }
      }
      if (splitAt >= 0 && splitAt < words.length - 1) {
        const street = words.slice(0, splitAt + 1).join(' ');
        const city = words.slice(splitAt + 1).join(' ');
        if (isStreet(street) && city) return { street, citystatezip: `${city}, ${tail[2]} ${tail[3]}` };
      }
    }
    return { street: t, citystatezip: '' };
  }

  function consumeContactBlock(lines) {
    const block = { name: '', addr: '', loc: '', phone: '', extras: [] };
    const expanded = [];
    (lines || []).forEach((line) => {
      expandContactLines(line).forEach((t) => { if (t && !expanded.includes(t)) expanded.push(t); });
    });
    for (const t of expanded) {
      if (!t) continue;
      if (isPhone(t)) block.phone = formatPhone(t);
      else if (isCityState(t)) block.loc = formatLoc(t);
      else if (isStreet(t)) block.addr = block.addr ? block.addr + ', ' + t : t;
      else if (isCompanyName(t) && !block.name) block.name = t.replace(/,\s*(LLC|Inc\.?|Co\.?)\s*$/i, (m) => m).replace(/\s+/g, ' ').trim();
      else if (isCompanyName(t) && block.name) block.extras.push(t);
      else if (!block.addr) block.addr = t;
      else block.extras.push(t);
    }
    if (block.name && block.extras.length) {
      const glue = block.extras.filter(x => /^(materials|company|inc\.?|llc|co\.?)$/i.test(String(x).trim()));
      if (glue.length) {
        block.name = [block.name, ...glue].join(' ').replace(/\s+/g, ' ');
        block.extras = block.extras.filter(x => !glue.includes(x));
      }
    }
    return block;
  }

  function isItemHeaderText(joined) {
    const t = String(joined || '').toLowerCase();
    if (!/item description/.test(t)) return false;
    // Match "Spec", "Specification #", and the common typo "Specfication #".
    return /\bspec(?:ification|fication)?\b/.test(t);
  }

  function isSpecHeaderCell(s) {
    const t = cellStr(s).replace(/\s+/g, ' ').trim();
    return /^(spec(?:ification|fication)?\s*#?|#)$/i.test(t);
  }

  function findHeaderRow(rows) {
    const n = Math.min(rows.length, 45);
    for (let r = 0; r < n; r++) {
      const row = rows[r] || [];
      const joined = row.map(cellStr).join(' ').toLowerCase();
      const hasSpecCell = row.some(isSpecHeaderCell);
      if (!hasSpecCell) continue;
      if (isItemHeaderText(joined)) return r;
      const next = (rows[r + 1] || []).map(cellStr).join(' ').toLowerCase();
      if (isItemHeaderText(joined + ' ' + next)) return r;
    }
    return -1;
  }

  function headerColumnLabels(rows, header) {
    const row = rows[header] || [];
    const next = rows[header + 1] || [];
    const n = Math.max(row.length, next.length, 9);
    const labels = [];
    for (let i = 0; i < n; i++) {
      labels.push((cellStr(row[i]) + ' ' + cellStr(next[i])).replace(/\s+/g, ' ').trim().toLowerCase());
    }
    return labels;
  }

  function detectItemColumns(rows, header) {
    const labels = headerColumnLabels(rows, header);
    const idx = (pred) => labels.findIndex(pred);
    const spec = idx(l => /\bspec(?:ification|fication)?\b/.test(l) && !/inspection/.test(l) && !/special provision/.test(l));
    const desc = idx(l => /item description/.test(l));
    const material = idx(l => /\bmaterial\b/.test(l) && !/requirement/.test(l) && !/item description/.test(l) && !/alternate/.test(l));
    const supplier = idx(l => /supplier/.test(l));
    const mfg = idx(l => /manufacturer/.test(l) && !/alternate/.test(l));
    let alt = idx(l => /alternate/.test(l) && /manufacturer/.test(l));
    if (alt < 0) alt = idx(l => /alternate/.test(l) && !/product/.test(l));
    const altProduct = idx(l => /alternate/.test(l) && /product/.test(l));
    if (desc >= 0 && spec >= 0) {
      return {
        spec: spec < 0 ? 0 : spec,
        desc,
        material: material < 0 ? desc + 1 : material,
        supplier: supplier < 0 ? (material < 0 ? desc + 2 : material + 1) : supplier,
        mfg: mfg < 0 ? 7 : mfg,
        alt: alt < 0 ? 8 : alt,
        altProduct: altProduct < 0 ? -1 : altProduct,
      };
    }
    return { spec: 0, desc: 2, material: 4, supplier: 5, mfg: 7, alt: 8, altProduct: -1 };
  }

  function specCellFromRow(row, cols) {
    if (looksLikeSpecStart(row[cols.spec])) return row[cols.spec];
    if (cols.spec === 0 && looksLikeSpecStart(row[1])) return row[1];
    return '';
  }

  function isColumnSubHeaderRow(row, cols) {
    const spec = cellStr(row[cols.spec]);
    const desc = cellStr(row[cols.desc]);
    const joined = (row || []).map(cellStr).join(' ').toLowerCase();
    if (/address\s*&\s*contact/.test(joined) && !specCellFromRow(row, cols)) return true;
    if (spec === '#' && !specCellFromRow(row, cols)) return true;
    if (/^specification\s*#?$/i.test(spec) && /item description/i.test(desc)) return true;
    return false;
  }

  function itemLooksComplete(current) {
    if (!current || !current.specs.length) return false;
    const lines = [...current.mfgLines, ...current.supLines, ...current.altLines];
    return lines.some(s => isPhone(s) || isCityState(s));
  }

  function rowLooksLikeCompanyStart(row, cols) {
    const first = (val) => expandContactLines(val)[0] || val;
    const named = (val) => {
      const v = first(val);
      return !(isStreet(v) || isPhone(v) || isCityState(v)) && isCompanyName(v);
    };
    return named(row[cols.mfg]) || named(row[cols.supplier]);
  }

  function isLooseProductRow(row, cols) {
    const spec = row[cols.spec];
    const specText = cellStr(spec);
    const smallNum = (typeof spec === 'number' && spec >= 0 && spec < 10) || /^(0|1)$/.test(specText);
    const blob = `${cellStr(row[cols.desc])} ${cellStr(row[cols.material])}`.toLowerCase();
    const accessory = /curing|expansion|joint sealer|1600|truncated dome|detectable warning|rubber expansion|reflex|silencure/.test(blob);
    if (accessory && !specCellFromRow(row, cols) && (cellStr(row[cols.material]) || cellStr(row[cols.mfg]))) return true;
    if (!smallNum) return false;
    return accessory;
  }

  function currentLooksLikeProduct(current) {
    if (!current) return false;
    const blob = `${cellStr((current.descLines || [])[0])} ${cellStr((current.materialLines || [])[0])}`.toLowerCase();
    return /curing|expansion|joint sealer|1600|truncated dome|rubber expansion|reflex/.test(blob);
  }

  function bulkShareFamilies(a, b) {
    const share = new Set(['aggregate', 'borrow', 'topsoil', 'landscape', 'pcc', 'precast', 'utility', 'riprap']);
    return share.has(a) && share.has(b);
  }

  function plantKeysFromLines(lines) {
    return (lines || [])
      .map(cellStr)
      .filter(t => t && isCompanyName(t) && !isStreet(t) && !isCityState(t) && !isPhone(t))
      .map(plantCompanyKey)
      .filter(Boolean);
  }

  function sameBulkCompany(current, row, cols) {
    if (!current) return false;
    const incoming = plantKeysFromLines([row[cols.supplier], row[cols.mfg], row[cols.alt]]);
    if (!incoming.length) return true;
    const existing = plantKeysFromLines([...(current.supLines || []), ...(current.mfgLines || []), ...(current.altLines || [])]);
    if (!existing.length) return true;
    return incoming.some(n => existing.some(e => e === n || e.includes(n) || n.includes(e)));
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
    const addrRaw = addr.replace(/^Address:\s*/i, '').trim();
    const addrParts = splitAddress(addrRaw);
    const contractorAddr = [addrParts.street, addrParts.citystatezip].filter(Boolean).join('\n');
    const contractNo = cleanContractNo(contract.replace(/^.*?:\s*/, '').trim());

    return {
      contract: contractNo,
      title: title.replace(/^Title of Contract:\s*/i, '').trim(),
      contractor,
      contractorAddr,
      contractorAddrRaw: addrRaw,
      contractorEmail: email,
      subContractor: sub.replace(/^n\/?a$/i, ''),
      district: district.replace(/^District:\s*/i, '').trim(),
      contact: contact.replace(/^DelDOT Contact:\s*/i, '').trim(),
      date: todayISO(),
      submittedDate: parseDateToISO(dateRaw),
      docKind: detectDocKind(contractNo),
    };
  }

  function noteRowSpecDescs(current, row, cols) {
    if (!current) return;
    current.specDescs = current.specDescs || {};
    const d = cellStr(row[cols.desc]);
    if (!d) return;
    const specs = specCellFromRow(row, cols) ? extractSpecs(specCellFromRow(row, cols)) : [];
    if (specs.length) {
      specs.forEach(s => { current.specDescs[s] = d; });
      return;
    }
    const last = (current.specs || [])[(current.specs || []).length - 1];
    if (last && !current.specDescs[last]) current.specDescs[last] = d;
  }

  function pushLine(bucket, val) {
    const t = cellStr(val);
    if (t) bucket.push(t);
  }

  function parseItems(rows) {
    const header = findHeaderRow(rows);
    if (header < 0) return { items: [], warnings: ['Could not find Specification # header row.'] };
    const cols = detectItemColumns(rows, header);
    const warnings = [];
    const items = [];
    let current = null;

    const addSpecEntry = (row) => {
      if (!current) return;
      const specCell = specCellFromRow(row, cols);
      const specs = specCell ? extractSpecs(specCell) : [];
      if (!specs.length) return;
      const desc = cellStr(row[cols.desc]);
      const material = cellStr(row[cols.material]);
      const specDescs = {};
      if (desc) specs.forEach(s => { specDescs[s] = desc; });
      current.specEntries.push({
        specs,
        desc,
        material,
        materialLines: material ? [material] : [],
        specDescs,
      });
    };

    const appendToLastSpec = (row) => {
      const last = current && current.specEntries && current.specEntries[current.specEntries.length - 1];
      if (!last) return;
      const mat = cellStr(row[cols.material]);
      const desc = cellStr(row[cols.desc]);
      if (mat) last.materialLines.push(mat);
      if (desc && !last.desc) last.desc = desc;
    };

    const startItem = (row, inherit) => {
      const specCell = specCellFromRow(row, cols);
      const contactContinues = (val) => {
        const first = expandContactLines(val)[0];
        if (!first) return true;
        if (isProductLabel(first)) return false;
        if (isCompanyName(first) && !isStreet(first) && !isPhone(first) && !isCityState(first)) return false;
        return isStreet(first) || isPhone(first) || isCityState(first);
      };
      const take = (col, prev) => {
        const expanded = expandContactLines(row[col]);
        if (inherit && prev && prev.length && contactContinues(row[col])) {
          return prev.concat(expanded);
        }
        return expanded;
      };
      current = {
        specs: specCell ? extractSpecs(specCell) : [],
        descLines: [row[cols.desc]],
        materialLines: [row[cols.material]],
        supLines: take(cols.supplier, inherit && inherit.supLines),
        mfgLines: take(cols.mfg, inherit && inherit.mfgLines),
        altLines: take(cols.alt, inherit && inherit.altLines),
        altProductLines: cols.altProduct >= 0 ? expandContactLines(row[cols.altProduct]).filter(isProductLabel) : [],
        specDescs: {},
        specEntries: [],
      };
      noteRowSpecDescs(current, row, cols);
      addSpecEntry(row);
    };

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

      const allMaterialLines = [...new Set(current.materialLines.map(cellStr).filter(Boolean))];
      const joinedDesc = current.descLines.map(cellStr).filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
      const genericMaterial = /^(hot applied|sealant|tack coat|gabc|crusher run|graded aggregate)/i;
      const productish = (s) => /\d/.test(s) || (!genericMaterial.test(s) && s.length < 48);
      const preferredFrom = (lines, fallback) =>
        [...lines].reverse().find(productish) || lines[lines.length - 1] || fallback;
      const primaryName = mfg.name || sup.name;
      const altName = alt.name || (!alt.addr && !alt.loc ? '' : '');
      const altProduct = (current.altProductLines || []).map(cellStr).filter(isProductLabel)[0] || '';
      const contact = {
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
        altProduct,
      };

      // Compact contractor lists often stack GABC / RAP / topsoil (or Superpave C then B)
      // in one contact block with no blank row. Keep collecting until the plant city/phone
      // arrives, then emit one item per spec so each SECTION keeps its own ACTION.
      const entries = (current.specEntries && current.specEntries.length)
        ? current.specEntries
        : [{
          specs: current.specs,
          desc: joinedDesc,
          material: preferredFrom(allMaterialLines, joinedDesc),
          specDescs: current.specDescs || {},
        }];

      entries.forEach((entry) => {
        const desc = (entry.desc || joinedDesc).replace(/\s+/g, ' ').trim();
        const materialLines = (entry.materialLines && entry.materialLines.length)
          ? [...new Set(entry.materialLines.map(cellStr).filter(Boolean))]
          : (entry.material ? [...new Set([entry.material].filter(Boolean))] : allMaterialLines);
        const preferredMaterial = preferredFrom(materialLines, desc);
        const subItems = materialLines.filter(s => s.toLowerCase() !== desc.toLowerCase());
        items.push({
          specs: (entry.specs && entry.specs.length) ? entry.specs : current.specs,
          desc,
          material: preferredMaterial,
          subItems,
          // producer (mfg) vs distributor (supplier)
          ...contact,
          specDescs: Object.assign({}, current.specDescs || {}, entry.specDescs || {}),
          raw: current,
        });
      });
      current = null;
    };

    for (let r = header + 1; r < rows.length; r++) {
      const row = rows[r] || [];
      if (isColumnSubHeaderRow(row, cols)) continue;
      const specCell = specCellFromRow(row, cols);
      const empty = row.every(c => cellStr(c) === '');
      if (empty) {
        let next = null;
        for (let n = r + 1; n < rows.length; n++) {
          if ((rows[n] || []).some(c => cellStr(c) !== '')) { next = rows[n]; break; }
        }
        if (current && next && isLooseProductRow(next, cols) && !specCellFromRow(next, cols)) {
          continue;
        }
        flush();
        continue;
      }
      const specNums = specCell ? extractSpecs(specCell) : [];
      const productRow = isLooseProductRow(row, cols);
      const incomingFam = familyFromSpec(
        specNums[0] || '',
        cellStr(row[cols.desc]),
        cellStr(row[cols.material])
      );
      const currentFam = current
        ? familyFromSpec(
          (current.specs || [])[0] || '',
          cellStr((current.descLines || [])[0]),
          cellStr((current.materialLines || [])[0])
        )
        : '';
      const familyBreak = !!(current && ((current.specs || []).length || currentLooksLikeProduct(current) || currentFam === 'pcc')
        && (specNums.length || productRow)
        && incomingFam && currentFam
        && incomingFam !== currentFam && !bulkShareFamilies(incomingFam, currentFam));
      const newSpec = !!(current && specNums.length && specNums.some(s => !(current.specs || []).includes(s)));
      const companyStart = rowLooksLikeCompanyStart(row, cols);
      const keepBulk = current && bulkShareFamilies(currentFam || incomingFam, incomingFam || currentFam)
        && sameBulkCompany(current, row, cols);
      const accessoryIncoming = incomingFam === 'expansion' || incomingFam === 'curing';
      const restart = current && (
        familyBreak
        || (itemLooksComplete(current) && (specCell || companyStart || productRow) && !keepBulk)
      );
      if (!current || restart) {
        const prevSpecs = current ? (current.specs || []).slice() : [];
        const pendingPcc = current && !prevSpecs.length && currentFam === 'pcc' && specNums.length;
        if (pendingPcc) {
          current.specs = specNums.slice();
          const d = current.descLines.map(cellStr).filter(Boolean).join(' ');
          specNums.forEach(s => { if (d && !current.specDescs[s]) current.specDescs[s] = d; });
        }
        let inherit = null;
        if (current && restart && newSpec && !companyStart) {
          inherit = {
            supLines: current.supLines.slice(),
            mfgLines: current.mfgLines.slice(),
            altLines: current.altLines.slice(),
          };
        }
        if (current) {
          const junk = !(current.specs || []).length
            && /item description/i.test(cellStr((current.descLines || [])[0]));
          if (junk) current = null;
          else flush();
        }
        startItem(row, inherit);
        if (current && !specNums.length && accessoryIncoming && prevSpecs.length
            && (currentFam === 'pcc' || currentFam === 'expansion' || currentFam === 'curing')) {
          current.specs = [...new Set([...(current.specs || []), ...prevSpecs])];
        }
        continue;
      }
      if (specCell) {
        current.specs = [...new Set([...current.specs, ...extractSpecs(specCell)])];
        addSpecEntry(row);
      } else {
        appendToLastSpec(row);
      }
      noteRowSpecDescs(current, row, cols);
      pushLine(current.descLines, row[cols.desc]);
      pushLine(current.materialLines, row[cols.material]);
      expandContactLines(row[cols.supplier]).forEach(t => pushLine(current.supLines, t));
      expandContactLines(row[cols.mfg]).forEach(t => pushLine(current.mfgLines, t));
      expandContactLines(row[cols.alt]).forEach(t => pushLine(current.altLines, t));
      if (cols.altProduct >= 0) {
        expandContactLines(row[cols.altProduct]).filter(isProductLabel).forEach(t => {
          current.altProductLines = current.altProductLines || [];
          pushLine(current.altProductLines, t);
        });
      }
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
    const addrFlag = contractorAddressFlag(project);
    if (addrFlag) warnings.push(addrFlag);
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
    if (cat && cat.desc) return letterizeDesc(cat.desc);
    if (typeof SOS_SPEC_LETTER_DESCS !== 'undefined' && SOS_SPEC_LETTER_DESCS && SOS_SPEC_LETTER_DESCS[spec]) {
      return letterizeDesc(SOS_SPEC_LETTER_DESCS[spec].desc);
    }
    const hit = Lists.lookupSosDatabase && Lists.lookupSosDatabase(lists && lists.sosDatabase, spec);
    return hit && hit.desc ? letterizeDesc(hit.desc) : '';
  }

  function letterizeDesc(d) {
    return String(d || '').replace(/\s*\(CAST IN PLACE\)\s*/gi, '').replace(/\s+/g, ' ').trim();
  }

  function isGenericMaterialBullet(s) {
    const t = String(s || '').replace(/\*+$/, '').replace(/\s+/g, ' ').trim();
    if (!t) return true;
    return /class\s*[abc]/i.test(t) || /^(class\s*[abc]\s*concrete|pcc(\s*,?\s*class\s*[abc])?|precast(\s+concrete)?|concrete|granite gneiss)$/i.test(t);
  }

  function specLetterDesc(item, spec) {
    const cat = lookupCatalogDesc(spec, {});
    if (cat) return cat;
    if (item && item.specDescs && item.specDescs[spec]) return letterizeDesc(item.specDescs[spec]);
    return '';
  }

  function familyFromSpec(spec, desc, material, lists, extra) {
    const extraBlob = Array.isArray(extra) ? extra.join(' ') : (extra || '');
    const mat = `${material || ''} ${extraBlob}`.toLowerCase();
    const blob = `${desc || ''} ${mat}`.toLowerCase();
    const prefix = (spec || '').replace('#', '').slice(0, 3);
    if (isTack(desc, material, spec)) return 'tack';
    // Contractor forms list expansion / curing under the parent 701/705 spec numbers.
    // The material column is the product; do not keep those rows as PCC curb/sidewalk.
    if (/reflex|\brubber expansion\b|preformed expansion|expansion joint material/.test(mat)
        && !/class\s*[abc]\s*concrete/.test(mat) && !/class\s*[abc]/.test(mat)) return 'expansion';
    if (/curing compound|pigmented curing|1600[-\s]?white|silencure/.test(mat)) return 'curing';
    if (/expansion/.test(blob) && !/crack\s*(and\s*)?joint|joint sealing/.test(blob) && !/pcc|sidewalk|curb/.test(blob)) return 'expansion';
    if (/curing/.test(blob) && !/pcc|sidewalk|curb/.test(blob)) return 'curing';
    // Ready-mix Class B used to adjust inlets / sanitary / gas valves is PCC, not a precast product.
    if (/class\s*[abc]/.test(mat) && /concrete/.test(mat) && !/precast/.test(mat)
        && (!prefix || /^(602|701|702|705|710|711)$/.test(prefix))) {
      return 'pcc';
    }
    const cat = SPEC_CATALOG[spec];
    if (cat) return cat.family;
    if (/tie bar|dowel bar|contraction basket|stake pin|anchoring adhesive|redhead|welded hook/.test(blob)) return 'hardware';
    if (/millings|recycled asphalt pavement/.test(blob) && !/superpave|stone matrix|sma\b|wearing surface/.test(blob)) return 'aggregate';
    if (/channel bed|\bcbf\b|cbf light/.test(blob)) return 'aggregate';
    if (/rip\s*rap/.test(blob) && !/geotextile/.test(blob)) return 'riprap';
    if (/pavement strip|thermoplastic|epoxy resin|alkyd-thermoplastic|straight arrow|line striping/.test(blob)) return 'striping';
    if (/tack/.test(blob)) return 'tack';
    if (/superpave|hot mix|hma|pg\s*\d{2}/.test(blob)) return 'hma-mix';
    if (/borrow|backfill/.test(blob)) return 'borrow';
    if (/gabc|crusher run|graded aggregate|no\.?\s*57|no\.?\s*3 stone|#57|#3 stone/.test(blob)) return 'aggregate';
    if (/rcp|reinforced concrete pipe|flared end|storm conveyance pipe/.test(blob)) return 'rcp';
    if (/drainage inlet|manhole/.test(blob) && /grate|frame|cover/.test(blob)) return 'castings';
    if (/drainage inlet|manhole|precast/.test(blob)) return 'precast';
    if (/sidewalk|curb|pcc /.test(blob)) return 'pcc';
    if (/seed/.test(blob)) return 'seed';
    if (/topsoil/.test(blob)) return 'topsoil';
    if (/geotextile/.test(blob)) return 'geotextile';
    if (/silt fence|erosion|inlet sediment|filter log/.test(blob)) return 'erosion';
    if (/crack|joint seal/.test(blob)) return 'crack-seal';
    if (/sign|barricade|attenuator|traffic/.test(blob) && prefix !== '817' && prefix !== '861' && prefix !== '862') return 'ttc';
    const byPrefix = {
      '207': 'borrow', '209': 'borrow',
      '301': 'aggregate', '302': 'aggregate',
      '401': 'hma-mix', '404': 'crack-seal', '504': 'crack-seal',
      '503': 'pcc',
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
    if (prefix === '707' && /channel bed|\bcbf\b/.test(blob)) return 'aggregate';
    if (byPrefix[prefix]) return byPrefix[prefix];
    if (/pipe|hdpe|\bads\b/.test(blob)) return 'hdpe';
    const hit = Lists.lookupSosDatabase && Lists.lookupSosDatabase(lists && lists.sosDatabase, spec);
    const fromDb = familyFromDbHit(hit);
    if (fromDb === 'apl-product' && /817|861|862/.test(prefix)) return 'striping';
    if (fromDb) return fromDb;
    return 'other';
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

  function letterizePlantName(name) {
    const n = cleanCompany(name);
    if (!n) return '';
    if (/^bear concrete\b/i.test(n)) return n.replace(/^bear concrete/i, 'Bear Materials');
    if (/^geo[-\s]?tech\b/i.test(n)) return 'Geo Tech';
    if (/\bj\s*d\s*russell\b/i.test(n)) return 'JD Russell';
    if (/^w[.\s-]*r[.\s-]*meadows$/i.test(n)) return 'WR Meadows';
    return n;
  }

  function plantCompanyKey(name) {
    return letterizePlantName(name).toLowerCase();
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
    if (catalogDescs.length) desc = catalogDescs[0];
    else desc = (item.desc || '').replace(/\s+/g, ' ').trim().toUpperCase();

    const family = familyFromSpec(item.specs[0], item.desc, item.material, lists, item.subItems);
    let sectionDesc = desc;
    const crushBlob = `${item.desc || ''} ${item.material || ''} ${(item.subItems || []).join(' ')}`;
    if (family === 'aggregate') {
      if (/crushed concrete|recycled concrete|\brca\b/i.test(crushBlob) && !/crusher run/i.test(crushBlob)) {
        sectionDesc = 'GABC (CRUSHED CONCRETE)';
      } else if (/crusher run/i.test(crushBlob)) {
        sectionDesc = 'GABC (CRUSHER RUN)';
      } else if ((item.specs || []).includes('#301003')) {
        sectionDesc = 'GABC';
      }
    }
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
      const products = [bullet.replace(/\s+/g, ' ').trim() + '*'];
      const altP = String(item.altProduct || '').replace(/®/g, '').trim();
      if (altP) {
        let altBullet = altP.replace(/em-?50-?tt/i, 'EM-50-TT');
        if (!/tack/i.test(altBullet)) altBullet = `${altBullet} Tack Coat`;
        const labeled = altBullet.replace(/\s+/g, ' ').trim() + '* (Alt)';
        if (!products.some(p => p.toLowerCase().replace(/[^a-z0-9]/g, '') === labeled.toLowerCase().replace(/[^a-z0-9]/g, ''))) {
          products.push(labeled);
        }
      }
      subItems = products;
    } else if (family === 'curing') {
      letterSpecs = ['#701/705xxx'];
      sectionDesc = 'CONCRETE ITEMS';
      const named = [...(item.subItems || []), item.material, item.desc]
        .filter(Boolean)
        .find(s => /1600|white pigmented|silencure|thinfilm/i.test(s));
      const primaryCure = (named || item.material || item.desc || 'Curing Compound').replace(/\s+/g, ' ').trim();
      let cureLabel = primaryCure;
      if (/silencure/i.test(cureLabel) && !/curing/i.test(cureLabel)) cureLabel = 'Silencure DOT Curing Compound';
      subItems = [cureLabel + '*'];
      const altCure = String(item.altProduct || '').replace(/®/g, '').trim();
      if (altCure && !new RegExp(primaryCure.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i').test(altCure)) {
        let altNamed = altCure;
        if (/1600/i.test(altNamed) && !/curing/i.test(altNamed)) altNamed = '1600 White Curing Compound';
        subItems.push(altNamed.replace(/\s+/g, ' ').trim() + '*');
      }
    } else if (family === 'expansion') {
      letterSpecs = ['#701/705xxx'];
      sectionDesc = 'CONCRETE ITEMS';
      const named = [...(item.subItems || []), item.material, item.desc]
        .filter(Boolean)
        .find(s => /reflex|rubber expansion|preformed/i.test(s));
      let product = (named || item.material || item.desc || 'Expansion').replace(/\s+/g, ' ').trim();
      if (/reflex|re-?flex/i.test((item.srcName || '') + ' ' + (item.mfgName || '') + ' ' + product)
          && !/reflex rubber expansion/i.test(product)) {
        product = 'Reflex Rubber Expansion';
      }
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
    if (family === 'apl-product' && /truncated dome/i.test(sectionDesc)) {
      subItems = subItems.filter(s => !/^(ada\s+)?truncated domes?$/i.test(s));
      if (sectionDesc && !/\*$/.test(sectionDesc)) sectionDesc += '*';
    }
    if (family === 'apl-product' && /erosion control blanket/i.test(sectionDesc)) {
      const primary = (item.material || '').replace(/®/g, '').replace(/\s+/g, ' ').trim();
      const altP = String(item.altProduct || '').replace(/®/g, '').replace(/\s+/g, ' ').trim();
      const bullets = [];
      if (primary && !/erosion control blanket mulch/i.test(primary)) {
        let p = primary.replace(/\s*north american green\s*/i, ' ').trim();
        if (/sc\s*150\s*bn/i.test(p)) p = 'SC150BN';
        bullets.push(p + '*');
      }
      if (altP) {
        let a = altP.replace(/\s*erosion control blanket\s*/i, ' ').trim() || altP;
        if (/curlex/i.test(a)) a = 'Curlex (alt)';
        bullets.push(a);
      }
      if (bullets.length) subItems = bullets;
      if (sectionDesc && !/\*$/.test(sectionDesc)) sectionDesc += '*';
    }
    if (['rcp', 'precast', 'pcc', 'aggregate'].includes(family)) {
      subItems = subItems.filter(s => !isGenericMaterialBullet(s));
    }
    if (family === 'hma-mix') {
      subItems = subItems.filter(s => !/^(bituminous|concrete|asphalt|superpave.*)$/i.test(s));
    }
    if (family === 'aggregate') {
      subItems = subItems.filter(s => !/^(gabc(\s*[-–]\s*crushed concrete)?|millings|crushed concrete|recycled asphalt pavement)$/i.test(s));
    }
    if (family === 'topsoil') {
      subItems = subItems.filter(s => !/^topsoil\b/i.test(s));
    }
    const specDescs = Object.assign({}, item.specDescs || {});
    (item.specs || []).forEach(s => {
      specDescs[s] = lookupCatalogDesc(s, lists)
        || letterizeDesc((item.specDescs && item.specDescs[s]) || '')
        || ((item.specs || []).length === 1 ? letterizeDesc(item.desc) : '');
    });
    return { ...item, family, desc: sectionDesc, letterSpecs, subItems, specDescs };
  }

  function familyLabel(fam) {
    return {
      'hma-mix': 'hot mix / Superpave',
      tack: 'tack coat',
      aggregate: 'GABC / aggregate',
      borrow: 'borrow',
      pcc: 'PCC',
      precast: 'precast',
      rcp: 'RCP',
      curing: 'curing compound',
      expansion: 'expansion joint',
      'crack-seal': 'crack seal',
      seed: 'seed',
      topsoil: 'topsoil',
      striping: 'striping',
      hardware: 'hardware',
      'apl-product': 'APL product',
      erosion: 'erosion control',
      geotextile: 'geotextile',
      landscape: 'landscape',
      riprap: 'riprap',
      hdpe: 'HDPE pipe',
      utility: 'utility',
      ttc: 'temporary traffic control',
      signs: 'signs',
      castings: 'castings',
      other: 'other',
    }[fam] || fam || 'unknown';
  }

  function familiesCompatible(catalogFam, textFam) {
    if (!catalogFam || !textFam || catalogFam === textFam) return true;
    if (textFam === 'other' || catalogFam === 'other') return true;
    const stacked = { expansion: 1, curing: 1, hardware: 1 };
    if ((catalogFam === 'pcc' || catalogFam === 'precast' || catalogFam === 'rcp') && stacked[textFam]) return true;
    if (catalogFam === 'precast' && textFam === 'pcc') return true;
    if (catalogFam === 'pcc' && textFam === 'precast') return true;
    if (catalogFam === 'apl-product' && (textFam === 'erosion' || textFam === 'landscape' || textFam === 'pcc')) return true;
    if ((catalogFam === 'landscape' || catalogFam === 'erosion') && textFam === 'apl-product') return true;
    return false;
  }

  function isPlaceholderSpec(spec) {
    const s = String(spec || '');
    return /xxx/i.test(s) || /701\/705/i.test(s);
  }

  function bundledSosDatabase() {
    if (bundledSosDb !== undefined) return bundledSosDb;
    bundledSosDb = null;
    try {
      if (typeof require === 'function') bundledSosDb = require('./lists/sos-database-snapshot.json');
    } catch (e) {
      bundledSosDb = null;
    }
    return bundledSosDb;
  }

  function specDatabase(lists) {
    const db = lists && lists.sosDatabase;
    if (db && db.items && Object.keys(db.items).length) return db;
    return bundledSosDatabase();
  }

  function isKnownItemNumber(spec, lists) {
    if (!spec || isPlaceholderSpec(spec)) return true;
    const key = String(spec).replace(/^([^#])/, '#$1');
    const digits = key.replace(/\D/g, '');
    if (digits.length !== 6) return true;
    if (SPEC_CATALOG[key] || SPEC_CATALOG['#' + digits] || SPEC_CATALOG[digits]) return true;
    if (lookupCatalogDesc(key, lists)) return true;
    const db = specDatabase(lists);
    if (Lists.lookupSosDatabase && Lists.lookupSosDatabase(db, key)) return true;
    return false;
  }

  function isWeakSourceName(name) {
    const n = cellStr(name);
    if (!n) return true;
    if (isStreet(n) || isCityState(n) || isProductLabel(n) || isPhone(n)) return true;
    return /^(n\/?a|none|same|tbd|-)$/i.test(n);
  }

  function locLooksInvalid(loc) {
    const t = cellStr(loc);
    if (!t) return false;
    if (isCityState(t)) return false;
    if (isStreet(t)) return true;
    if (/^[A-Za-z .'-]{3,}$/.test(t)) return false;
    if (/^[^,]+,\s*[A-Z]{2}\b/i.test(t)) return false;
    return /[^A-Za-z0-9 ,.'#/-]/.test(t) || /\d{6,}/.test(t);
  }

  function contractorAddressFlag(project) {
    const raw = cellStr(project && (project.contractorAddrRaw || project.contractorAddr));
    if (!raw || /^(n\/?a|none|-)$/i.test(raw)) return '';
    const lines = raw.split(/\n/).map(s => s.trim()).filter(Boolean);
    const last = lines[lines.length - 1] || '';
    const joined = lines.join(', ');
    if (isCityState(last) || isCityState(joined)) return '';
    const parts = splitAddress(joined);
    if (parts.citystatezip && (isStreet(parts.street) || /\d/.test(parts.street))) return '';
    if (lines.length >= 2 && isStreet(lines[0]) && /^[A-Za-z .'-]{3,}$/.test(last)) return '';
    return 'Contractor address looks incomplete or invalid: "' + raw.replace(/\s+/g, ' ') + '"';
  }

  function noteChartLocationMismatch(item, primary, altHit) {
    const note = (hit, name, loc) => {
      if (!hit || hit.found || hit.reason !== 'location-mismatch') return;
      const who = [name, loc].filter(Boolean).join(' — ');
      const locs = [...new Set((hit.matches || []).map(m => m.loc).filter(Boolean))];
      item.chartLocationMismatch = {
        who,
        chartLocs: locs,
      };
    };
    note(primary, item.srcName, item.srcLoc);
    if (!item.chartLocationMismatch) note(altHit, item.altName, item.altLoc);
  }

  function collectItemReviewFlags(item, lists) {
    const flags = [];
    const formSpecs = (item.formSpecs && item.formSpecs.length) ? item.formSpecs : (item.specs || []);
    const formDesc = cellStr(item.formDesc || '');
    formSpecs.forEach((spec) => {
      if (!/^#\d{6}$/.test(spec)) return;
      if (!isKnownItemNumber(spec, lists)) {
        flags.push('Item number ' + spec + ' is not in the DelDOT catalog.');
      }
    });
    formSpecs.forEach((spec) => {
      if (!/^#\d{6}$/.test(spec) || !isKnownItemNumber(spec, lists)) return;
      const cat = SPEC_CATALOG[spec] || SPEC_CATALOG[spec.replace(/^#/, '')];
      if (!cat || !cat.family) return;
      const textFam = familyFromSpec('', formDesc, item.formMaterial || item.material, lists, item.formSubItems || item.subItems);
      if (familiesCompatible(cat.family, textFam)) return;
      const shown = formDesc || (item.material || 'this description');
      flags.push(
        spec + ' is ' + (cat.desc || familyLabel(cat.family))
        + ', not "' + shown + '" — that description looks like ' + familyLabel(textFam)
        + '. Letter still lists the row; confirm the item number.'
      );
    });
    const manufactured = ['tack', 'crack-seal', 'curing', 'expansion', 'apl-product', 'ttc', 'signs', 'castings', 'striping', 'hardware', 'seed'];
    if (manufactured.includes(item.family) && isWeakSourceName(item.srcName)) {
      const spec = (item.letterSpecs || item.specs || [])[0] || 'this item';
      flags.push('No manufacturer listed for ' + spec + ' (' + (item.desc || item.family) + ').');
    }
    if (locLooksInvalid(item.srcLoc)) {
      flags.push('SOURCE city/state looks invalid: "' + item.srcLoc + '"');
    }
    if (locLooksInvalid(item.altLoc)) {
      flags.push('Alternate SOURCE city/state looks invalid: "' + item.altLoc + '"');
    }
    if (item.chartLocationMismatch) {
      const miss = item.chartLocationMismatch;
      const where = miss.chartLocs && miss.chartLocs.length
        ? ' (chart has ' + miss.chartLocs.join(', ') + ')'
        : '';
      flags.push('Plant city does not match the aggregate chart: ' + miss.who + where + '.');
    }
    return [...new Set(flags)];
  }

  function pickLetterSource(item) {
    // APL / manufactured products: manufacturer is the SOURCE.
    // Bulk plants: supplier name + plant city from manufacturer address column.
    const manufactured = ['tack', 'crack-seal', 'curing', 'expansion', 'apl-product', 'ttc', 'signs', 'castings', 'striping', 'hardware', 'seed'].includes(item.family);
    if (manufactured && item.mfgName && !isCityState(item.mfgName)) {
      let altName = letterizePlantName(item.altMfgName || item.altName);
      const srcName = letterizePlantName(item.mfgName);
      if (altName && srcName && altName.toLowerCase() === srcName.toLowerCase()
          && (!item.altLoc || formatLoc(item.altLoc) === formatLoc(item.mfgLoc || item.srcLoc))) {
        altName = '';
      }
      return {
        srcName,
        srcLoc: item.mfgLoc || item.srcLoc,
        srcAddr: item.mfgAddr,
        srcPhone: item.mfgPhone,
        altName,
        altLoc: altName ? item.altLoc : '',
        altAddr: altName ? item.altAddr : '',
        altPhone: altName ? item.altPhone : '',
      };
    }
    const supplier = letterizePlantName(item.supplierName);
    const mfg = letterizePlantName(item.mfgName);
    let srcName = supplier || mfg || letterizePlantName(item.srcName);
    if (mfg && supplier && mfg.toLowerCase().includes(supplier.toLowerCase()) && mfg.length > supplier.length) {
      srcName = mfg;
    } else if (supplier && mfg && supplier.toLowerCase().includes(mfg.toLowerCase()) && supplier.length > mfg.length) {
      srcName = supplier;
    }
    const altIsSameCompany = !item.altMfgName && (item.altLoc || item.altAddr);
    let altName = letterizePlantName(item.altMfgName || (altIsSameCompany ? srcName : item.altName));
    let numbered = false;
    if (altIsSameCompany && srcName && (item.mfgLoc || item.srcLoc) && item.altLoc &&
        formatLoc(item.mfgLoc || item.srcLoc) !== formatLoc(item.altLoc)) {
      numbered = true;
    }
    const sameAlt = altName && srcName && altName.toLowerCase() === srcName.toLowerCase();
    const altLoc = item.altLoc;
    if (sameAlt && (!altLoc || formatLoc(altLoc) === formatLoc(item.mfgLoc || item.srcLoc || item.supplierLoc))) {
      altName = '';
    }
    return {
      srcName: numbered ? `${srcName} 1` : srcName,
      srcLoc: item.mfgLoc || item.srcLoc || item.supplierLoc,
      srcAddr: item.mfgAddr || item.srcAddr || item.supplierAddr,
      srcPhone: item.mfgPhone || item.srcPhone || item.supplierPhone,
      altName: numbered ? `${srcName} 2` : altName,
      altLoc: altName || numbered ? altLoc : '',
      altAddr: item.altAddr,
      altPhone: item.altPhone,
    };
  }

  function recoverStripingSource(item) {
    if (item.family !== 'striping') return item;
    const blob = [
      item.srcName, item.mfgName, item.desc, item.material,
      item.mfgAddr, item.srcAddr, item.srcLoc, item.mfgLoc,
      ...(item.subItems || []),
    ].join(' ');
    if (!/ennis|flint|flynt|piedmont/i.test(blob)) return item;
    if (/ennis[\s-]*fl[iy]nt/i.test(item.srcName || '')) return item;
    return {
      ...item,
      srcName: 'Ennis Flint',
      srcLoc: /greensboro/i.test(item.srcLoc || item.mfgLoc || '')
        ? (item.srcLoc || item.mfgLoc)
        : 'Greensboro NC',
    };
  }

  function chartSourceFill(item, hit) {
    if (!hit || !hit.found || !hit.row) return {};
    const row = hit.row;
    const name = String(item.srcName || '').trim();
    const weak = !name || isCityState(name) || !/[A-Za-z]{4,}/.test(name.replace(/\s+[A-Z]{2}\s*$/, ''));
    const out = {};
    if (hit.testDate) out.testDate = hit.testDate;
    const plant = String(row.name || '').split(/\s[-–—]\s+/)[0].trim();
    const fold = Lists.foldName || (s => String(s || '').toLowerCase());
    if (plant && name && fold(plant) === fold(name)) out.srcName = plant;
    if (!weak) return out;
    let srcName = plant || name;
    if (row.source) {
      const quarry = String(row.source).replace(/^York\s+/i, '').trim();
      if (quarry && !new RegExp(quarry.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i').test(srcName)) {
        srcName += ` (${quarry} Stockpile)`;
      }
    }
    if (srcName) out.srcName = srcName;
    if (!item.srcLoc && row.loc) out.srcLoc = row.loc;
    return out;
  }

  function lookupHarvestedLanguage(language, item) {
    if (!language || !language.bySpec) return null;
    const specs = [...(item.specs || []), ...(item.letterSpecs || [])];
    for (const raw of specs) {
      const key = String(raw || '').toUpperCase().replace(/^([^#])/, '#$1');
      const hit = language.bySpec[key];
      if (hit && hit.action) return hit;
    }
    const fam = language.byFamily && language.byFamily[item.family];
    if (fam && fam.action && (fam.uses || 0) >= 2) return fam;
    return null;
  }

  function applyHarvestedLanguage(item, action, actionNotes, rule, lists) {
    const hit = lookupHarvestedLanguage(lists && lists.language, item);
    if (!hit || !hit.action) return { action, actionNotes, rule };
    if (action === 'test' || action === 'not-approved' || action === 'submit') {
      return { action, actionNotes, rule };
    }
    const gap = rule === 'default-conforms' || item.family === 'other';
    if (gap) {
      let next = action;
      if (hit.intent === 'test') next = 'test';
      else if (hit.intent === 'not-approved') next = 'not-approved';
      else if (hit.intent === 'visual') next = 'visual';
      else if (hit.intent === 'apl') next = 'apl';
      else if (hit.intent === 'on-file') next = 'on-file';
      else if (hit.intent === 'approved') next = 'approved';
      else if (hit.intent === 'submit') next = 'submit';
      return { action: next, actionNotes: hit.action, rule: 'harvested-language' };
    }
    const same = !hit.intent || hit.intent === action
      || (action === 'apl' && hit.intent === 'approved')
      || (action === 'on-file' && (hit.intent === 'approved' || hit.intent === 'on-file'))
      || (action === 'visual' && (hit.intent === 'approved' || hit.intent === 'visual'));
    if (!same) return { action, actionNotes, rule };
    const harvested = String(hit.action || '').trim();
    const first = String(actionNotes || '').split('\n')[0].trim();
    const generic = /^(approved\.?|approved for use\.?|not approved\.?|must be tested( and approved prior to use)?\.?)$/i;
    if (harvested.length <= first.length && generic.test(harvested)) {
      return { action, actionNotes, rule };
    }
    const extra = String(actionNotes || '').split('\n').slice(1);
    return { action, actionNotes: [hit.action].concat(extra).filter(Boolean).join('\n'), rule: rule + '+harvest' };
  }

  function applyAction(item, project, warnings, lists) {
    lists = lists || {};
    const family = item.family;
    const oneSource = !!(item.altName && item.altName !== item.srcName) ||
      (item.altLoc && item.altLoc !== item.srcLoc);
    const product = (item.subItems || []).join(' ') + ' ' + (item.material || '');
      const materialBlob = [item.desc, item.material, ...(item.subItems || []), ...(item.letterSpecs || item.specs || [])].join(' ');
    let action = 'approved';
    let actionNotes = '';
    let apl = false;
    let highlight = false;
    let rule = family;
    let testDate = item.testDate || '';

    if (family === 'tack') {
      apl = true;
      const liveTack = lists.tack && lists.tack.entries && lists.tack.entries.length;
      const lookupOne = (name, loc, prod) => (liveTack
        ? Lists.lookupTack(lists.tack, name, loc, prod)
        : matchAplList(TACK_COAT_APL, name, loc, prod));
      const hit = lookupOne(item.srcName, item.srcLoc, product);
      const altProd = [item.altProduct, ...(item.subItems || []).filter(s => /\(alt\)/i.test(s))].filter(Boolean).join(' ');
      const altHit = item.altName ? lookupOne(item.altName, item.altLoc, altProd || product) : null;
      const tackLine = (one, name, loc, prod, okWord) => {
        const who = [name, loc].filter(Boolean).join(' ');
        if (!one || one.rejected || one.locationMismatch || one.listed === false) {
          if (one && one.gradeMismatch) {
            const grade = one.grade || (Lists.extractGrade && Lists.extractGrade(prod));
            return `${who} not approved. (${grade || 'This grade'} not listed on tack coat APL for this source location)`;
          }
          if (/seaford/i.test(loc || '') || /seaford/i.test(name || '')) {
            return `${who} not approved. Seaford plant not listed on APL.`;
          }
          return `${who} not approved. (${who} not listed on APL)`.replace(/\s+/g, ' ').trim();
        }
        const grade = (Lists.extractGrade && Lists.extractGrade(prod)) || '';
        const label = [grade, name].filter(Boolean).join('/');
        return `${label || who} ${okWord || 'approved for use. (on APL)'}`;
      };
      const primaryBad = !hit || hit.rejected || hit.locationMismatch || hit.gradeMismatch || hit.listed === false
        || (liveTack && hit.listed == null && item.srcName);
      const altOk = altHit && altHit.listed && !altHit.rejected && !altHit.locationMismatch && !altHit.gradeMismatch;
      if (item.altName && (primaryBad || altOk)) {
        const pLine = tackLine(hit, item.srcName, item.srcLoc, product);
        const aLine = altHit
          ? (altOk
            ? tackLine(altHit, item.altName, item.altLoc, altProd || product, 'approved for use. (on APL)')
            : tackLine(altHit, item.altName, item.altLoc, altProd || product))
          : '';
        actionNotes = [pLine, aLine].filter(Boolean).join('\n');
        action = altOk && !primaryBad ? 'apl' : (altOk ? 'apl' : 'not-approved');
        if (altOk) action = primaryBad ? 'apl' : 'apl';
        rule = 'tack-primary-alt';
        if (primaryBad) warnings.push(pLine);
      } else if (hit.rejected || hit.locationMismatch || hit.gradeMismatch || hit.listed === false) {
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
        let lookupMat = materialBlob;
        const primaryGabc = Lists.lookupAggregate(chart, item.srcName, item.srcLoc, materialBlob);
        const altGabc = item.altName ? Lists.lookupAggregate(chart, item.altName, item.altLoc, materialBlob) : null;
        const primaryCc = Lists.lookupAggregate(chart, item.srcName, item.srcLoc, 'GABC (CRUSHED CONCRETE)');
        const altCc = item.altName ? Lists.lookupAggregate(chart, item.altName, item.altLoc, 'GABC (CRUSHED CONCRETE)') : null;
        const gabcKind = Lists.materialKind && Lists.materialKind(materialBlob);
        if (gabcKind === 'gabc' && !(primaryGabc && primaryGabc.found) && !(altGabc && altGabc.found)
            && ((primaryCc && primaryCc.found) || (altCc && altCc.found))) {
          lookupMat = 'GABC (CRUSHED CONCRETE)';
          item.desc = 'GABC (CRUSHED CONCRETE)';
        }
        const primary = Lists.lookupAggregate(chart, item.srcName, item.srcLoc, lookupMat);
        const altHit = item.altName ? Lists.lookupAggregate(chart, item.altName, item.altLoc, lookupMat) : null;
        noteChartLocationMismatch(item, primary, altHit);
        const part = (hit, label) => {
          const who = label ? label + ' ' : '';
          if (!hit || !hit.found) {
            return { action: 'test', notes: who + ACTION_TEXT.test, date: '', highlight: true };
          }
          if (hit.status === 'rejected') {
            return { action: 'not-approved', notes: who + 'Not approved on the current aggregate chart.', date: '', highlight: false };
          }
          if (hit.status === 'expired') {
            const when = hit.expireDate || hit.testDate || '';
            return { action: 'test', notes: who + 'Previous sample expired' + (when ? ' ' + when : '') + '. Must be tested and approved prior to use.', date: '', highlight: true };
          }
          if (hit.status === 'approved') {
            return { action: 'approved', notes: who + ACTION_TEXT.approved, date: hit.testDate || '', highlight: false };
          }
          return { action: 'test', notes: who + ACTION_TEXT.test, date: '', highlight: true };
        };
        const p = part(primary, item.altName ? (item.srcName || 'Primary') : '');
        const a = item.altName ? part(altHit, item.altName) : null;
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
        if (action === 'approved' && parts.every(x => x.action === 'approved')) {
          actionNotes = ACTION_TEXT.approved;
        } else {
          actionNotes = parts.map(x => x.notes).join('\n');
        }
        if (action === 'test') actionNotes = actionNotes + '\n' + testCoordinationNotes(project.district, lists);
        testDate = p.date || testDate;
        if (a && a.date) item.altTestDate = a.date;
        item.primaryNeedsTest = p.action === 'test';
        rule = 'aggregate-chart';
        Object.assign(item, chartSourceFill(item, primary));
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
      actionNotes = ACTION_TEXT.pccOnFile;
      rule = 'pcc-admixtures-on-file';
    } else if (family === 'hardware') {
      action = 'approved';
      actionNotes = ACTION_TEXT.conforms;
      rule = 'hardware-conforms';
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
        actionNotes = ACTION_TEXT.approvedBare;
        rule = 'expansion-approved';
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
    } else if (family === 'curing' || family === 'apl-product') {
      action = 'apl';
      apl = true;
      actionNotes = ACTION_TEXT.apl;
      rule = family + '-apl';
      const blob = [item.desc, item.material, item.altProduct, ...(item.subItems || [])].join(' ');
      if (family === 'apl-product' && /erosion control blanket|#908020/i.test(blob + ' ' + (item.specs || []).join(' '))) {
        const primaryProd = (item.subItems && item.subItems[0]) || item.material || 'SC150BN';
        const altBlob = [item.altProduct, ...(item.subItems || []).slice(1)].join(' ');
        if (/curlex/i.test(altBlob)) {
          const pName = String(primaryProd).replace(/\*+$/, '').replace(/\s+/g, ' ').trim() || 'SC150BN';
          actionNotes = `${pName} approved for use. (on APL)\nCurlex not approved. (not listed on APL)`;
          rule = 'erosion-blanket-apl';
        }
      }
    } else if (family === 'ttc' || family === 'signs') {
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
    } else if (family === 'geotextile') {
      action = 'approved';
      actionNotes = ACTION_TEXT.approvedBare;
      rule = 'geotextile-approved';
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

    const harvested = applyHarvestedLanguage(item, action, actionNotes, rule, lists);
    action = harvested.action;
    actionNotes = harvested.actionNotes;
    rule = harvested.rule;
    if (action === 'test') highlight = true;
    if (action === 'apl') apl = true;

    if (oneSource && !['tack', 'curing', 'expansion', 'crack-seal', 'apl-product', 'ttc', 'signs', 'striping', 'geotextile'].includes(family)) {
      if (!/only one source at a time/i.test(actionNotes)) {
        actionNotes = (actionNotes ? actionNotes + '\n' : '') + ACTION_TEXT.oneSource;
      }
    }
    if (apl && !/prodlists/i.test(actionNotes)) {
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
    if (['tack', 'crack-seal', 'apl-product'].includes(a.family)) return false;
    // Soil/stone items from the same plant still get their own SECTION + ACTION
    // (GABC vs RAP vs topsoil). Superpave / RCP / PCC sizes still group.
    if (['aggregate', 'borrow', 'topsoil', 'landscape', 'seed', 'riprap'].includes(a.family)) return false;
    if (['curing', 'expansion'].includes(a.family)) {
      const sub = (it) => (it.subItems || []).join('|').toLowerCase().replace(/\*+$/g, '');
      const sa = sub(a);
      const sb = sub(b);
      const weak = (it) => !it.srcName || isStreet(it.srcName) || isCityState(it.srcName);
      if (sourceKey(a) === sourceKey(b)) return true;
      if (sa && sb && (sa === sb || sa.includes(sb) || sb.includes(sa))) return true;
      if ((weak(a) || weak(b)) && /1600|silencure|thinfilm|curing|reflex|expansion/.test(sa + ' ' + sb)) return true;
      return false;
    }
    if (a.family === 'pcc' && b.family === 'pcc') {
      const ca = plantCompanyKey(a.srcName);
      const cb = plantCompanyKey(b.srcName);
      return !!(ca && ca === cb);
    }
    const specsOf = (it) => [...(it.specs || []), ...(it.letterSpecs || [])];
    if (specsOf(a).includes('#401505') || specsOf(b).includes('#401505')) return false;
    if (specsOf(a).includes('#905007') || specsOf(b).includes('#905007')) return false;
    return sourceKey(a) === sourceKey(b);
  }

  function familyOrderValue(family) {
    const FAMILY_ORDER = {
      borrow: 10, aggregate: 20, 'hma-mix': 30, tack: 35, 'crack-seal': 40,
      rcp: 50, riprap: 52, hdpe: 55, utility: 56, precast: 60, castings: 65,
      pcc: 70, hardware: 72, 'apl-product': 73, curing: 75, expansion: 76,
      geotextile: 85, erosion: 90, seed: 95, topsoil: 96, landscape: 97,
      striping: 98, ttc: 100, signs: 105, other: 200,
    };
    return FAMILY_ORDER[family] || 150;
  }

  function groupItems(items) {
    const ranked = [...items].sort((a, b) => {
      const fa = familyOrderValue(a.family);
      const fb = familyOrderValue(b.family);
      if (fa !== fb) return fa - fb;
      return String((a.letterSpecs || a.specs)[0] || '').localeCompare(String((b.letterSpecs || b.specs)[0] || ''));
    });
    const groups = [];
    for (const item of ranked) {
      const prev = groups[groups.length - 1];
      if (prev && canGroup(prev, item)) {
        prev.specs = [...new Set([...prev.specs, ...item.specs])];
        prev.letterSpecs = [...new Set([...(prev.letterSpecs || prev.specs), ...(item.letterSpecs || item.specs)])];
        prev.specDescs = Object.assign({}, prev.specDescs, item.specDescs);
        prev.reviewFlags = [...new Set([...(prev.reviewFlags || []), ...(item.reviewFlags || [])])];
        const extraSubs = (item.subItems || []).filter(s => !(prev.subItems || []).some(p => String(p).toLowerCase() === String(s).toLowerCase()));
        prev.subItems = [...(prev.subItems || []), ...extraSubs];
        prev.groupedFrom = (prev.groupedFrom || [prev.id]).concat(item.id);
        if (!prev.srcLoc && item.srcLoc) {
          prev.srcLoc = item.srcLoc;
          if (!prev.srcAddr && item.srcAddr) prev.srcAddr = item.srcAddr;
        }
        if (!prev.altName && item.altName) {
          prev.altName = item.altName;
          prev.altLoc = item.altLoc;
          prev.altAddr = item.altAddr;
        }
        if (item.altProduct && !prev.altProduct) prev.altProduct = item.altProduct;
        if (/chemmasters/i.test(item.srcName || '') && !/chemmasters/i.test(prev.srcName || '')) {
          prev.srcName = item.srcName;
          prev.srcLoc = item.srcLoc;
          prev.srcAddr = item.srcAddr;
        }
        if (item.srcLoc && (isStreet(prev.srcName) || !prev.srcLoc)) {
          if (!isStreet(item.srcName) && item.srcName) prev.srcName = item.srcName;
          prev.srcLoc = prev.srcLoc || item.srcLoc;
          prev.srcAddr = prev.srcAddr || item.srcAddr;
        }
      } else {
        groups.push({ ...item });
      }
    }
    return groups;
  }

  function letterSectionLines(item) {
    const specs = item.letterSpecs || item.specs || [];
    return specs.map((s) => {
      // Single-spec rows keep enrichDescription rewrites (GABC crushed concrete, HMA ITEMS).
      // Grouped sizes must not copy the first sibling's description onto later spec numbers.
      const per = specs.length <= 1
        ? (item.desc || specLetterDesc(item, s) || '')
        : (specLetterDesc(item, s) || '');
      return per ? `${s} - ${per}` : `${s}`;
    }).filter(Boolean);
  }

  function applyWorkflow(parsed, opts) {
    const warnings = [...(parsed.warnings || [])];
    const project = { ...parsed.project };
    if (!project.docKind) project.docKind = detectDocKind(project.contract);

    const lists = (opts && opts.lists) || {};
    const prepared = parsed.items.map((raw, idx) => {
      let item = {
        ...raw,
        id: raw.id || (idx + 1),
        formDesc: raw.formDesc || raw.desc || '',
        formMaterial: raw.formMaterial || raw.material || '',
        formSubItems: raw.formSubItems || [...(raw.subItems || [])],
        formSpecs: raw.formSpecs || [...(raw.specs || [])],
      };
      item = applySpecCorrections(item, warnings);
      item = enrichDescription(item, lists);
      const src = pickLetterSource(item);
      item = recoverStripingSource({ ...item, ...src });
      item = applyAction(item, project, warnings, lists);
      item.reviewFlags = collectItemReviewFlags(item, lists);
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
    items.forEach((it) => {
      (it.reviewFlags || []).forEach((f) => warnings.push(f));
    });

    const cc = buildCcList(project, lists, items);

    return {
      project,
      items,
      cc,
      warnings: [...new Set(warnings.filter(Boolean))],
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
    const assignments = (lists && lists.ccAssignments) || CC_ASSIGNMENT_SEEDS;
    assignments.forEach(a => {
      if (assignmentMatchesItems(a, items, project)) add(a.name, a.org || 'DelDOT', a.role || '');
    });
    return filterRetiredCcPeople(people, lists && (lists.retiredCc || lists.retiredNames));
  }

  function processGrid(rows, meta) {
    const parsed = parseSosGrid(rows, meta);
    return { parsed, ...applyWorkflow(parsed, meta || {}) };
  }

  function sheetjs() {
    return (typeof globalThis !== 'undefined' && globalThis.XLSX) || (typeof require === 'function' ? require('xlsx') : null);
  }

  function workbookToGrid(workbook) {
    const XLSX = sheetjs();
    if (!XLSX) throw new Error('SheetJS (XLSX) is not loaded.');
    const name = workbook.SheetNames[0];
    const sheet = workbook.Sheets[name];
    return XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true, defval: '' });
  }

  function workbookToSheets(workbook) {
    const XLSX = sheetjs();
    if (!XLSX) throw new Error('SheetJS (XLSX) is not loaded.');
    return (workbook.SheetNames || []).map(name => ({
      name,
      rows: XLSX.utils.sheet_to_json(workbook.Sheets[name], { header: 1, raw: true, defval: '' }),
    }));
  }

  function looksLikeSosCover(rows) {
    const n = Math.min((rows || []).length, 20);
    for (let r = 0; r < n; r++) {
      const joined = (rows[r] || []).map(cellStr).join(' ').toLowerCase();
      if (/source of supply/.test(joined) || /delaware department of transportation/.test(joined)) return true;
    }
    return false;
  }

  function processSosSheets(sheets, meta) {
    const list = (sheets || []).map((s, i) => ({
      name: s && s.name ? s.name : ('Sheet ' + (i + 1)),
      rows: (s && s.rows) || s || [],
    }));
    const sos = list.filter(s => findHeaderRow(s.rows) >= 0);
    if (!sos.length) {
      const fallback = list.find(s => looksLikeSosCover(s.rows)) || list[0];
      return processGrid(fallback ? fallback.rows : [], meta);
    }
    const parsedSheets = sos.map(s => ({ name: s.name, parsed: parseSosGrid(s.rows, meta) }));
    const project = parsedSheets[0].parsed.project;
    const items = parsedSheets.flatMap(s => s.parsed.items);
    const warnings = [];
    if (parsedSheets.length > 1) {
      warnings.push('Read ' + parsedSheets.length + ' SOS tabs (' + parsedSheets.map(s => s.name).join(', ') + ').');
    }
    parsedSheets.forEach(s => {
      (s.parsed.warnings || []).forEach(w => {
        if (/Could not find Specification/.test(w)) return;
        if (/blank on the form/.test(w) && project.contract) return;
        warnings.push(w);
      });
    });
    const combined = { project, items, warnings };
    return { parsed: combined, ...applyWorkflow(combined, meta || {}) };
  }

  function processWorkbook(workbook, meta) {
    return processSosSheets(workbookToSheets(workbook), meta);
  }

  function formatLongDate(iso) {
    if (!iso) return '';
    const d = new Date(iso + 'T12:00:00');
    return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  }

  function adobeTimezoneOffset(tzName) {
    const m = String(tzName || '').match(/([+-])(\d{1,2})(?::(\d{2}))?/);
    if (!m) return "-04'00'";
    return `${m[1]}${String(m[2]).padStart(2, '0')}'${m[3] || '00'}'`;
  }

  function formatDigitalSignStamp(when, tz) {
    tz = tz || 'America/New_York';
    const d = when instanceof Date ? when : new Date(when || Date.now());
    const safe = Number.isNaN(d.getTime()) ? new Date() : d;
    const parts = {};
    new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
      timeZoneName: 'longOffset',
    }).formatToParts(safe).forEach((p) => {
      if (p.type !== 'literal') parts[p.type] = p.value;
    });
    const date = `${parts.year}.${parts.month}.${parts.day}`;
    const time = `${parts.hour}:${parts.minute}:${parts.second} ${adobeTimezoneOffset(parts.timeZoneName)}`;
    return {
      iso: safe.toISOString(),
      date,
      time,
      stamp: `Date: ${date} ${time}`,
    };
  }

  function digitalSignatureLines(when, name) {
    const stamp = formatDigitalSignStamp(when);
    return [
      'Digitally signed by',
      name || 'Steven Peretiatko',
      'Date: ' + stamp.date,
      stamp.time,
    ];
  }

  function prettyTestedDate(t) {
    if (!t) return '';
    if (/^\d{4}-\d{2}-\d{2}$/.test(t)) {
      return t.slice(5, 7).replace(/^0/, '') + '.' + t.slice(8).replace(/^0/, '') + '.' + t.slice(2, 4);
    }
    return t;
  }

  function sourceLine(item) {
    let line = item.srcName || '';
    const useAddr = (item.family === 'borrow' || item.family === 'aggregate' || item.family === 'topsoil') && item.srcAddr;
    if (useAddr && item.srcLoc) {
      line += (line ? ' - ' : '') + item.srcAddr.replace(/,\s*$/, '') + ', ' + item.srcLoc;
    } else if (item.srcLoc) {
      line += (line ? ' - ' : '') + item.srcLoc;
    }
    if (item.testDate) {
      line += ` (tested ${prettyTestedDate(item.testDate)})`;
    } else if (item.family === 'aggregate' && (item.primaryNeedsTest || item.action === 'test')) {
      line += ' (requires testing)';
    }
    if (item.altName) {
      const altUseAddr = useAddr && item.altAddr;
      if (altUseAddr && item.altLoc) {
        line += '\nAlt: ' + item.altName + ' - ' + item.altAddr.replace(/,\s*$/, '') + ', ' + item.altLoc;
      } else if (item.altLoc) {
        line += '\nAlt: ' + item.altName + ' - ' + item.altLoc;
      } else {
        line += '\nAlt: ' + item.altName;
      }
      if (item.altTestDate) {
        line += ` (tested ${prettyTestedDate(item.altTestDate)})`;
      }
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

  /** Merge or replace letter-header fields when a new contractor form is loaded.
   *  replace=false keeps prior values when the new form left a field blank (old bug).
   *  replace=true starts a new job: blanks on the form clear the previous letter. */
  function overlayProject(current, incoming, replace) {
    current = current || {};
    incoming = incoming || {};
    const take = (key) => {
      const next = incoming[key];
      if (replace) return next ? next : '';
      return next ? next : (current[key] || '');
    };
    return {
      contract: take('contract'),
      title: take('title'),
      contractor: take('contractor'),
      contractorAddr: take('contractorAddr'),
      contact: take('contact'),
      district: incoming.district || current.district || '',
      docKind: incoming.docKind || (replace ? 'application' : (current.docKind || '')),
      date: replace ? todayISO() : (current.date || todayISO()),
    };
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
    formatDigitalSignStamp,
    digitalSignatureLines,
    todayISO,
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
    overlayProject,
    findHeaderRow,
    detectItemColumns,
    expandContactLines,
    processSosSheets,
    workbookToSheets,
    cleanContractNo,
    lookupHarvestedLanguage,
    isKnownItemNumber,
    collectItemReviewFlags,
  };
});
