'use strict';
const assert = require('assert');
const Export = require('./letter-export.js');
const { letterCss } = require('./letter-render.js');

assert.ok(/user-highlight/.test(Export.printLetterCss()), 'print CSS styles user highlights');
assert.ok(/print-color-adjust:\s*exact/.test(Export.printLetterCss()), 'print CSS forces highlight colors');
assert.ok(/box-shadow:\s*inset/.test(Export.printLetterCss()), 'print CSS keeps yellow when Background graphics is off');
assert.ok(/table-footer-group/.test(Export.printLetterCss()), 'print CSS repeats a footer band on every page');
assert.ok(/height:\s*1\.15in/.test(Export.printLetterCss()), 'print footer reserves logo height plus two lines of gap');
assert.ok(!/position:\s*fixed/.test(Export.printLetterCss()), 'print CSS does not overlay the logo on body text');
assert.ok(/\.letter-closing\s*\{[^}]*page-break-inside:\s*avoid/.test(Export.printLetterCss()), 'print CSS keeps the closing on one page');
assert.ok(/padding-bottom:\s*10pt/.test(Export.printLetterCss()), 'print CSS leaves room under the signature');

assert.ok(/user-highlight/.test(letterCss()), 'letter-render print CSS includes highlights');
assert.ok(/print-color-adjust/.test(letterCss()));
assert.ok(/table-footer-group/.test(letterCss()));

assert.ok(!/position:\s*fixed/.test(Export.wordCss()), 'Word footer stays in the document flow');
assert.ok(/mso-highlight/.test(Export.wordCss()), 'Word CSS uses native highlighter');
assert.ok(/user-highlight/.test(Export.wordCss()));

assert.strictEqual(Export.letterExportFilename('T202607001.01', 'doc'), 'T202607001.01_SOS_letter.doc');
assert.strictEqual(Export.letterExportFilename('0000016055'), '0000016055_SOS_letter.doc');
assert.strictEqual(Export.letterExportFilename(''), 'SOS_SOS_letter.doc');

const rewritten = Export.rewriteHighlightsForWord(
  'The source is <mark class="user-highlight">Vulcan Materials</mark> in Salisbury.'
);
assert.ok(/mso-highlight:yellow/.test(rewritten));
assert.ok(/Vulcan Materials/.test(rewritten));
assert.ok(!/<mark/.test(rewritten), 'Word file should not rely on <mark>');

const word = Export.wrapWordHtml(
  Export.wrapLetterPages(
    '<p>Digitally signed by</p><p>' + rewritten + '</p>',
    'data:image/png;base64,aa'
  ),
  '2589 SOS letter'
);
assert.ok(/urn:schemas-microsoft-com:office:word/.test(word));
assert.ok(/Digitally signed by/.test(word));
assert.ok(/mso-highlight:yellow/.test(word));
assert.ok(/letter-print-pages/.test(word));
assert.ok(/letter-official-footer/.test(word));
assert.ok(/2589 SOS letter/.test(word));
assert.ok(/font-size:\s*12pt/.test(Export.printLetterCss()), 'print body is 12pt Times like issued letters');
assert.ok(/line-height:\s*1\.15/.test(Export.printLetterCss()), 'print leading matches issued single spacing');
assert.ok(/\.letter-label-section\s*\{\s*font-weight:\s*700/.test(Export.printLetterCss()), 'SECTION: is bold');
assert.ok(/\.letter-field-label \{[^}]*font-weight:\s*400/.test(Export.printLetterCss()), 'SOURCE/ACTION are not bold');
assert.ok(!/\.letter-field-label \{[^}]*text-decoration:\s*underline/.test(Export.printLetterCss()), 'SOURCE/ACTION are not underlined');
assert.ok(/letter-label-section/.test(Export.letterItemsHtml([{ specs: ['#301001'], desc: 'GABC', subItems: [], actionNotes: 'Approved for use.' }], {
  esc: (s) => String(s),
  letterSectionLines: () => ['#301001 - GABC'],
  sourceLine: () => 'Vulcan',
  actionHtml: () => 'Approved for use.',
})));
assert.ok(/contenteditable="true"/.test(Export.letterItemsHtml([{ id: 3, specs: ['#301001'], desc: 'GABC', subItems: [], actionNotes: 'Approved for use.' }], {
  esc: (s) => String(s),
  letterSectionLines: () => ['#301001 - GABC'],
  sourceLine: () => 'Vulcan',
  actionHtml: () => 'Approved for use.',
})));
assert.ok(/margin-bottom:\s*12pt/.test(Export.printLetterCss()), 'blank line between SECTION / SOURCE / ACTION');

const ccBlock = Export.letterCcHtml([
  { name: 'John Mastrobuono', org: 'DelDOT' },
  { name: 'Aaron Wieczorek', org: 'DelDOT' },
  { name: 'Mark Schafer', org: 'DelDOT' },
], (s) => String(s));
assert.ok(/letter-cc-table/.test(ccBlock), 'cc uses a two-column table');
assert.ok(/letter-cc-label">cc:/.test(ccBlock), 'cc: stays in the label column');
assert.ok(/John Mastrobuono, DelDOT<br>Aaron Wieczorek, DelDOT<br>Mark Schafer, DelDOT/.test(ccBlock), 'names stack in the second column');
assert.ok(!/>cc: John/.test(ccBlock), 'names are not on the same line as cc:');
assert.ok(/letter-cc-table/.test(Export.printLetterCss()), 'print CSS aligns stacked cc names');
assert.ok(/letter-cc-table/.test(Export.wordCss()), 'Word CSS aligns stacked cc names');
assert.strictEqual(Export.letterCcHtml([], (s) => s), '<table class="letter-cc-table"><tr><td class="letter-cc-label">cc:&nbsp;</td><td class="letter-cc-names">(none)</td></tr></table>');

const { renderLetterHtml } = require('./letter-render.js');
const rendered = renderLetterHtml({
  project: { contract: '2572', title: 'Monarch', contractor: 'Nichols', date: '2026-09-08' },
  items: [],
  cc: [
    { name: 'John Mastrobuono', org: 'DelDOT' },
    { name: 'Aaron Wieczorek', org: 'DelDOT' },
  ],
  warnings: [],
});
assert.ok(/letter-cc-table/.test(rendered), 'rendered letter hangs cc names under the first name');
assert.ok(/Aaron Wieczorek, DelDOT/.test(rendered));

console.log('OK letter-export print highlights and Word wrap');
