/* Browser helpers: store consultant proposal PDFs and paint them on the NTP packet. */
(function (global) {
  "use strict";

  var DB_NAME = "contrak_pdfs_v1";
  var STORE = "pdfs";
  var WORKER = "https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js";

  function openDb() {
    return new Promise(function (resolve, reject) {
      if (!global.indexedDB) {
        reject(new Error("This browser cannot store proposal PDFs"));
        return;
      }
      var req = global.indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = function () {
        if (!req.result.objectStoreNames.contains(STORE)) {
          req.result.createObjectStore(STORE);
        }
      };
      req.onsuccess = function () {
        resolve(req.result);
      };
      req.onerror = function () {
        reject(req.error);
      };
    });
  }

  function withStore(mode, fn) {
    return openDb().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction(STORE, mode);
        var store = tx.objectStore(STORE);
        var req = fn(store);
        req.onsuccess = function () {
          resolve(req.result);
        };
        req.onerror = function () {
          reject(req.error);
        };
      });
    });
  }

  function savePdf(qpId, blob, meta) {
    meta = meta || {};
    return withStore("readwrite", function (store) {
      return store.put(
        {
          blob: blob,
          name: meta.name || "proposal.pdf",
          type: blob.type || "application/pdf",
          size: blob.size || 0,
        },
        String(qpId)
      );
    });
  }

  function loadPdf(qpId) {
    return withStore("readonly", function (store) {
      return store.get(String(qpId));
    }).then(function (row) {
      return row && row.blob ? row : null;
    });
  }

  function removePdf(qpId) {
    return withStore("readwrite", function (store) {
      return store.delete(String(qpId));
    });
  }

  function blobToDataUrl(blob) {
    return new Promise(function (resolve, reject) {
      var r = new FileReader();
      r.onload = function () {
        resolve(r.result);
      };
      r.onerror = function () {
        reject(r.error);
      };
      r.readAsDataURL(blob);
    });
  }

  function dataUrlToBlob(url) {
    var m = String(url || "").match(/^data:([^;]+);base64,(.+)$/);
    if (!m) return null;
    var bin = atob(m[2]);
    var arr = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    return new Blob([arr], { type: m[1] || "application/pdf" });
  }

  function ensurePdfJs() {
    var lib = global.pdfjsLib;
    if (!lib) throw new Error("PDF library did not load — check your network");
    if (!lib.GlobalWorkerOptions.workerSrc) lib.GlobalWorkerOptions.workerSrc = WORKER;
    return lib;
  }

  function copyPdfData(arrayBuffer) {
    return new Uint8Array(arrayBuffer.slice(0)).buffer;
  }

  function extractText(arrayBuffer) {
    var lib = ensurePdfJs();
    return lib.getDocument({ data: copyPdfData(arrayBuffer) }).promise.then(function (pdf) {
      var chain = Promise.resolve([]);
      var i;
      for (i = 1; i <= pdf.numPages; i++) {
        chain = chain.then(
          (function (n) {
            return function (lines) {
              return pdf.getPage(n).then(function (page) {
                return page.getTextContent().then(function (tc) {
                  var row = "";
                  var lastY = null;
                  (tc.items || []).forEach(function (it) {
                    var y = it.transform ? it.transform[5] : 0;
                    if (lastY != null && Math.abs(y - lastY) > 3) {
                      lines.push(row.replace(/\s+/g, " ").trim());
                      row = "";
                    }
                    lastY = y;
                    var str = String(it.str || "");
                    if (!str) return;
                    row += (row && !/\s$/.test(row) && !/^\s/.test(str) ? " " : "") + str;
                  });
                  if (row.trim()) lines.push(row.replace(/\s+/g, " ").trim());
                  lines.push("");
                  return lines;
                });
              });
            };
          })(i)
        );
      }
      return chain.then(function (lines) {
        return { text: lines.join("\n"), pageCount: pdf.numPages };
      });
    });
  }

  function renderPages(arrayBuffer, host) {
    var lib = ensurePdfJs();
    host.innerHTML = "";
    return lib.getDocument({ data: copyPdfData(arrayBuffer) }).promise.then(function (pdf) {
      var chain = Promise.resolve();
      var i;
      for (i = 1; i <= pdf.numPages; i++) {
        chain = chain.then(
          (function (n) {
            return function () {
              return pdf.getPage(n).then(function (page) {
                var scale = 2;
                var viewport = page.getViewport({ scale: scale });
                var article = document.createElement("article");
                article.className = "letter-page ntp-proposal-scan";
                var canvas = document.createElement("canvas");
                canvas.width = viewport.width;
                canvas.height = viewport.height;
                return page
                  .render({
                    canvasContext: canvas.getContext("2d"),
                    viewport: viewport,
                  })
                  .promise.then(function () {
                    var img = document.createElement("img");
                    img.alt = "Consultant proposal page " + n;
                    img.src = canvas.toDataURL("image/png");
                    article.appendChild(img);
                    host.appendChild(article);
                  });
              });
            };
          })(i)
        );
      }
      return chain;
    });
  }

  function paintQp(qpId, host) {
    if (!host) return Promise.resolve();
    return loadPdf(qpId).then(function (row) {
      if (!row || !row.blob || !row.blob.size) {
        host.innerHTML =
          '<article class="letter-page ntp-proposal"><p>The original consultant proposal PDF is not in this browser. Drop it again on the Proposal tab.</p></article>';
        return;
      }
      return row.blob.arrayBuffer().then(function (buf) {
        if (!buf || !buf.byteLength) {
          host.innerHTML =
            '<article class="letter-page ntp-proposal"><p>The stored proposal PDF is empty. Drop the consultant file again.</p></article>';
          return;
        }
        return renderPages(buf, host);
      });
    });
  }

  function collectPdfs(state) {
    var out = {};
    var jobs = [];
    (state.contracts || []).forEach(function (c) {
      (c.tasks || []).forEach(function (t) {
        (t.qps || []).forEach(function (q) {
          if (!q.proposalPdf) return;
          jobs.push(
            loadPdf(q.id).then(function (row) {
              if (!row || !row.blob) return;
              return blobToDataUrl(row.blob).then(function (url) {
                out[q.id] = { name: row.name || q.proposalPdf.name, dataUrl: url };
              });
            })
          );
        });
      });
    });
    return Promise.all(jobs).then(function () {
      return out;
    });
  }

  function restorePdfs(map) {
    map = map || {};
    var jobs = Object.keys(map).map(function (id) {
      var row = map[id];
      var blob = dataUrlToBlob(row && row.dataUrl);
      if (!blob) return Promise.resolve();
      return savePdf(id, blob, { name: (row && row.name) || "proposal.pdf" });
    });
    return Promise.all(jobs);
  }

  global.ConTrakPdf = {
    savePdf: savePdf,
    loadPdf: loadPdf,
    removePdf: removePdf,
    extractText: extractText,
    renderPages: renderPages,
    paintQp: paintQp,
    collectPdfs: collectPdfs,
    restorePdfs: restorePdfs,
    blobToDataUrl: blobToDataUrl,
  };
})(typeof window !== "undefined" ? window : global);
