'use strict';
/**
 * Render an SOS letter as a printable HTML document (Node, no browser).
 */
const path = require('path');
const { pathToFileURL } = require('url');
const Engine = require('./sos-engine.js');
const DATA = require('./sos-data.js');

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function letterCss() {
  return `@page { size: 8.5in 11in; margin: 0.45in 1in 0.5in 1in; }
html, body { height: 100%; }
body { font-family: 'Times New Roman', serif; font-size: 11pt; line-height: 1.55; color: #111; min-height: 10.05in; display: flex; flex-direction: column; }
.letter-letterhead { text-align: center; margin: 0 0 14pt; }
.letter-letterhead img { width: 3.72in; height: auto; display: block; margin: 0 auto; }
.letter-secretary { font-family: 'Copperplate Gothic Light', Copperplate, 'Century Gothic', serif; font-size: 6.5pt; letter-spacing: 0.08em; text-transform: uppercase; color: #17365D; margin: 4pt 0 0; text-align: left; font-weight: 400; line-height: 1.25; }
.letter-date, .letter-to { margin-bottom: 16pt; }
.letter-body p { margin-bottom: 12pt; }
.letter-section-block { margin-bottom: 22pt; page-break-inside: avoid; }
.letter-row { display: grid; grid-template-columns: 72pt 1fr; gap: 6pt; margin-bottom: 3pt; page-break-inside: avoid; }
.letter-field-label { font-weight: 700; text-decoration: underline; }
hr { border: none; border-top: 1px solid #ccc; margin: 14pt 0; }
.letter-sig { margin-top: 24pt; page-break-inside: avoid; }
.letter-sig-row { display: flex; align-items: flex-end; gap: 16pt; margin: 8pt 0 0; }
.letter-sig-img { height: 0.58in; width: auto; max-width: 2.15in; display: block; object-fit: contain; }
.letter-sig-digital { font-family: Helvetica, Arial, sans-serif; font-size: 7.5pt; line-height: 1.2; color: #111; }
.letter-sig-name { font-weight: 700; margin-top: 4pt; }
.letter-sig:not(.has-image) .letter-sig-name { margin-top: 8pt; }
.letter-cc { margin-top: 14pt; font-size: 10pt; line-height: 1.75; page-break-inside: avoid; }
.letter-official-footer { margin-top: auto; padding-top: 18pt; text-align: right; page-break-inside: avoid; }
.letter-official-footer img { width: 1.95in; height: auto; }
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
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${esc(title)}</title>
<style>${letterCss()}</style></head><body>
${review}
<div class="letter-letterhead">
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
<div class="letter-cc">cc: ${ccHtml || '(none)'}</div>
<div class="letter-official-footer">
  <img src="${esc(footer)}" alt="DelDOT">
</div>
</body></html>`;
}

module.exports = { renderLetterHtml, letterCss };
