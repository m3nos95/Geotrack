/**
 * Predetermined handwritten sheets for Field Control and concrete.
 * Field Control prints a soil sheet and an aggregate sheet. They share the
 * contract number and sample number boxes. Each sheet only has the fields
 * that type uses. One value per box.
 * The printed sheet can carry a next-sample QR. A finished report does not.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.LabTrakHandSheet = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  function f(id, label, extra) {
    const field = { id: id, label: label };
    if (extra) Object.keys(extra).forEach(function (k) { field[k] = extra[k]; });
    return field;
  }

  const sharedHeader = [
    f('sample_number', 'Sample number', { wide: true, hint: 'Test number. One number in this box.' }),
    f('contract', 'Contract number', { wide: true, hint: 'One contract number in this box.' })
  ];

  const SOIL = {
    id: 'soil',
    section: 'field',
    sampleKind: 'soil',
    title: 'Soil sheet',
    formCode: 'LABTRAK-SOIL-SHEET',
    sections: [
      {
        title: 'Header',
        fields: sharedHeader.concat([
          f('location', 'Road / location'),
          f('material', 'Material type'),
          f('technician', 'Technician'),
          f('road', 'Road / route'),
          f('date', 'Date sampled', { kind: 'date' })
        ])
      },
      {
        title: 'Soil sample',
        fields: [
          f('fa_project', 'F.A. project'),
          f('contractor', 'Contractor'),
          f('depth', 'Depth'),
          f('elevation', 'Elevation'),
          f('source', 'Source'),
          f('method_placed', 'Method placed'),
          f('sample_type', 'Type of sample', { hint: 'Field Control, Acceptance, Verification, or Informational' }),
          f('remarks', 'Remarks', { wide: true }),
          f('special_requests', 'Special requests', { wide: true })
        ]
      }
    ]
  };

  const AGGREGATE = {
    id: 'aggregate',
    section: 'field',
    sampleKind: 'aggregate',
    title: 'Aggregate sheet',
    formCode: 'LABTRAK-AGGREGATE-SHEET',
    sections: [
      {
        title: 'Header',
        fields: sharedHeader.concat([
          f('agg_material', 'Material'),
          f('agg_sampled_by', 'Sampled by'),
          f('agg_date', 'Date sampled', { kind: 'date' })
        ])
      },
      {
        title: 'Aggregate sample',
        fields: [
          f('agg_size', 'Aggregate size'),
          f('size_no', 'Size no.'),
          f('lab_no', 'Lab no.'),
          f('est_qty', 'Est. quantity'),
          f('sampled_at', 'Sampled at'),
          f('examined_for', 'Examined for'),
          f('sampled_from', 'Sampled from'),
          f('supplied_by', 'Supplied by'),
          f('supply_location', 'Supply location'),
          f('agg_contractor', 'Contractor')
        ]
      }
    ]
  };

  const CONCRETE = {
    id: 'concrete',
    section: 'concrete',
    sampleKind: 'concrete',
    title: 'Concrete sheet',
    formCode: 'LABTRAK-CONCRETE-SHEET',
    sections: [
      {
        title: 'Pour',
        fields: [
          f('sample_number', 'Sample number', { wide: true, hint: 'Set ID. One value in this box.' }),
          f('contract', 'Contract number', { wide: true, hint: 'One contract number in this box.' }),
          f('fa_project', 'F.A. project'),
          f('contractor', 'Contractor'),
          f('supplier', 'Concrete supplier'),
          f('mix_design', 'Mix design / class'),
          f('pour_location', 'Pour location', { wide: true }),
          f('cast_date', 'Cast date', { kind: 'date' }),
          f('cast_time', 'Cast time', { kind: 'time' }),
          f('truck_no', 'Truck / load no.'),
          f('ticket_no', 'Ticket no.'),
          f('sampled_by', 'Sampled by'),
          f('tech_no', 'Technician no.')
        ]
      },
      {
        title: 'Fresh concrete',
        fields: [
          f('slump', 'Slump (in)'),
          f('air', 'Air (%)'),
          f('unit_wt', 'Unit weight (pcf)'),
          f('conc_temp', 'Concrete temp (°F)'),
          f('amb_temp', 'Ambient temp (°F)')
        ]
      },
      {
        title: 'Cylinders',
        fields: [
          f('cyl_diam', 'Cylinder diameter', { hint: '4 or 6' }),
          f('required_fc', "Required f'c (psi)"),
          f('age_7', '7-day cylinders', { hint: '0 to 3' }),
          f('age_14', '14-day cylinders', { hint: '0 to 3' }),
          f('age_28', '28-day cylinders', { hint: '0 to 3' }),
          f('age_56', '56-day cylinders', { hint: '0 to 3' }),
          f('remarks', 'Remarks', { wide: true })
        ]
      },
      {
        title: 'DMP-15 / DMF-13',
        fields: [
          f('test_no', 'Test no.'),
          f('section_no', 'Section no.'),
          f('concrete_class', 'Class'),
          f('county', 'County'),
          f('cement_sks', 'Cement (SKS/CY)'),
          f('station', 'Station'),
          f('date_received', 'Date received', { kind: 'date' }),
          f('subcontractor', 'Subcontractor'),
          f('precast', 'Precast section', { hint: 'Yes or No' }),
          f('cement1', 'Cement 1 brand'),
          f('cement1_pct', 'Cement 1 %'),
          f('cement2', 'Cement 2 brand'),
          f('cement2_pct', 'Cement 2 %'),
          f('cement3', 'Cement 3 brand'),
          f('cement3_pct', 'Cement 3 %'),
          f('admix1', 'Admix 1 brand'),
          f('admix1_oz', 'Admix 1 oz/sk'),
          f('admix2', 'Admix 2 brand'),
          f('admix2_oz', 'Admix 2 oz/sk'),
          f('admix3', 'Admix 3 brand'),
          f('admix3_oz', 'Admix 3 oz/sk'),
          f('admix4', 'Admix 4 brand'),
          f('admix4_oz', 'Admix 4 oz/sk'),
          f('aea', 'AEA brand'),
          f('aea_oz', 'AEA oz/sk'),
          f('water', 'Water source'),
          f('fine_agg', 'Fine agg'),
          f('coarse_agg', 'Coarse agg'),
          f('fibers', 'Fibers (lbs/cy)'),
          f('plant', 'Plant / supplier detail'),
          f('corr_factor', 'GGBFS corr. factor')
        ]
      }
    ]
  };

  function sheetById(id) {
    if (id === 'soil') return SOIL;
    if (id === 'aggregate') return AGGREGATE;
    if (id === 'concrete') return CONCRETE;
    return null;
  }

  function fieldsOf(sheet) {
    const out = [];
    (sheet.sections || []).forEach(function (section) {
      (section.fields || []).forEach(function (field) { out.push(field); });
    });
    return out;
  }

  function escapeHtml(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function buildPrompt(sheet) {
    const lines = fieldsOf(sheet).map(function (field) {
      return '- ' + field.id + ': ' + field.label + (field.hint ? ' (' + field.hint + ')' : '');
    });
    return [
      'You read a photographed DelDOT handwritten ' + sheet.title + '.',
      'The form code printed on the sheet is ' + sheet.formCode + '.',
      'Each labeled box holds one handwritten value. Read only what is inside that box.',
      'Contract number and sample number are separate boxes. Do not combine them.',
      'Leave a box as an empty string when it is blank. Do not guess a value that is not written.',
      'Return only JSON with these keys:',
      lines.join('\n')
    ].join('\n');
  }

  function blankValue(raw) {
    const text = String(raw == null ? '' : raw).trim();
    if (!text) return '';
    if (/^(null|n\/a|na|blank|empty|none|—|-)$/i.test(text)) return '';
    return text;
  }

  function coerceDate(raw) {
    const text = blankValue(raw);
    if (!text) return '';
    const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (iso) return iso[1] + '-' + iso[2] + '-' + iso[3];
    const us = text.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})$/);
    if (us) {
      const year = us[3].length === 2 ? ('20' + us[3]) : us[3];
      const month = us[1].padStart(2, '0');
      const day = us[2].padStart(2, '0');
      return year + '-' + month + '-' + day;
    }
    return text;
  }

  function coerceTime(raw) {
    const text = blankValue(raw);
    if (!text) return '';
    const m = text.match(/^(\d{1,2}):(\d{2})/);
    if (!m) return text;
    return m[1].padStart(2, '0') + ':' + m[2];
  }

  function normalizeRead(sheet, raw) {
    const src = raw && typeof raw === 'object' ? raw : {};
    const out = {};
    fieldsOf(sheet).forEach(function (field) {
      const value = src[field.id];
      if (field.kind === 'date') out[field.id] = coerceDate(value);
      else if (field.kind === 'time') out[field.id] = coerceTime(value);
      else out[field.id] = blankValue(value);
    });
    return out;
  }

  function sheetMarkup(sheet) {
    let n = 0;
    return (sheet.sections || []).map(function (section) {
      const boxes = (section.fields || []).map(function (field) {
        n += 1;
        const code = String(n).padStart(2, '0');
        const wide = field.wide ? ' wide' : '';
        const hint = field.hint ? '<div class="hint">' + escapeHtml(field.hint) + '</div>' : '';
        return '<div class="box' + wide + '" data-field="' + escapeHtml(field.id) + '">' +
          '<div class="lab"><span class="code">' + code + '</span> ' + escapeHtml(field.label) + '</div>' +
          hint +
          '<div class="write"></div>' +
          '</div>';
      }).join('');
      return '<h2>' + escapeHtml(section.title) + '</h2><div class="grid">' + boxes + '</div>';
    }).join('');
  }

  function qrMarkup(opts) {
    if (!opts.qrDataUrl) return '';
    return '<div class="qr"><img alt="Scan to open the next sample" src="' + escapeHtml(opts.qrDataUrl) + '"><div>Scan to open the next sample</div></div>';
  }

  function plainDocument(sheet, opts, sections) {
    return '<!DOCTYPE html><html><head><meta charset="utf-8"><title>' + escapeHtml(sheet.title) + '</title><style>' +
      '@page{size:letter;margin:0.45in}' +
      'body{margin:0;color:#111;background:#fff;font-family:Arial,sans-serif}' +
      'header{display:flex;justify-content:space-between;align-items:flex-start;gap:16px;border-bottom:2px solid #111;padding-bottom:8px;margin-bottom:12px}' +
      'h1{font-size:18px;margin:0} .kicker{font-size:11px;letter-spacing:0.08em;text-transform:uppercase}' +
      '.code-line{font-size:11px;margin-top:4px}' +
      'h2{font-size:12px;margin:14px 0 6px;text-transform:uppercase;letter-spacing:0.04em}' +
      '.grid{display:grid;grid-template-columns:1fr 1fr;gap:8px}' +
      '.box{border:1.5px solid #111;min-height:58px;padding:4px 6px}' +
      '.box.wide{grid-column:1 / -1;min-height:72px}' +
      '.lab{font-size:11px;font-weight:700} .code{font-weight:400}' +
      '.hint{font-size:9px;color:#333} .write{height:28px}' +
      '.qr{text-align:center;font-size:9px} .qr img{width:92px;height:92px}' +
      '@media print {.box{break-inside:avoid}}' +
      '</style></head><body><header><div><div class="kicker">DelDOT Materials &amp; Research</div>' +
      '<h1>' + escapeHtml(sheet.title) + '</h1>' +
      '<div class="code-line">' + escapeHtml(sheet.formCode) + ' · one value per box</div></div>' +
      qrMarkup(opts) + '</header>' + sections + '</body></html>';
  }

  function lockupMarkup(opts) {
    if (opts.logoSrc) {
      return '<img class="lockup" alt="DelDOT" src="' + escapeHtml(opts.logoSrc) + '">';
    }
    return '<span class="lockup-fallback"><svg class="mark" viewBox="0 0 48 40" aria-hidden="true">' +
      '<path fill="#fff" d="M6 2h9L30 38h-9z"/><path fill="#fff" d="M18 2h9L42 38h-9z"/>' +
      '</svg><span class="word">DelDOT</span></span>';
  }

  function labtrakDocument(sheet, opts, sections) {
    return '<!DOCTYPE html><html><head><meta charset="utf-8"><title>' + escapeHtml(sheet.title) + '</title><style>' +
      '@page{size:letter;margin:0.4in}' +
      'body{margin:0;color:#122033;background:#fff;font-family:Arial,sans-serif}' +
      '.banner{position:relative;display:flex;align-items:center;gap:12px;background:#002349;color:#fff;min-height:2.05in;padding:0.16in 1.9in 0.22in 0.18in}' +
      '.banner:after{content:"";position:absolute;left:0;right:0;bottom:0;height:7px;background:#f68304}' +
      '.lockup{height:0.52in;width:auto;display:block}' +
      '.lockup-fallback{display:flex;align-items:center;gap:8px}' +
      '.mark{width:0.42in;height:0.36in;display:block}' +
      '.word{font-size:22px;font-weight:800;letter-spacing:-0.03em}' +
      '.slash{width:4px;height:0.42in;background:#f68304;transform:skewX(-18deg);border-radius:2px;flex:0 0 auto}' +
      '.name{font-weight:700;line-height:1.05;font-size:16px}' +
      '.name div+div{font-size:15px;font-weight:650}' +
      '.qr{position:absolute;top:0.12in;right:0.12in;width:1.5in;background:#fff;color:#122033;text-align:center;padding:3px 3px 2px;z-index:1}' +
      '.qr img{width:1.5in;height:1.5in;display:block}' +
      '.qr div{font-size:7px;line-height:1.15;padding:2px 2px 0}' +
      '.title{display:grid;grid-template-columns:1fr auto;gap:12px;align-items:center;padding:10px 2px 6px}' +
      'h1{margin:0;font-size:22px;letter-spacing:0.02em;color:#0b2344;font-weight:800;text-transform:uppercase}' +
      '.sub{margin-top:3px;font-size:10px;letter-spacing:0.04em;color:#5c6d80;font-weight:700}' +
      '.meta{text-align:right;border-left:3px solid #f68304;padding-left:10px;color:#0b2344;font-weight:750;font-size:12px}' +
      'h2{margin:10px 0 6px;background:#002349;color:#fff;font-size:11px;letter-spacing:0.04em;text-transform:uppercase;padding:6px 10px;border-bottom:3px solid #f68304}' +
      '.grid{display:grid;grid-template-columns:1fr 1fr;gap:8px}' +
      '.box{border:1px solid #d7e0ea;border-radius:8px;min-height:58px;padding:4px 8px;background:#fff}' +
      '.box.wide{grid-column:1 / -1;min-height:68px}' +
      '.lab{font-size:11px;font-weight:700;color:#1c334d} .code{font-weight:500;color:#5c6d80}' +
      '.hint{font-size:9px;color:#5c6d80} .write{height:26px}' +
      '@media print{*{ -webkit-print-color-adjust:exact;print-color-adjust:exact }.box{break-inside:avoid}}' +
      '</style></head><body><header class="banner">' + lockupMarkup(opts) +
      '<div class="slash"></div><div class="name"><div>Materials &amp; Research</div><div>Laboratory</div></div>' +
      qrMarkup(opts) + '</header><div class="title"><div><h1>' + escapeHtml(sheet.title) + '</h1>' +
      '<div class="sub">Delaware Department of Transportation | one value per box</div></div>' +
      '<div class="meta">' + escapeHtml(sheet.formCode) + '</div></div>' + sections + '</body></html>';
  }

  function printDocument(sheet, opts) {
    opts = opts || {};
    const sections = sheetMarkup(sheet);
    if (sheet.id === 'soil' || sheet.id === 'aggregate') return labtrakDocument(sheet, opts, sections);
    return plainDocument(sheet, opts, sections);
  }

  return {
    SOIL: SOIL,
    AGGREGATE: AGGREGATE,
    CONCRETE: CONCRETE,
    sheetById: sheetById,
    fieldsOf: fieldsOf,
    buildPrompt: buildPrompt,
    normalizeRead: normalizeRead,
    printDocument: printDocument
  };
});
