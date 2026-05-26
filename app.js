var DOCTORS = [];
var fuseName, fuseAddress;
var fuseOptions = { threshold: 0.35, distance: 200, minMatchCharLength: 2, includeScore: true };

var COUNTER_URL = 'https://api.counterapi.dev/v1/gmslookup/searches';
var lookupCounted = false;

function updateLookupCountDisplay(count) {
  var el = document.getElementById('lookupCount');
  if (el && count != null) el.textContent = Number(count).toLocaleString() + ' GP lookups and counting...';
}

fetch(COUNTER_URL)
  .then(function(r) { return r.json(); })
  .then(function(d) { updateLookupCountDisplay(d.count); })
  .catch(function() {});

var searchInput = document.getElementById('searchInput');
var clearBtn    = document.getElementById('clearBtn');
var resultsDiv  = document.getElementById('results');
var hintText    = document.getElementById('hintText');
var currentMode = 'exact';
var timer;

document.getElementById('totalCount').textContent = '...';

fetch('/.netlify/functions/doctors?v=3')
  .then(function(r) { return r.json(); })
  .then(function(res) {
    DOCTORS     = res.doctors;
    fuseName    = new Fuse(DOCTORS, Object.assign({}, fuseOptions, { keys: ['name'] }));
    fuseAddress = new Fuse(DOCTORS, Object.assign({}, fuseOptions, { keys: ['address'] }));
    document.getElementById('totalCount').textContent = DOCTORS.length.toLocaleString();
    if (res.fileDate) {
      var d = new Date(res.fileDate);
      var formatted = d.toLocaleDateString('en-IE', { day: 'numeric', month: 'long', year: 'numeric' });
      document.getElementById('pubNote').textContent = 'Source: HSE GMS Scheme · Updated ' + formatted;
    }
    if (searchInput.value.trim().length >= 2) doSearch();
  })
  .catch(function() {
    document.getElementById('totalCount').textContent = '–';
  });

function setMode(mode) {
  currentMode = mode;
  document.getElementById('tabFuzzy').classList.toggle('active', mode === 'fuzzy');
  document.getElementById('tabExact').classList.toggle('active', mode === 'exact');
  if (mode === 'fuzzy') {
    hintText.textContent = 'Fuzzy · word order doesn\'t matter · tolerates typos';
  } else {
    hintText.textContent = 'Exact · precise name, GMS number or IMC number match';
  }
  if (searchInput.value.trim().length >= 2) doSearch();
}

searchInput.addEventListener('input', function() {
  clearTimeout(timer);
  timer = setTimeout(doSearch, 220);
  clearBtn.style.display = searchInput.value ? 'block' : 'none';
});

searchInput.addEventListener('keydown', function(e) {
  if (e.key === 'Escape') clearSearch();
});

function clearSearch() {
  searchInput.value = '';
  clearBtn.style.display = 'none';
  resultsDiv.style.display = 'none';
  resultsDiv.innerHTML = '';
  searchInput.focus();
}

function fuzzySearch(query) {
  if (!fuseName) return [];
  var words = query.trim().split(/\s+/).filter(function(w) { return w.length >= 2; });
  if (words.length === 0) return [];
  var sets = words.map(function(word) {
    var hits = {};
    fuseName.search(word).forEach(function(r) { hits[r.item.gms + '|' + r.item.name] = true; });
    fuseAddress.search(word).forEach(function(r) { hits[r.item.gms + '|' + r.item.name] = true; });
    return hits;
  });
  var intersection = sets[0];
  for (var i = 1; i < sets.length; i++) {
    var next = {};
    Object.keys(intersection).forEach(function(k) { if (sets[i][k]) next[k] = true; });
    intersection = next;
  }
  return DOCTORS.filter(function(d) { return intersection[d.gms + '|' + d.name]; });
}

function normalize(s) {
  return s.toUpperCase().replace(/[‘’‚‛`]/g, "’");
}

function exactSearch(query) {
  var q = normalize(query);
  var isNum = /^\d+$/.test(query);
  if (isNum) {
    var gmsExact   = DOCTORS.filter(function(d) { return d.gms === query; });
    var imcExact   = DOCTORS.filter(function(d) { return d.imc === query; });
    var gmsPartial = DOCTORS.filter(function(d) { return d.gms !== query && d.gms.includes(query); });
    var imcPartial = DOCTORS.filter(function(d) { return d.imc && d.imc !== query && d.imc.includes(query); });
    var seen = {};
    var results = [];
    [gmsExact, imcExact, gmsPartial, imcPartial].forEach(function(arr) {
      arr.forEach(function(d) {
        if (!seen[d.gms]) { seen[d.gms] = true; results.push(d); }
      });
    });
    return results;
  }
  return DOCTORS.filter(function(d) { return normalize(d.name).includes(q) || normalize(d.address).includes(q); });
}

function escRe(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

function hl(text, words) {
  if (!words || words.length === 0) return text;
  return text.replace(new RegExp('(' + words.map(escRe).join('|') + ')', 'gi'), '<mark>$1</mark>');
}

function doSearch() {
  if (!DOCTORS.length) return;
  var raw = searchInput.value.trim();
  if (raw.length < 2) { resultsDiv.style.display = 'none'; return; }

  var isNum = /^\d+$/.test(raw);
  var matches = currentMode === 'fuzzy' && !isNum ? fuzzySearch(raw) : exactSearch(raw);
  render(matches, raw, isNum);
}

function render(matches, query, isNum) {
  resultsDiv.style.display = 'block';
  resultsDiv.innerHTML = '';

  var isGmsExact = isNum && matches.some(function(d) { return d.gms === query; });
  var isImcExact = isNum && !isGmsExact && matches.some(function(d) { return d.imc === query; });
  var words   = isNum ? [] : query.trim().split(/\s+/).filter(function(w) { return w.length >= 2; });

  var s = document.createElement('div');
  if (matches.length === 0) {
    s.className = 'status-notfound';
    s.innerHTML = '<span class="status-icon"><svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M15 9l-6 6M9 9l6 6"/></svg></span>' +
      (isNum ? '<span>Number <strong>' + query + '</strong> not found on the scheme list.</span>'
             : '<span>No results found for <strong>' + query + '</strong>.</span>');
  } else if (isGmsExact) {
    s.className = 'status-found';
    s.innerHTML = '<span class="status-icon"><svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg></span>' +
      '<span>GMS number <strong>' + query + '</strong> confirmed on the scheme list.</span>';
  } else if (isImcExact) {
    s.className = 'status-found';
    s.innerHTML = '<span class="status-icon"><svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg></span>' +
      '<span>IMC number <strong>' + query + '</strong> confirmed on the scheme list.</span>';
  }
  resultsDiv.appendChild(s);
  if (matches.length === 0) return;

  if (!lookupCounted) {
    lookupCounted = true;
    fetch(COUNTER_URL + '/up')
      .then(function(r) { return r.json(); })
      .then(function(d) { updateLookupCountDisplay(d.count); })
      .catch(function() {});
  }

  var h = document.createElement('div');
  h.className = 'results-header';
  h.innerHTML = '<span>Results</span><span class="results-count">' + matches.length + ' match' + (matches.length !== 1 ? 'es' : '') + '</span>';
  resultsDiv.appendChild(h);

  matches.slice(0, 50).forEach(function(d) {
    var c = document.createElement('div');
    c.className = 'result-card';
    c.innerHTML =
      '<div class="card-top">' +
        '<div class="doctor-name">' + hl(d.name, words) + '</div>' +
        '<div class="badge-group">' +
          '<div class="gms-badge">GMS ' + hl(d.gms, isNum ? [query] : []) + '</div>' +
          (d.imc ? '<div class="imc-badge">IMC ' + hl(d.imc, isNum ? [query] : []) + '</div>' : '') +
        '</div>' +
      '</div>' +
      '<div class="doctor-address">' + hl(d.address, words) + '</div>';
    resultsDiv.appendChild(c);
  });

  if (matches.length > 50) {
    var m = document.createElement('p');
    m.className = 'more-note';
    m.textContent = '+ ' + (matches.length - 50) + ' more — refine your search to see all';
    resultsDiv.appendChild(m);
  }
}
