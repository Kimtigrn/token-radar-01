/* Token Radar dashboard — renders window.RADAR (written by main.ts from the
   sealed snapshot) with no network: no fetch, no fonts, no outside links.
   Board, detail view per protocol, live-token view, filters and sorting.
   State lives in the URL so a view can be linked: #/protocol/<slug> opens
   a detail view; ?category=&chain=&watchlist=1&min_tvl=&sort=&q= presets
   the board filters. */
(function () {
  'use strict';
  var R = window.RADAR;
  var app = document.getElementById('app');
  if (!R || !R.rows) {
    app.innerHTML = '<p class="loading">No radar data was loaded. Run main.ts first so it writes data.js beside this page.</p>';
    return;
  }

  /* ---------- small helpers ---------- */
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function money(n) {
    if (n >= 1e12) return '$' + (n / 1e12).toFixed(2) + 'T';
    if (n >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (n >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (n >= 1e3) return '$' + (n / 1e3).toFixed(1) + 'K';
    return '$' + Math.round(n);
  }
  function moneyFull(n) { return '$' + Math.round(n).toLocaleString('en-US'); }
  function pct(n) {
    if (n === null || n === undefined) return '—';
    return (n >= 0 ? '+' : '') + n.toFixed(1) + '%';
  }
  function ageText(d) {
    if (d === null || d === undefined) return '—';
    if (d < 30) return d + 'd';
    if (d < 365) return Math.round(d / 30.4) + 'mo';
    return (d / 365).toFixed(1) + 'y';
  }
  function stepParts(step) {
    var m = step.match(/^(.*?) Cost: (.*?)\. Time: (.*?)\.?$/);
    if (!m) return { text: step, cost: '', time: '' };
    return { text: m[1], cost: m[2], time: m[3] };
  }

  /* ---------- state ---------- */
  var params = new URLSearchParams(window.location.search);
  var state = {
    q: params.get('q') || '',
    category: params.get('category') || '',
    chain: params.get('chain') || '',
    watchlistOnly: params.get('watchlist') === '1',
    minTvl: parseFloat(params.get('min_tvl') || '0') || 0,
    sort: params.get('sort') || 'value',
    tab: 'board',
    selected: null,
  };
  function selectedFromHash() {
    var m = window.location.hash.match(/^#\/protocol\/([A-Za-z0-9._-]+)/);
    return m ? m[1] : null;
  }
  state.selected = selectedFromHash();

  var bySlug = {};
  R.rows.forEach(function (r) { bySlug[r.slug] = r; });
  var categories = Array.from(new Set(R.rows.map(function (r) { return r.category; }).filter(Boolean))).sort();
  var chains = Array.from(new Set(R.rows.reduce(function (a, r) { return a.concat(r.chains); }, []))).sort();
  var maxImplied = R.rows.length ? R.rows[0].implied_value_usd : 1;

  /* ---------- filtering + sorting ---------- */
  function filteredRows() {
    var q = state.q.trim().toLowerCase();
    var rows = R.rows.filter(function (r) {
      if (state.watchlistOnly && !r.watchlist) return false;
      if (state.category && r.category !== state.category) return false;
      if (state.chain && r.chains.indexOf(state.chain) === -1) return false;
      if (r.tvl_usd < state.minTvl) return false;
      if (q && (r.name + ' ' + r.slug + ' ' + (r.category || '')).toLowerCase().indexOf(q) === -1) return false;
      return true;
    });
    var sorts = {
      value: function (a, b) { return b.implied_value_usd - a.implied_value_usd; },
      tvl: function (a, b) { return b.tvl_usd - a.tvl_usd; },
      growth: function (a, b) { return (b.change_7d || 0) - (a.change_7d || 0); },
      age: function (a, b) { return (b.age_days || 0) - (a.age_days || 0); },
      name: function (a, b) { return a.name < b.name ? -1 : 1; },
    };
    return rows.slice().sort(sorts[state.sort] || sorts.value);
  }

  /* ---------- skeleton (built once; filters keep focus) ---------- */
  var totalImplied = R.total_implied_usd;
  var sortedImplied = R.rows.map(function (r) { return r.implied_value_usd; }).sort(function (a, b) { return a - b; });
  var medianImplied = sortedImplied.length ? sortedImplied[Math.floor(sortedImplied.length / 2)] : 0;
  var topCat = categories.map(function (c) {
    return { c: c, n: R.rows.filter(function (r) { return r.category === c; }).length };
  }).sort(function (a, b) { return b.n - a.n; })[0];

  app.innerHTML =
    '<div class="wrap">' +
    '<header class="hero">' +
    '<div class="eyebrow">Token Radar &middot; pre-token protocol board</div>' +
    '<h1>Which protocol&rsquo;s launch would be worth the most <span class="thin">&mdash; and how to farm it</span></h1>' +
    '<p class="lede">Every protocol DefiLlama tracks that <b>records no token</b> and is not a wrapped, staked or bridged ' +
    'product of one that trades, ranked by a model-implied launch value worked out from the snapshot itself. ' +
    'The board covers the whole house watchlist (' + R.watchlist_size + ' protocols at or above $50M TVL) plus ' +
    R.early_size + ' early ones below the floor, down to $5M TVL. Click any row for its farm plan.</p>' +
    '<div class="stats">' +
    '<div class="stat"><div class="n">' + R.board_size + '</div><div class="l">protocols ranked</div><div class="s">' + R.watchlist_size + ' watchlist &middot; ' + R.early_size + ' early</div></div>' +
    '<div class="stat"><div class="n">' + money(totalImplied) + '</div><div class="l">total implied value</div><div class="s">sum of the board&rsquo;s implied values</div></div>' +
    '<div class="stat"><div class="n">' + money(medianImplied) + '</div><div class="l">median implied value</div><div class="s">half the board is above this</div></div>' +
    '<div class="stat"><div class="n">' + esc(topCat ? topCat.c : '—') + '</div><div class="l">biggest category</div><div class="s">' + (topCat ? topCat.n : 0) + ' protocols on the board</div></div>' +
    '<div class="stat"><div class="n">' + esc(R.as_of) + '</div><div class="l">snapshot date</div><div class="s">frozen DefiLlama data</div></div>' +
    '</div>' +
    '<div class="spot" id="spot"></div>' +
    '<nav class="tabs" role="tablist">' +
    '<button class="tab" data-tab="board" role="tab" aria-selected="true">Board</button>' +
    '<button class="tab" data-tab="live" role="tab" aria-selected="false">Live tokens (' + R.live_size + ')</button>' +
    '<button class="tab" data-tab="method" role="tab" aria-selected="false">How the value is worked out</button>' +
    '</nav>' +
    '<section id="boardSection">' +
    '<div id="detail"></div>' +
    '<div class="controls" id="controls">' +
    '<input type="search" id="q" placeholder="Search name, slug or category…" value="' + esc(state.q) + '" aria-label="Search protocols">' +
    '<select id="category" aria-label="Filter by category"><option value="">All categories</option>' +
    categories.map(function (c) { return '<option value="' + esc(c) + '"' + (state.category === c ? ' selected' : '') + '>' + esc(c) + '</option>'; }).join('') +
    '</select>' +
    '<select id="chain" aria-label="Filter by chain"><option value="">All chains</option>' +
    chains.map(function (c) { return '<option value="' + esc(c) + '"' + (state.chain === c ? ' selected' : '') + '>' + esc(c) + '</option>'; }).join('') +
    '</select>' +
    '<select id="minTvl" aria-label="Minimum TVL">' +
    [[0, 'Any TVL'], [50000000, '$50M+ TVL'], [100000000, '$100M+ TVL'], [500000000, '$500M+ TVL'], [1000000000, '$1B+ TVL']].map(function (o) {
      return '<option value="' + o[0] + '"' + (state.minTvl === o[0] ? ' selected' : '') + '>' + o[1] + '</option>';
    }).join('') +
    '</select>' +
    '<select id="sort" aria-label="Sort by">' +
    [['value', 'Sort: implied value'], ['tvl', 'Sort: TVL'], ['growth', 'Sort: 7-day growth'], ['age', 'Sort: age'], ['name', 'Sort: name']].map(function (o) {
      return '<option value="' + o[0] + '"' + (state.sort === o[0] ? ' selected' : '') + '>' + o[1] + '</option>';
    }).join('') +
    '</select>' +
    '<label><input type="checkbox" id="watchlistOnly"' + (state.watchlistOnly ? ' checked' : '') + '> Watchlist only</label>' +
    '<button class="reset" id="resetFilters" type="button">Reset</button>' +
    '</div>' +
    '<p class="count" id="count"></p>' +
    '<div class="tablewrap"><table><thead><tr>' +
    '<th>#</th><th>Protocol</th><th>Category</th><th>Chains</th><th class="num">TVL</th><th class="num">7d</th><th class="num">Age</th><th class="num">Implied value</th><th class="num">&times; TVL</th>' +
    '</tr></thead><tbody id="tbody"></tbody></table></div>' +
    '</section>' +
    '<section id="liveSection" hidden></section>' +
    '<section id="methodSection" hidden></section>' +
    '<footer><p>Source: DefiLlama public protocols data, frozen snapshot of ' + esc(R.as_of) + ' (' + esc(R.source.replace(/^DefiLlama /, '')) + '). ' +
    'Model ' + esc(R.model_version) + '. Board generated by main.ts from that snapshot alone; no live data is fetched by this page.</p>' +
    '<p>&ldquo;Records no token&rdquo; means DefiLlama&rsquo;s record carries no token for the protocol — it is not proof the protocol has none, and nothing here predicts whether or when a token launches. Implied values are this radar&rsquo;s model claim, not a price, and the farmer pool is a labelled 5% yardstick, not a promise. This is research, not financial advice.</p></footer>' +
    '</div>';

  /* ---------- spotlight ---------- */
  document.getElementById('spot').innerHTML = R.rows.slice(0, 5).map(function (r) {
    return '<article data-slug="' + esc(r.slug) + '" tabindex="0" role="button" aria-label="Open ' + esc(r.name) + '">' +
      '<div class="rk">#' + r.rank + ' &middot; ' + esc(r.category || 'Uncategorised') + '</div>' +
      '<div class="nm">' + esc(r.name) + '</div>' +
      '<div class="vl">' + money(r.implied_value_usd) + '</div>' +
      '<div class="ct">TVL ' + money(r.tvl_usd) + ' &middot; ' + pct(r.change_7d) + ' 7d</div></article>';
  }).join('');

  /* ---------- board table ---------- */
  function renderBoard() {
    var rows = filteredRows();
    var parts = [];
    parts.push('<p class="count" id="count">');
    var bits = ['Showing <b>' + rows.length + '</b> of <b>' + R.board_size + '</b> ranked protocols'];
    if (state.category) bits.push('category: <b>' + esc(state.category) + '</b>');
    if (state.chain) bits.push('chain: <b>' + esc(state.chain) + '</b>');
    if (state.watchlistOnly) bits.push('<b>watchlist only</b>');
    if (state.minTvl) bits.push('TVL &ge; <b>' + money(state.minTvl) + '</b>');
    if (state.q.trim()) bits.push('matching &ldquo;<b>' + esc(state.q.trim()) + '</b>&rdquo;');
    parts.push(bits.join(' &middot; ') + '.</p>');
    document.getElementById('count').outerHTML = parts.join('');
    var tb = document.getElementById('tbody');
    if (!rows.length) {
      tb.innerHTML = '<tr><td colspan="9"><div class="empty">No protocols match these filters. Loosen one and try again.</div></td></tr>';
      return;
    }
    tb.innerHTML = rows.map(function (r) {
      var g = r.change_7d === null ? '' : (r.change_7d >= 0 ? 'pos' : 'neg');
      return '<tr data-slug="' + esc(r.slug) + '"' + (state.selected === r.slug ? ' class="sel"' : '') + '>' +
        '<td class="rank">' + r.rank + '</td>' +
        '<td><span class="name">' + esc(r.name) + '</span>' + (r.watchlist ? '<span class="badge">WATCHLIST</span>' : '<span class="early">EARLY</span>') +
        '<br><span class="slug">' + esc(r.slug) + '</span></td>' +
        '<td>' + esc(r.category || '—') + '</td>' +
        '<td>' + esc(r.chains.slice(0, 3).join(', ')) + (r.chains.length > 3 ? ' +' + (r.chains.length - 3) : '') + '</td>' +
        '<td class="num">' + money(r.tvl_usd) + '</td>' +
        '<td class="num ' + g + '">' + pct(r.change_7d) + '</td>' +
        '<td class="num">' + ageText(r.age_days) + '</td>' +
        '<td class="num"><span class="val">' + money(r.implied_value_usd) + '</span><div class="bar"><i style="width:' + Math.max(2, Math.round(100 * r.implied_value_usd / maxImplied)) + '%"></i></div></td>' +
        '<td class="num">' + r.implied_multiple.toFixed(2) + '&times;</td></tr>';
    }).join('');
  }

  /* ---------- detail view ---------- */
  function renderDetail() {
    var box = document.getElementById('detail');
    var r = state.selected ? bySlug[state.selected] : null;
    if (!r) { box.innerHTML = ''; return; }
    var m = r.model;
    var comps = R.live.filter(function (l) { return l.category === r.category; })
      .sort(function (a, b) { return (b.mcap_per_tvl || 0) - (a.mcap_per_tvl || 0); }).slice(0, 5);
    box.innerHTML =
      '<article class="detail" id="detailView">' +
      '<button class="close" id="closeDetail" type="button">Close &times;</button>' +
      '<h2>#' + r.rank + ' &middot; ' + esc(r.name) + '</h2>' +
      '<div class="sub">' + esc(r.category || 'Uncategorised') + ' &middot; ' + esc(r.chains.join(', ')) + ' &middot; ' +
      (r.watchlist ? 'on the house watchlist' : 'early row, below the watchlist floor') + ' &middot; listed ' + esc(r.listed_at || 'date not reported') + '</div>' +
      '<div class="kv">' +
      '<div><div class="k">Implied value</div><div class="v">' + money(r.implied_value_usd) + '</div><div class="d">' + moneyFull(r.implied_value_usd) + '</div></div>' +
      '<div><div class="k">TVL</div><div class="v">' + money(r.tvl_usd) + '</div><div class="d">' + moneyFull(r.tvl_usd) + ' &middot; ' + pct(r.change_7d) + ' in 7d</div></div>' +
      '<div><div class="k">Farmer pool yardstick</div><div class="v">' + money(r.farmer_pool_usd) + '</div><div class="d">5% of implied value, if 5% went to farmers</div></div>' +
      '<div><div class="k">Implied multiple</div><div class="v">' + r.implied_multiple.toFixed(2) + '&times; TVL</div><div class="d">category multiple ' + m.category_multiple.toFixed(2) + '&times;</div></div>' +
      '</div>' +
      '<div class="why"><b>Why it ranks here.</b> ' + esc(r.why) + '</div>' +
      '<h3>How the value is built</h3>' +
      '<div class="modelgrid">' +
      '<div><div class="k">Category multiple</div><div class="v">' + m.category_multiple.toFixed(2) + '&times;</div><div class="d">' + (m.category_live_n > 0 ? 'median mcap/TVL of ' + m.category_live_n + ' live ' + esc(r.category || '') + ' tokens (median ' + (m.category_live_median === null ? '—' : m.category_live_median.toFixed(2) + '&times;') + '), shrunk to the global median' : 'no live comparable in this category; global median applies') + '</div></div>' +
      '<div><div class="k">Size factor</div><div class="v">' + m.size_factor.toFixed(2) + '&times;</div><div class="d">TVL grows sublinearly: (TVL / $100M)^-0.20, clamped [0.45, 1.60]</div></div>' +
      '<div><div class="k">Growth factor</div><div class="v">' + m.growth_multiplier.toFixed(2) + '&times;</div><div class="d">7-day TVL ' + pct(m.growth_pct) + ' (clamped &minus;40% to +60%, weight 0.4)</div></div>' +
      '<div><div class="k">Maturity factor</div><div class="v">' + m.maturity_multiplier.toFixed(2) + '&times;</div><div class="d">' + (r.age_days === null ? 'listing date not reported, so the middle of the range' : 'running ' + ageText(r.age_days) + ' with no token') + '</div></div>' +
      '<div><div class="k">Breadth factor</div><div class="v">' + m.breadth_multiplier.toFixed(2) + '&times;</div><div class="d">' + r.chains.length + ' chain' + (r.chains.length === 1 ? '' : 's') + ' counted</div></div>' +
      '<div><div class="k">Token status</div><div class="v">Pre-token</div><div class="d">DefiLlama records no token, no market cap, no ticker</div></div>' +
      '</div>' +
      '<h3>Farm plan — six steps</h3>' +
      '<ol class="steps">' + r.farm_steps.map(function (s) {
        var p = stepParts(s);
        return '<li>' + esc(p.text) + '<div class="meta">Cost: <b>' + esc(p.cost) + '</b> &middot; Time: <b>' + esc(p.time) + '</b></div></li>';
      }).join('') + '</ol>' +
      '<h3>Live comparables in ' + esc(r.category || 'this category') + '</h3>' +
      (comps.length
        ? '<div class="tablewrap"><table class="comps"><thead><tr><th>Protocol</th><th class="num">TVL</th><th class="num">Market cap</th><th class="num">mcap / TVL</th></tr></thead><tbody>' +
          comps.map(function (l) {
            return '<tr><td><span class="name">' + esc(l.name) + '</span></td><td class="num">' + money(l.tvl_usd) + '</td><td class="num">' + money(l.mcap_usd) + '</td><td class="num">' + (l.mcap_per_tvl === null ? '—' : l.mcap_per_tvl.toFixed(2) + '&times;') + '</td></tr>';
          }).join('') + '</tbody></table></div>'
        : '<p class="note">No live-token protocol in this category sits in the snapshot&rsquo;s top 24 by market cap, so the category multiple falls back to the global median of ' + R.global_median_mcap_per_tvl.toFixed(2) + '&times; TVL.</p>') +
      '<p class="note"><b>Before you farm it.</b> ' + esc(r.name) + ' records no token — that is not proof it has none, and nothing here says a token is coming or when. ' +
      'Airdrops are never guaranteed; only farm with money you can afford to leave in the position, and only ever claim through the protocol&rsquo;s own published links.</p>' +
      '</article>';
    document.getElementById('closeDetail').addEventListener('click', function () { select(null); });
  }

  /* ---------- live view + method view (built once) ---------- */
  document.getElementById('liveSection').innerHTML =
    '<div class="live"><h2>Live tokens — what the market already pays</h2>' +
    '<p>These protocols already have a token that trades, so they are <b>not</b> on the ranked board. They are shown here for one reason: ' +
    'their market caps are the comparables the model prices the pre-token board from. The top 24 by market cap:</p>' +
    '<div class="tablewrap"><table><thead><tr><th>Protocol</th><th>Category</th><th>Chains</th><th class="num">TVL</th><th class="num">Market cap</th><th class="num">mcap / TVL</th><th class="num">7d</th></tr></thead><tbody>' +
    R.live.map(function (l) {
      return '<tr><td><span class="name">' + esc(l.name) + '</span></td><td>' + esc(l.category || '—') + '</td><td>' + esc(l.chains.slice(0, 3).join(', ')) + '</td>' +
        '<td class="num">' + money(l.tvl_usd) + '</td><td class="num">' + money(l.mcap_usd) + '</td>' +
        '<td class="num">' + (l.mcap_per_tvl === null ? '—' : l.mcap_per_tvl.toFixed(2) + '&times;') + '</td>' +
        '<td class="num ' + (l.change_7d === null ? '' : (l.change_7d >= 0 ? 'pos' : 'neg')) + '">' + pct(l.change_7d) + '</td></tr>';
    }).join('') + '</tbody></table></div></div>';

  document.getElementById('methodSection').innerHTML =
    '<div class="method"><h2>How the value is worked out</h2>' +
    '<p>The board&rsquo;s implied value is this radar&rsquo;s own claim, worked out from the snapshot&rsquo;s figures alone. ' +
    'No protocol name is ever special-cased: the same function scores every row, so the ranking can be re-run on a future snapshot and will find future pre-token protocols early.</p>' +
    '<div class="formula">' + esc(R.model_formula) + '</div>' +
    '<p style="margin-top:12px">The category multiple is the calibration that does the most work. For each category it takes the median market-cap-per-TVL of the ' +
    'live-token protocols in that same category in this snapshot, then shrinks it toward the global median (' + R.global_median_mcap_per_tvl.toFixed(2) + '&times;, across all live tokens) ' +
    'with a prior weight of 8 protocols, so a category with one or two live tokens cannot set a wild multiple on its own. The multiple is clamped to [0.05&times;, 1.00&times;].</p>' +
    '<h3>Category calibration (from this snapshot&rsquo;s live tokens)</h3>' +
    '<div class="tablewrap"><table><thead><tr><th>Category</th><th class="num">Live tokens</th><th class="num">Median mcap / TVL</th><th class="num">Multiple used</th></tr></thead><tbody>' +
    R.calibration.map(function (c) {
      return '<tr><td>' + esc(c.category) + '</td><td class="num">' + c.live_n + '</td><td class="num">' + (c.live_median === null ? '—' : c.live_median.toFixed(2) + '&times;') + '</td><td class="num">' + c.multiple.toFixed(2) + '&times;</td></tr>';
    }).join('') + '</tbody></table></div>' +
    '<h3>Who qualifies</h3>' +
    '<p>A protocol is ranked when it records no token (no market cap, no CoinGecko id, no ticker) and is not a wrapped, staked or bridged product of one that trades: ' +
    'its category is not Bridge, Canonical Bridge, Liquid Staking, Liquid Restaking, Restaked BTC or CEX, its name carries no whole word wrapped, staked or staking, ' +
    'it does not start with an exchange&rsquo;s name, and its name does not end in a version marker. The house watchlist applies the same rule at $50M TVL and above; ' +
    'this board applies it all the way down to the snapshot&rsquo;s $5M floor, which is how the early rows are found. ' +
    'The farmer pool is a yardstick — 5% of the implied value — labelled wherever it appears, not a promise of a payout.</p>' +
    '<h3>What the model does not do</h3>' +
    '<p>It does not predict whether or when a token launches, it does not read points programs, social signals or team statements (the snapshot carries none of those), ' +
    'and it does not treat a high TVL as a guarantee: the size factor deliberately pays less per TVL dollar as protocols get bigger, because that is what the live tokens in this snapshot show.</p></div>';

  /* ---------- tabs, selection, events ---------- */
  function setTab(tab) {
    state.tab = tab;
    document.querySelectorAll('.tab').forEach(function (b) { b.setAttribute('aria-selected', String(b.dataset.tab === tab)); });
    document.getElementById('boardSection').hidden = tab !== 'board';
    document.getElementById('liveSection').hidden = tab !== 'live';
    document.getElementById('methodSection').hidden = tab !== 'method';
  }
  document.querySelectorAll('.tab').forEach(function (b) {
    b.addEventListener('click', function () { setTab(b.dataset.tab); });
  });

  function select(slug) {
    state.selected = slug;
    if (slug) {
      if (window.location.hash !== '#/protocol/' + slug) history.replaceState(null, '', '#/protocol/' + slug);
    } else if (window.location.hash.indexOf('#/protocol/') === 0) {
      history.replaceState(null, '', window.location.pathname + window.location.search);
    }
    setTab('board');
    renderDetail();
    renderBoard();
    if (slug) {
      var el = document.getElementById('detailView');
      if (el) el.scrollIntoView({ block: 'start' });
    }
  }

  app.addEventListener('click', function (e) {
    var spot = e.target.closest('[data-slug]');
    if (spot && spot.closest('.spot')) { select(spot.dataset.slug); return; }
    var row = e.target.closest('tbody tr[data-slug]');
    if (row) select(row.dataset.slug);
  });
  app.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' && e.target.matches('.spot article')) select(e.target.dataset.slug);
  });
  window.addEventListener('hashchange', function () {
    var slug = selectedFromHash();
    if (slug !== state.selected) select(slug);
  });

  function bind(id, evt, fn) { document.getElementById(id).addEventListener(evt, fn); }
  bind('q', 'input', function (e) { state.q = e.target.value; renderBoard(); });
  bind('category', 'change', function (e) { state.category = e.target.value; renderBoard(); });
  bind('chain', 'change', function (e) { state.chain = e.target.value; renderBoard(); });
  bind('minTvl', 'change', function (e) { state.minTvl = parseFloat(e.target.value) || 0; renderBoard(); });
  bind('sort', 'change', function (e) { state.sort = e.target.value; renderBoard(); });
  bind('watchlistOnly', 'change', function (e) { state.watchlistOnly = e.target.checked; renderBoard(); });
  bind('resetFilters', 'click', function () {
    state.q = ''; state.category = ''; state.chain = ''; state.watchlistOnly = false; state.minTvl = 0; state.sort = 'value';
    document.getElementById('q').value = '';
    document.getElementById('category').value = '';
    document.getElementById('chain').value = '';
    document.getElementById('minTvl').value = '0';
    document.getElementById('sort').value = 'value';
    document.getElementById('watchlistOnly').checked = false;
    renderBoard();
  });

  app.setAttribute('aria-busy', 'false');
  renderDetail();
  renderBoard();
  if (state.selected && bySlug[state.selected]) {
    var dv = document.getElementById('detailView');
    if (dv) dv.scrollIntoView({ block: 'start' });
  }
})();
