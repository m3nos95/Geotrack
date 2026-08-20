'use strict';
const assert = require('assert');
const Export = require('./letter-export.js');
const { letterCss } = require('./letter-render.js');

assert.ok(/user-highlight/.test(Export.printLetterCss()), 'print CSS styles user highlights');
assert.ok(/print-color-adjust:\s*exact/.test(Export.printLetterCss()), 'print CSS forces highlight colors');
assert.ok(/box-shadow:\s*inset/.test(Export.printLetterCss()), 'print CSS keeps yellow when Background graphics is off');
assert.ok(/position:\s*fixed/.test(Export.printLetterCss()), 'print CSS still pins the DelDOT logo');
assert.ok(/padding-bottom:\s*10pt/.test(Export.printLetterCss()), 'print CSS leaves room under the signature');

assert.ok(/user-highlight/.test(letterCss()), 'letter-render print CSS includes highlights');
assert.ok(/print-color-adjust/.test(letterCss()));

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
  '<p>Digitally signed by</p><p>' + rewritten + '</p><div class="letter-official-footer"><img src="data:image/png;base64,aa" alt="DelDOT"></div>',
  '2589 SOS letter'
);
assert.ok(/urn:schemas-microsoft-com:office:word/.test(word));
assert.ok(/Digitally signed by/.test(word));
assert.ok(/mso-highlight:yellow/.test(word));
assert.ok(/letter-official-footer/.test(word));
assert.ok(/2589 SOS letter/.test(word));

console.log('OK letter-export print highlights and Word wrap');
