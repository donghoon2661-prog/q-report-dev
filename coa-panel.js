(function (root) {
  'use strict';

  var CoaPages = (typeof module !== 'undefined' && module.exports)
    ? require('./coa-pages.js')
    : root.CoaPages;
  var CoaViewer = (typeof module !== 'undefined' && module.exports)
    ? require('./coa-viewer.js')
    : root.CoaViewer;

  var CSS = [
    '#qview .bd-split{display:flex;flex:1;min-height:0}',
    '#qview .bd-split>.bd-wrap{flex:0 1 auto;max-width:55%}',
    '#qview .pv-col{flex:1;min-width:0;display:flex;flex-direction:column;border-left:1px solid var(--line)}',
    '#qview .pv-head{display:flex;align-items:center;gap:12px;padding:10px 14px;border-bottom:1px solid var(--line);font-family:var(--mono);font-size:11.5px;color:var(--muted)}',
    '#qview .pv-open{margin-left:auto;color:var(--blue,#4DA3FF);text-decoration:none;white-space:nowrap}',
    '#qview .pv-pages{flex:1;overflow-y:auto;padding:12px 14px;display:flex;flex-direction:column;gap:10px;background:var(--panel2)}',
    '#qview .pv-page{display:block;width:100%;height:auto;background:#fff;border-radius:4px}',
    '#qview .pv-msg{font-size:12px;color:var(--muted);padding:20px 4px}',
    '#qview .pv-msg.pv-error{color:var(--gA)}',
    '@media (max-width:900px){#qview .bd-split>.bd-wrap{max-width:none;flex:1 1 auto}}'
  ].join('\n');

  var PDFJS_SRC = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
  var PDFJS_WORKER_SRC = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

  // Shared across every panel in the page: one <script> tag while a load is
  // in flight, so two panels opening at once do not fetch pdf.js twice.
  var pendingPdfjs = null;

  function defaultLoadPdfjs(win, doc) {
    if (win.pdfjsLib) return Promise.resolve(win.pdfjsLib);
    if (pendingPdfjs) return pendingPdfjs;

    pendingPdfjs = new Promise(function (resolve, reject) {
      var script = doc.createElement('script');
      script.src = PDFJS_SRC;
      script.onload = function () {
        win.pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS_WORKER_SRC;
        pendingPdfjs = null;
        resolve(win.pdfjsLib);
      };
      script.onerror = function (err) {
        // Forget the promise so a later call appends a fresh script.
        pendingPdfjs = null;
        reject(err);
      };
      doc.head.appendChild(script);
    });
    return pendingPdfjs;
  }

  function create(opts) {
    opts = opts || {};

    var modalBody = opts.modalBody;
    var doc = opts.document || (typeof document !== 'undefined' ? document : null);
    var win = opts.window || (typeof window !== 'undefined' ? window : null);
    var apiRoot = opts.apiRoot;
    var isDesktop = opts.isDesktop || function () { return true; };
    var createViewer = opts.createViewer || function (container, viewerOpts) {
      return CoaViewer.create(container, viewerOpts);
    };
    var msgs = opts.msgs || {};
    var loadPdfjs = opts.loadPdfjs || function () { return defaultLoadPdfjs(win, doc); };

    var split = null;
    var col = null;
    var head = null;
    var pagesEl = null;
    var viewer = null;

    var pdfjsLib = null;
    var pdfjsState = 0; // 0 = not started, 1 = pending, 2 = ready
    var pdfjsPromise = null;

    // Bumped by every request that should win, so a late-resolving load can
    // tell it has been superseded (or cancelled by close/mobile/invalid stem).
    var reqSeq = 0;
    var latest = null;

    function appendMsg(className, text) {
      var el = doc.createElement('div');
      el.className = className;
      el.textContent = text;
      pagesEl.appendChild(el);
    }

    function injectCss() {
      if (doc.getElementById('pv-style')) return;
      var style = doc.createElement('style');
      style.id = 'pv-style';
      style.textContent = CSS;
      doc.head.appendChild(style);
    }

    function buildLayout() {
      split = doc.createElement('div');
      split.className = 'bd-split';
      modalBody.parentNode.insertBefore(split, modalBody);
      split.appendChild(modalBody);

      col = doc.createElement('div');
      col.className = 'pv-col';
      split.appendChild(col);

      head = doc.createElement('div');
      head.className = 'pv-head';
      col.appendChild(head);

      pagesEl = doc.createElement('div');
      pagesEl.className = 'pv-pages';
      col.appendChild(pagesEl);

      injectCss();
    }

    function renderHead(stem, pagesStr) {
      head.textContent = '';
      var range = CoaPages.parsePageRange(pagesStr);
      var firstPage = range ? range.from : undefined;

      var rangeEl = doc.createElement('span');
      rangeEl.className = 'pv-range';
      rangeEl.textContent = 'p.' + pagesStr;
      head.appendChild(rangeEl);

      var openEl = doc.createElement('a');
      openEl.className = 'pv-open';
      openEl.href = CoaPages.coaPdfUrl(apiRoot, stem, firstPage);
      openEl.target = '_blank';
      openEl.rel = 'noopener noreferrer';
      openEl.textContent = msgs.open;
      head.appendChild(openEl);
    }

    function ensurePdfjs() {
      if (pdfjsState === 2) return Promise.resolve(pdfjsLib);
      if (pdfjsState === 1) return pdfjsPromise;
      pdfjsState = 1;
      pdfjsPromise = loadPdfjs().then(function (lib) {
        pdfjsLib = lib;
        pdfjsState = 2;
        return lib;
      }, function (err) {
        // Back to idle so the next showSector retries the loader.
        pdfjsState = 0;
        pdfjsPromise = null;
        throw err;
      });
      return pdfjsPromise;
    }

    function showSector(stem, pagesStr) {
      if (!isDesktop()) {
        if (col) {
          col.style.display = 'none';
          if (viewer) viewer.destroy();
        }
        reqSeq += 1;
        return;
      }

      if (!split) buildLayout();

      if (!CoaPages.coaPdfUrl(apiRoot, stem)) {
        col.style.display = 'none';
        if (viewer) viewer.destroy();
        reqSeq += 1;
        return;
      }

      col.style.display = '';
      renderHead(stem, pagesStr);

      var mySeq = ++reqSeq;
      latest = { stem: stem, pagesStr: pagesStr };

      if (pdfjsState !== 2) {
        pagesEl.textContent = '';
        appendMsg('pv-msg', msgs.loading);
      }

      ensurePdfjs().then(function (lib) {
        if (mySeq !== reqSeq) return;
        if (!viewer) {
          viewer = createViewer(pagesEl, {
            pdfjs: lib,
            apiRoot: apiRoot,
            pixelRatio: win.devicePixelRatio || 1,
            msgLoading: msgs.loading,
            msgError: msgs.error,
            msgNoPages: msgs.noPages
          });
        }
        viewer.show(latest.stem, latest.pagesStr);
      }, function () {
        if (mySeq !== reqSeq) return;
        pagesEl.textContent = '';
        appendMsg('pv-msg pv-error', msgs.error);
      });
    }

    function close() {
      reqSeq += 1;
      if (viewer) viewer.destroy();
    }

    return { showSector: showSector, close: close };
  }

  var api = { create: create, defaultLoadPdfjs: defaultLoadPdfjs, CSS: CSS };

  root.CoaPanel = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof self !== 'undefined' ? self : this);
