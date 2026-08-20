'use strict';
/**
 * Render an SOS letter as a printable HTML document (Node, no browser).
 */
const path = require('path');
const { pathToFileURL } = require('url');
const Engine = require('./sos-engine.js');
const DATA = require('./sos-data.js');
const Export = require('./letter-export.js');

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function letterCss() {
  return Export.printLetterCss() + `
.review-banner { background: #fff3cd; border: 1px solid #e0c36a; padding: 8pt 10pt; margin-bottom: 14pt; font-size: 10pt; }
@media print { .review-banner { display: none; } }`;
}

function actionHtml(item) {
  return esc(item.actionNotes || item.action || '').replace(/\n/g, '<br>');
}

function renderLetterHtml(result, opts) {
  const o = opts || {};
  const project = result.project || {};
  const items = result.items || [];
  const cc = result.cc || [];
  const dateStr = Engine.formatLongDate(project.date) || '';
  const phrase = Engine.contractPhrase(project);
  const addrHtml = esc(project.contractorAddr || '').replace(/\n/g, '<br>');
  const header = o.headerSrc || pathToFileURL(path.join(__dirname, 'letterhead-header.jpg')).href;
  const footer = o.footerSrc || pathToFileURL(path.join(__dirname, 'letterhead-footer.png')).href;
  const warnings = (result.warnings || []).filter(Boolean);
  const review = warnings.length
    ? `<div class="review-banner"><strong>REVIEW (not printed)</strong><br>${warnings.map(w => '• ' + esc(w)).join('<br>')}</div>`
    : '';
  const sections = items.map(item => {
    const specLines = Engine.letterSectionLines(item);
    const src = Engine.sourceLine(item).split('\n').map(esc).join('<br>');
    const subs = (item.subItems || []).map(s => `&nbsp;&nbsp;&bull; ${esc(s)}`).join('<br>');
    return `<div class="letter-section-block">
      <div class="letter-row"><div class="letter-field-label">SECTION:</div>
        <div>${specLines.map(esc).join('<br>')}${subs ? '<br>' + subs : ''}</div></div>
      <div class="letter-row"><div class="letter-field-label">SOURCE:</div><div>${src}</div></div>
      <div class="letter-row"><div class="letter-field-label">ACTION:</div>
        <div>${actionHtml(item)}</div></div>
    </div>`;
  }).join('\n');
  const ccHtml = cc.map(c => `${esc(c.name)}, ${esc(c.org || 'DelDOT')}`).join('<br>');
  const title = [project.contract, project.title, project.contractor].filter(Boolean).join(' · ') || 'SOS letter';
  const seed = DATA.CONTACTS.letterAuthor || {};
  const author = Object.assign({}, seed, o.author || project.author || {});
  const digital = Engine.digitalSignatureLines(project.signedAt || Date.now(), author.name).map(esc).join('<br>');
  const sigImg = o.signatureSrc
    ? `<img class="letter-sig-img" src="${esc(o.signatureSrc)}" alt="signature">`
    : '';
  const body = `<div class="letter-letterhead">
  <img src="${esc(header)}" alt="State of Delaware Department of Transportation">
  <div class="letter-secretary">${esc(DATA.CONTACTS.secretary)}<br>Secretary</div>
</div>
<div class="letter-date">${esc(dateStr)}</div>
<div class="letter-to">${esc(project.contractor || '[Contractor]')}<br>${addrHtml}</div>
<div class="letter-body">
  <p>The following material sources have been reviewed by this office for <strong>${esc(phrase)}</strong> as to their acceptability for use on this project. Please note that all materials must conform to the Standard Specifications, and Special Provisions, and/or Plans governing this project. The following action must be taken in order that we may expedite the inspection and approval of the material.</p>
</div>
${sections}
<hr>
<div>If you have any questions, please call me at ${esc(author.phone)}.</div>
<div class="letter-sig${o.signatureSrc ? ' has-image' : ''}">
  Sincerely,
  <div class="letter-sig-row">
    ${sigImg}
    <div class="letter-sig-digital">${digital}</div>
  </div>
  <div class="letter-sig-name">${esc(author.name)}<br>${esc(author.title)}</div>
</div>
<div class="letter-cc">cc: ${ccHtml || '(none)'}</div>`;
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${esc(title)}</title>
<style>${letterCss()}</style></head><body>
${review}
${Export.wrapLetterPages(body, footer)}
</body></html>`;
}

module.exports = { renderLetterHtml, letterCss };
