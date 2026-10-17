(function (root) {
  'use strict';

  function parsePageRange(s) {
    if (typeof s !== 'string') return null;
    var m = /^\s*(\d+)\s*(?:~\s*(\d+)\s*)?$/.exec(s);
    if (!m) return null;
    var from = Number(m[1]);
    var to = m[2] === undefined ? from : Number(m[2]);
    if (!Number.isSafeInteger(from) || !Number.isSafeInteger(to)) return null;
    if (from < 1 || to < 1 || from > to) return null;
    return { from: from, to: to };
  }

  function pagesToRender(range, numPages, maxPages) {
    if (maxPages === undefined) maxPages = 20;
    if (!range || !Number.isInteger(numPages) || numPages <= 0) return [];
    if (!Number.isInteger(maxPages) || maxPages <= 0) return [];
    var out = [];
    var last = Math.min(range.to, numPages);
    for (var p = range.from; p <= last; p++) {
      if (p >= 1) out.push(p);
      if (out.length >= maxPages) break;
    }
    return out;
  }

  function coaPdfUrl(apiRoot, stem, page) {
    if (typeof stem !== 'string' || !/^[A-Za-z0-9_\-]{3,80}$/.test(stem)) return null;
    var base = apiRoot;
    if (typeof base === 'string' && base.charAt(base.length - 1) === '/') {
      base = base.slice(0, -1);
    }
    var url = base + '/coa-pdf?sheet=' + encodeURIComponent(stem);
    if (Number.isInteger(page) && page > 0) url += '#page=' + page;
    return url;
  }

  var api = {
    parsePageRange: parsePageRange,
    pagesToRender: pagesToRender,
    coaPdfUrl: coaPdfUrl
  };

  root.CoaPages = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof self !== 'undefined' ? self : this);
