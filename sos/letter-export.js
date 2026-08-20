'use strict';
/**
 * Shared print / Word-export CSS and HTML wrappers.
 * Used by the browser app (window.SOSLetterExport) and Node letter-render.
 */

function printColorCss() {
  return `
html, body, * {
  -webkit-print-color-adjust: exact;
  print-color-adjust: exact;
}
mark.user-highlight, .user-highlight {
  background: #ffff00 !important;
  color: inherit !important;
  padding: 0 1px;
  box-shadow: inset 0 0 0 9999px #ffff00;
}
.letter-highlight,
.letter-action-text span[style*="ffff80"] {
  background: #ffff80 !important;
  box-shadow: inset 0 0 0 9999px #ffff80;
}
`;
}

function wrapLetterPages(bodyHtml, footerSrc) {
  const src = String(footerSrc || '')
    .replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
  return `<table class="letter-print-pages">
  <tfoot>
    <tr><td>
      <div class="letter-official-footer letter-page-footer">
        <img src="${src}" alt="DelDOT">
      </div>
    </td></tr>
  </tfoot>
  <tbody>
    <tr><td class="letter-print-body">${bodyHtml}</td></tr>
  </tbody>
</table>`;
}

function letterLayoutCss(opts) {
  const o = opts || {};
  // Print: repeating <tfoot> band (~2 lines + 1.5in-wide logo) so body text cannot
  // run through the DelDOT mark. Do not use position:fixed — Chrome still flows
  // text under a pinned overlay. Word keeps a compact in-flow footer.
  const footer = o.fixedFooter
    ? `table.letter-print-pages { width: 100%; border: none; border-collapse: collapse; }
table.letter-print-pages > tbody > tr > td,
table.letter-print-pages > tfoot > tr > td { padding: 0; border: none; vertical-align: top; }
table.letter-print-pages > thead { display: table-header-group; }
table.letter-print-pages > tfoot { display: table-footer-group; }
.letter-official-footer, .letter-page-footer {
  height: 1.15in;
  box-sizing: border-box;
  margin: 0;
  padding: 0.48in 0 0;
  width: 100%;
  text-align: right;
  position: static;
}
.letter-official-footer img, .letter-page-footer img {
  width: 1.5in;
  height: auto;
  display: block;
  margin-left: auto;
}`
    : `.letter-official-footer, .letter-page-footer {
  margin-top: 24pt;
  padding-top: 12pt;
  text-align: right;
}
.letter-official-footer img, .letter-page-footer img { width: 1.5in; height: auto; display: block; margin-left: auto; }
table.letter-print-pages { width: 100%; border: none; border-collapse: collapse; }
table.letter-print-pages > tbody > tr > td,
table.letter-print-pages > tfoot > tr > td { padding: 0; border: none; vertical-align: top; }`;

  return `@page { size: 8.5in 11in; margin: 0.5in 0.9in 0.45in 0.9in; }
html, body { height: auto; }
body { font-family: 'Times New Roman', serif; font-size: 11pt; line-height: 1.55; color: #111; }
.letter-letterhead { text-align: center; margin: 0 0 14pt; }
.letter-letterhead img { width: 3.72in; height: auto; display: block; margin: 0 auto; }
.letter-secretary { font-family: 'Copperplate Gothic Light', Copperplate, 'Century Gothic', serif; font-size: 6.5pt; letter-spacing: 0.08em; text-transform: uppercase; color: #17365D; margin: 4pt 0 0; text-align: left; font-weight: 400; line-height: 1.25; }
.letter-date, .letter-to { margin-bottom: 16pt; }
.letter-body p { margin-bottom: 12pt; }
.letter-section-block { margin-bottom: 22pt; page-break-inside: avoid; }
.letter-row { display: grid; grid-template-columns: 72pt 1fr; gap: 6pt; margin-bottom: 3pt; page-break-inside: avoid; }
.letter-field-label { font-weight: 700; text-decoration: underline; }
hr, hr.letter-divider { border: none; border-top: 1px solid #ccc; margin: 14pt 0; }
.letter-closing { display: table; width: 100%; page-break-inside: avoid; break-inside: avoid; page-break-before: auto; }
.letter-questions { page-break-after: avoid; break-after: avoid-page; }
.letter-sig { margin-top: 16pt; padding-bottom: 10pt; page-break-inside: avoid; break-inside: avoid; page-break-before: avoid; break-before: avoid-page; }
.letter-sig-row { display: flex; align-items: flex-end; gap: 16pt; margin: 8pt 0 0; }
.letter-sig-img { height: 0.58in; width: auto; max-width: 2.15in; display: block; object-fit: contain; }
.letter-sig-digital { font-family: Helvetica, Arial, sans-serif; font-size: 7.5pt; line-height: 1.2; color: #111; }
.letter-sig-name { font-weight: 700; margin-top: 4pt; }
.letter-sig:not(.has-image) .letter-sig-name { margin-top: 8pt; }
.letter-cc { margin-top: 14pt; font-size: 10pt; line-height: 1.75; page-break-inside: avoid; }
${footer}
`;
}

function printLetterCss() {
  return letterLayoutCss({ fixedFooter: true }) + printColorCss();
}

function wordCss() {
  return letterLayoutCss({ fixedFooter: false }) + `
table.letter-row-table { width: 100%; border: none; border-collapse: collapse; margin-bottom: 3pt; }
table.letter-row-table td { vertical-align: top; padding: 0 6pt 3pt 0; font-family: 'Times New Roman', serif; font-size: 11pt; }
td.letter-field-label { width: 72pt; font-weight: 700; text-decoration: underline; }
mark.user-highlight, .user-highlight, .mso-user-highlight {
  background: #ffff00;
  mso-highlight: yellow;
}
.letter-highlight { background: #ffff80; mso-highlight: yellow; }
`;
}

function wrapWordHtml(bodyHtml, title) {
  const safeTitle = String(title == null ? 'SOS letter' : title)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  return `<html xmlns:o="urn:schemas-microsoft-com:office:office"
xmlns:w="urn:schemas-microsoft-com:office:word"
xmlns="http://www.w3.org/TR/REC-html40">
<head>
<meta charset="utf-8">
<meta http-equiv="Content-Type" content="text/html; charset=utf-8">
<title>${safeTitle}</title>
<!--[if gte mso 9]><xml>
<w:WordDocument>
<w:View>Print</w:View>
<w:Zoom>100</w:Zoom>
<w:DoNotOptimizeForBrowser/>
</w:WordDocument>
</xml><![endif]-->
<style>
@page WordSection1 { size: 8.5in 11.0in; margin: 0.7in 0.9in 0.7in 0.9in; }
div.WordSection1 { page: WordSection1; }
${wordCss()}
</style>
</head>
<body>
<div class="WordSection1">
${bodyHtml}
</div>
</body></html>`;
}

function letterExportFilename(contract, ext) {
  const raw = String(contract == null ? '' : contract).trim();
  const slug = raw.replace(/[^\w.-]+/g, '_').replace(/^_+|_+$/g, '') || 'SOS';
  return slug + '_SOS_letter.' + (ext || 'doc');
}

function rewriteHighlightsForWord(html) {
  return String(html || '').replace(
    /<mark([^>]*class=["'][^"']*user-highlight[^"']*["'][^>]*)>([\s\S]*?)<\/mark>/gi,
    '<span$1 style="background:#ffff00;mso-highlight:yellow;">$2</span>'
  );
}

var SOSLetterExport = {
  printColorCss,
  letterLayoutCss,
  printLetterCss,
  wordCss,
  wrapLetterPages,
  wrapWordHtml,
  letterExportFilename,
  rewriteHighlightsForWord,
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = SOSLetterExport;
}
if (typeof window !== 'undefined') {
  window.SOSLetterExport = SOSLetterExport;
}
