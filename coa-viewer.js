(function (root) {
  'use strict';

  var CoaPages = (typeof module !== 'undefined' && module.exports)
    ? require('./coa-pages.js')
    : root.CoaPages;

  function create(container, opts) {
    opts = opts || {};

    var dom = opts.document || (typeof document !== 'undefined' ? document : null);
    var pdfjs = opts.pdfjs;
    var apiRoot = opts.apiRoot;
    var pixelRatio = opts.pixelRatio === undefined ? 1 : opts.pixelRatio;
    var maxPages = opts.maxPages === undefined ? 20 : opts.maxPages;
    var msgLoading = opts.msgLoading;
    var msgError = opts.msgError;
    var msgNoPages = opts.msgNoPages;

    var cachedStem = null;
    var cachedDoc = null;
    // In-flight loads keyed by stem, so a second show() of the same stem
    // reuses the download already under way instead of starting another.
    var pendingLoads = Object.create(null);
    // The load the newest show() is still waiting for. Any other load that
    // resolves later has nobody waiting and must be destroyed, not cached.
    var activeLoad = null;
    // Bumped by every show()/destroy(); a stale show uses it to go silent.
    var token = 0;

    function isCurrent(myToken) {
      return myToken === token;
    }

    function clear() {
      container.textContent = '';
    }

    function appendMessage(className, text) {
      var el = dom.createElement('div');
      el.className = className;
      el.textContent = text;
      container.appendChild(el);
    }

    function renderPages(doc, pages, myToken) {
      var index = 0;

      function next() {
        if (!isCurrent(myToken)) return;
        if (index >= pages.length) return;
        var n = pages[index++];
        return doc.getPage(n).then(function (page) {
          if (!isCurrent(myToken)) return;
          var base = page.getViewport({ scale: 1 });
          var fit = container.clientWidth > 0 ? container.clientWidth / base.width : 1;
          var vp = page.getViewport({ scale: fit * pixelRatio });
          var canvas = dom.createElement('canvas');
          canvas.className = 'pv-page';
          canvas.setAttribute('data-page', String(n));
          canvas.width = Math.floor(vp.width);
          canvas.height = Math.floor(vp.height);
          canvas.style.width = '100%';
          return page.render({ canvasContext: canvas.getContext('2d'), viewport: vp }).promise.then(function () {
            if (!isCurrent(myToken)) return;
            container.appendChild(canvas);
            return next();
          });
        });
      }

      return next();
    }

    function destroyQuietly(doc) {
      try {
        var result = doc.destroy();
        if (result && typeof result.then === 'function') {
          result.then(null, function () {});
        }
      } catch (e) {
        // The doc is already unreachable; a failing cleanup must not escape.
      }
    }

    function beginLoad(stem) {
      var load = { stem: stem, promise: null };
      load.promise = pdfjs.getDocument(CoaPages.coaPdfUrl(apiRoot, stem)).promise.then(function (doc) {
        if (pendingLoads[stem] === load) delete pendingLoads[stem];
        if (activeLoad === load) {
          if (cachedDoc) cachedDoc.destroy();
          cachedDoc = doc;
          cachedStem = stem;
          activeLoad = null;
        } else {
          destroyQuietly(doc);
        }
        return doc;
      }, function (err) {
        if (pendingLoads[stem] === load) delete pendingLoads[stem];
        if (activeLoad === load) activeLoad = null;
        throw err;
      });
      return load;
    }

    function show(stem, rangeStr) {
      var myToken = ++token;

      var url = CoaPages.coaPdfUrl(apiRoot, stem);
      var range = CoaPages.parsePageRange(rangeStr);
      if (!url || !range) {
        clear();
        appendMessage('pv-msg pv-error', msgError);
        return Promise.resolve();
      }

      clear();
      appendMessage('pv-msg', msgLoading);

      var pending;
      if (cachedDoc && cachedStem === stem) {
        // No pending load is wanted any more once we serve from cache.
        activeLoad = null;
        pending = Promise.resolve(cachedDoc);
      } else {
        var load = pendingLoads[stem];
        if (!load) {
          if (cachedDoc) {
            cachedDoc.destroy();
            cachedDoc = null;
            cachedStem = null;
          }
          load = beginLoad(stem);
          pendingLoads[stem] = load;
        }
        activeLoad = load;
        pending = load.promise;
      }

      return pending.then(function (doc) {
        if (!isCurrent(myToken)) return;
        var pages = CoaPages.pagesToRender(range, doc.numPages, maxPages);
        if (!pages.length) {
          clear();
          appendMessage('pv-msg pv-error', msgNoPages);
          return;
        }
        clear();
        return renderPages(doc, pages, myToken);
      }, function () {
        if (isCurrent(myToken)) {
          clear();
          appendMessage('pv-msg pv-error', msgError);
        }
      }).catch(function () {});
    }

    function destroy() {
      token += 1;
      // Any in-flight load now has no owner; it destroys itself on resolve.
      activeLoad = null;
      pendingLoads = Object.create(null);
      if (cachedDoc) {
        cachedDoc.destroy();
        cachedDoc = null;
        cachedStem = null;
      }
      clear();
    }

    return { show: show, destroy: destroy };
  }

  var api = { create: create };

  root.CoaViewer = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof self !== 'undefined' ? self : this);
