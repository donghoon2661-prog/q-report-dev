(function (root) {
  'use strict';

  var PHYS_KEYS = [
    'ba_t_max', 'ba_t_min', 'ba_t_avg',
    'ba_e_max', 'ba_e_min', 'ba_e_avg',
    'aa_t_max', 'aa_t_min', 'aa_t_avg',
    'aa_e_max', 'aa_e_min', 'aa_e_avg'
  ];

  function isPhysKey(key) {
    return PHYS_KEYS.indexOf(key) !== -1;
  }

  function isMissing(v) {
    return v === null || v === undefined;
  }

  function shouldMerge(key, sizes, rows, mixed) {
    if (!mixed) return false;
    if (!isPhysKey(key)) return false;
    if (!sizes || sizes.length < 2) return false;
    var first = rows[sizes[0]] ? rows[sizes[0]][key] : undefined;
    if (isMissing(first)) return false;
    for (var i = 1; i < sizes.length; i++) {
      var v = rows[sizes[i]] ? rows[sizes[i]][key] : undefined;
      if (isMissing(v) || v !== first) return false;
    }
    return true;
  }

  function rowHtml(key, label, sizes, rows, mixed, classOf) {
    if (shouldMerge(key, sizes, rows, mixed)) {
      var v = rows[sizes[0]][key];
      var cls = (classOf(key, v, sizes[0]) + ' mixed').trim();
      return '<tr><td>' + label + '</td><td class="' + cls +
        '" colspan="' + sizes.length + '" style="text-align:center">' + v + '</td></tr>';
    }
    var html = '<tr><td>' + label + '</td>';
    for (var i = 0; i < sizes.length; i++) {
      var size = sizes[i];
      var value = rows[size] ? rows[size][key] : undefined;
      html += '<td class="' + classOf(key, value, size) + '">' +
        (value == null ? '—' : value) + '</td>';
    }
    return html + '</tr>';
  }

  function groupTitle(title, keys, mixed, n, lang) {
    if (!mixed) return title;
    var hasPhys = false;
    for (var i = 0; i < keys.length; i++) {
      if (isPhysKey(keys[i])) { hasPhys = true; break; }
    }
    if (!hasPhys) return title;
    var suffix = lang === 'en' ? ' · mixed sizes' : ' · 사이즈 혼합';
    if (Number.isInteger(n) && n > 0) suffix += ' (n=' + n + ')';
    return title + suffix;
  }

  var api = {
    PHYS_KEYS: PHYS_KEYS,
    rowHtml: rowHtml,
    groupTitle: groupTitle
  };

  root.CoaTable = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof self !== 'undefined' ? self : this);
