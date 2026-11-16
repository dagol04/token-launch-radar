// Token Launch Radar's plain dashboard. It reads window.RADAR (written beside dashboard/ by
// main.ts) and renders the ranked board, a filterable table, a per-protocol detail drawer with the
// model's own arithmetic and the protocol's farm plan, and the live-token view apart. No network:
// every byte it shows is in data.js.
//
// The farm plan and the implied value are the same derivation main.ts writes to board.json:
// category, chains, TVL and age decide the action, the capital, the hold and every cost and time.
// No name is special-cased. The page recomputes each row from the snapshot figures, so the page's
// code and the board's data are visibly the same arithmetic.
(function () {
  'use strict';

  // ---- the model, as the page recomputes it -----------------------------------------
  function chainOf(p) { return p.chains && p.chains.length > 0 ? p.chains[0] : 'its main chain'; }
  function gasFor(chain) {
    var table = {
      Ethereum: '$8', Solana: '$0.05', Base: '$0.50', Arbitrum: '$0.50', Optimism: '$0.50',
      Unichain: '$0.50', Binance: '$0.20', Avalanche: '$0.30', Polygon: '$0.10', Monad: '$0.10',
      'Hyperliquid L1': '$0.10', Plasma: '$0.20', Berachain: '$0.20', Katana: '$0.20',
      Sonic: '$0.10', Ink: '$0.20', Scroll: '$0.30', Blast: '$0.20', Linea: '$0.30',
      Sei: '$0.10', Sui: '$0.05', Aptos: '$0.05', Tron: '$1', Bitcoin: '$2'
    };
    return table[chain] || '$1';
  }
  function capitalFor(p) {
    if (p.tvl_usd >= 1e9) return 250;
    if (p.tvl_usd >= 1e8) return 150;
    if (p.tvl_usd >= 5e7) return 100;
    return 50;
  }
  function holdDaysFor(age) {
    if (age === null || age === undefined) return 30;
    if (age < 180) return 60;
    if (age < 365) return 45;
    return 30;
  }
  function actionFor(p, capital, chain) {
    var c = (p.category || '').toLowerCase();
    var name = p.name;
    if (c.indexOf('risk curator') >= 0 || c.indexOf('curator') >= 0 || c.indexOf('allocator') >= 0) return 'Deposit $' + capital + ' of USDC into a ' + name + ' vault on ' + chain + ' and keep the vault shares.';
    if (c.indexOf('lend') >= 0 || c.indexOf('cdp') >= 0 || c.indexOf('collateral') >= 0) return 'Supply $' + capital + ' of USDC to ' + name + ' on ' + chain + ' as collateral and keep the supply position open.';
    if (c.indexOf('dex') >= 0) return 'Provide $' + capital + ' of liquidity to ' + name + "'s main pool on " + chain + ' and keep the position open.';
    if (c.indexOf('leveraged farm') >= 0 || c.indexOf('yield') >= 0) return 'Deposit $' + capital + ' of USDC into a ' + name + ' vault on ' + chain + ' and let the yield compound.';
    if (c.indexOf('rwa') >= 0) return 'Mint $' + capital + ' of the yield-bearing asset through ' + name + ' on ' + chain + ' and hold it in your wallet.';
    if (c.indexOf('basis') >= 0) return 'Deposit $' + capital + ' of USDC as margin on ' + name + ' and open one small basis position.';
    if (c.indexOf('perpetual') >= 0 || c.indexOf('derivative') >= 0) return 'Deposit $' + capital + ' of USDC as margin on ' + name + ' and open one small hedged position.';
    if (c.indexOf('staking') >= 0 || c.indexOf('restak') >= 0) return 'Stake $' + capital + " of the chain's staking asset through " + name + ' and keep the receipt token.';
    if (c.indexOf('stable') >= 0) return 'Mint or deposit $' + capital + ' of the stable asset through ' + name + ' on ' + chain + ' and hold it.';
    if (c.indexOf('insurance') >= 0) return 'Buy $' + capital + ' of cover from ' + name + ' on ' + chain + ' and keep the policy active.';
    if (c.indexOf('chain') >= 0) return 'Bridge $' + capital + " of USDC to " + chain + " through " + name + "'s own bridge and use one of its apps.";
    if (c.indexOf('liquidity manager') >= 0) return 'Deposit $' + capital + ' of USDC into a ' + name + ' managed pool on ' + chain + ' and let it rebalance.';
    if (c.indexOf('payment') >= 0) return 'Fund $' + capital + ' into your ' + name + ' balance on ' + chain + ' and make one real payment.';
    if (c.indexOf('governance') >= 0) return 'Deposit $' + capital + ' of the governance asset into ' + name + ' and cast one vote.';
    if (c.indexOf('card') >= 0) return 'Order the ' + name + ' card and load $' + capital + ' onto it, then spend from it once.';
    if (c.indexOf('anchor') >= 0 || c.indexOf('decentralized btc') >= 0) return 'Deposit $' + capital + ' of BTC through ' + name + ' on ' + chain + ' and hold the receipt.';
    if (c.indexOf('farm') >= 0) return 'Deposit $' + capital + ' of USDC into the ' + name + ' farm on ' + chain + ' and keep the position open.';
    return 'Deposit $' + capital + ' of USDC into ' + name + ' on ' + chain + ' and keep the position open.';
  }
  function secondActionFor(p, capital, chain) {
    var c = (p.category || '').toLowerCase();
    var name = p.name;
    var half = Math.round(capital / 2);
    var quarter = Math.round(capital / 4);
    if (c.indexOf('risk curator') >= 0 || c.indexOf('curator') >= 0 || c.indexOf('allocator') >= 0) return 'Allocate a second $' + half + ' to a different ' + name + ' vault so the activity spans two strategies.';
    if (c.indexOf('lend') >= 0 || c.indexOf('cdp') >= 0 || c.indexOf('collateral') >= 0) return 'Borrow $' + quarter + ' of USDC against the supply at a low loan-to-value and repay half of it within a week.';
    if (c.indexOf('dex') >= 0) return 'Add $' + half + ' of liquidity to a second ' + name + ' pool on ' + chain + ' and vote on one gauge or proposal.';
    if (c.indexOf('leveraged farm') >= 0 || c.indexOf('yield') >= 0) return "Harvest the vault's first yield and restake it into the same vault so the position compounds.";
    if (c.indexOf('rwa') >= 0) return 'Mint a second $' + half + ' tranche of the asset and hold it in a separate wallet label.';
    if (c.indexOf('basis') >= 0) return 'Open the hedge leg of the basis trade so both sides of the position are live.';
    if (c.indexOf('perpetual') >= 0 || c.indexOf('derivative') >= 0) return 'Open a second small hedge in the opposite direction and close the first one after a day.';
    if (c.indexOf('staking') >= 0 || c.indexOf('restak') >= 0) return 'Restake the first staking rewards through ' + name + ' instead of withdrawing them.';
    if (c.indexOf('stable') >= 0) return 'Provide $' + half + ' of the stable asset as liquidity on ' + chain + '.';
    if (c.indexOf('insurance') >= 0) return 'Stake $' + half + " in " + name + "'s cover pool so you are both a buyer and a backer.";
    if (c.indexOf('chain') >= 0) return 'Use a second app on ' + chain + ' — a swap or a deposit — so the wallet\'s activity is not one transaction only.';
    if (c.indexOf('liquidity manager') >= 0) return 'Let the pool rebalance once, then add $' + half + ' after the first rebalance.';
    if (c.indexOf('payment') >= 0) return 'Make a second payment to a different merchant so the balance shows real use.';
    if (c.indexOf('governance') >= 0) return 'Delegate the voting power to an active delegate and follow one proposal to its close.';
    if (c.indexOf('card') >= 0) return 'Spend from the card a second time on a different day so the load is not a single event.';
    if (c.indexOf('anchor') >= 0 || c.indexOf('decentralized btc') >= 0) return "Mint the protocol's BTC-backed asset with the receipt and hold both sides.";
    if (c.indexOf('farm') >= 0) return "Harvest the farm's first rewards and restake them instead of selling.";
    return 'Make a second deposit of $' + half + ' so the position grows instead of sitting still.';
  }
  function weeklyFor(p) {
    var c = (p.category || '').toLowerCase();
    if (c.indexOf('lend') >= 0 || c.indexOf('cdp') >= 0 || c.indexOf('collateral') >= 0) return 'a supply top-up, a borrow or a repayment';
    if (c.indexOf('dex') >= 0) return 'a swap, a liquidity add or a gauge vote';
    if (c.indexOf('yield') >= 0 || c.indexOf('farm') >= 0) return 'a deposit, a harvest or a restake';
    if (c.indexOf('rwa') >= 0) return 'a mint, a transfer or a redemption';
    if (c.indexOf('perpetual') >= 0 || c.indexOf('derivative') >= 0 || c.indexOf('basis') >= 0) return 'a hedge, a close or a margin top-up';
    if (c.indexOf('staking') >= 0 || c.indexOf('restak') >= 0) return 'a stake, a restake or a claim';
    if (c.indexOf('risk curator') >= 0 || c.indexOf('allocator') >= 0) return 'a vault deposit or a strategy switch';
    if (c.indexOf('governance') >= 0) return 'a vote or a delegation';
    if (c.indexOf('insurance') >= 0) return 'a cover renewal or a claim check';
    return 'a deposit, a swap or a vote';
  }
  function stepText(step) {
    var s = step.text + ' Cost: ' + step.cost + '. Time: ' + step.time + '.';
    if (s.length > 600) s = s.slice(0, 596) + '...';
    if (s.length < 20) s = s + " Hold the position and check the protocol's own page.";
    return s;
  }
  function farmSteps(p) {
    var chain = chainOf(p);
    var gas = gasFor(chain);
    var capital = capitalFor(p);
    var hold = holdDaysFor(p.age_days);
    return [
      { text: 'Use a fresh wallet that holds only the funds you plan to farm, and keep its seed phrase offline.', cost: 'under $3 of gas for the first transaction', time: '5 minutes' },
      { text: 'Move $' + capital + ' of USDC to ' + chain + ' so the funds are ready in the wallet you will farm with.', cost: 'about ' + gas + ' of gas to bridge', time: '10 minutes' },
      { text: actionFor(p, capital, chain), cost: '$' + capital + ' of capital and about ' + gas + ' of gas', time: '15 minutes to set up' },
      { text: secondActionFor(p, capital, chain), cost: 'about ' + gas + ' of gas, no new capital', time: '15 minutes' },
      { text: 'Make one qualifying action each week, such as ' + weeklyFor(p) + '.', cost: 'about $2 of gas a week', time: '10 minutes a week' },
      { text: 'Hold the position for at least ' + hold + ' days so the activity is counted in more than one snapshot.', cost: 'the $' + capital + ' stays in the position', time: hold + ' days' },
      { text: "Before you withdraw, open " + p.name + "'s own points or rewards page and claim only from the link it publishes.", cost: 'no fee to check, and never pay to claim', time: '10 minutes' },
      { text: 'Write the wallet, the dates and every transaction in a farm log so you can repeat the position or unwind it.', cost: 'nothing but the log', time: '5 minutes' }
    ].map(stepText);
  }
  /** The implied value recomputed from a row's snapshot figures and the model's constants. */
  function impliedOf(row, model) {
    var growth = Math.min(model.growth_cap, Math.max(model.growth_floor, row.change_7d === null || row.change_7d === undefined ? 0 : row.change_7d));
    var growthMult = 1 + (growth / 100) * model.growth_weight;
    var age = row.age_days === null || row.age_days === undefined ? model.unknown_age_days : row.age_days;
    var maturity = model.maturity_floor + (Math.min(Math.max(age, 0), model.maturity_days) / model.maturity_days) * model.maturity_range;
    return Math.max(1, Math.round(row.tvl_usd * row.peer_multiple * growthMult * maturity));
  }
  function multipliersOf(row, model) {
    var growth = Math.min(model.growth_cap, Math.max(model.growth_floor, row.change_7d === null || row.change_7d === undefined ? 0 : row.change_7d));
    var growthMult = 1 + (growth / 100) * model.growth_weight;
    var age = row.age_days === null || row.age_days === undefined ? model.unknown_age_days : row.age_days;
    var maturity = model.maturity_floor + (Math.min(Math.max(age, 0), model.maturity_days) / model.maturity_days) * model.maturity_range;
    return { growthPct: growth, growthMult: growthMult, maturity: maturity, age: age };
  }

  // Exposed so a test can prove the page and board.json agree, byte for byte.
  if (typeof window !== 'undefined') {
    window.RADAR_APP = { farmSteps: farmSteps, impliedOf: impliedOf, multipliersOf: multipliersOf, stepText: stepText };
  }

  // ---- the page (browser only) ------------------------------------------------------
  if (typeof document === 'undefined' || !document.getElementById) return;
  var DATA = window.RADAR;
  if (!DATA) return;

  var state = { q: '', chain: 'all', category: 'all', tab: 'pre', sort: 'rank', dir: 1, selected: null };

  var usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
  function fmtUsd(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    if (Math.abs(n) >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (Math.abs(n) >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (Math.abs(n) >= 1e3) return '$' + Math.round(n / 1e3) + 'K';
    return usd.format(n);
  }
  function fmtFull(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    return '$' + Math.round(n).toLocaleString('en-US');
  }
  function fmtPct(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    return (n > 0 ? '+' : '') + n.toFixed(2) + '%';
  }
  function pctClass(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'flat';
    return n > 0 ? 'up' : n < 0 ? 'down' : 'flat';
  }
  function fmtAge(days) {
    if (days === null || days === undefined) return 'unknown';
    if (days >= 365) return (days / 365).toFixed(1) + 'y';
    return Math.max(0, Math.round(days)) + 'd';
  }

  function el(tag, attrs) {
    var node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        if (k === 'class') node.className = attrs[k];
        else if (k === 'text') node.textContent = attrs[k];
        else if (k === 'html') node.innerHTML = attrs[k];
        else if (k.slice(0, 2) === 'on') node.addEventListener(k.slice(2), attrs[k]);
        else if (attrs[k] !== null && attrs[k] !== undefined) node.setAttribute(k, attrs[k]);
      });
    }
    for (var i = 2; i < arguments.length; i++) {
      var child = arguments[i];
      if (child === null || child === undefined) continue;
      if (Array.isArray(child)) child.forEach(function (c) { if (c) node.appendChild(c); });
      else if (typeof child === 'string') node.appendChild(document.createTextNode(child));
      else node.appendChild(child);
    }
    return node;
  }

  function readParams() {
    var params = new URLSearchParams(window.location.search);
    if (params.get('tab')) state.tab = params.get('tab') === 'live' ? 'live' : 'pre';
    if (params.get('chain')) state.chain = params.get('chain');
    if (params.get('category')) state.category = params.get('category');
    if (params.get('q')) state.q = params.get('q');
    if (params.get('sort')) state.sort = params.get('sort');
    if (params.get('detail')) state.selected = params.get('detail');
  }
  function writeParams() {
    var params = new URLSearchParams();
    if (state.tab === 'live') params.set('tab', 'live');
    if (state.chain !== 'all') params.set('chain', state.chain);
    if (state.category !== 'all') params.set('category', state.category);
    if (state.q) params.set('q', state.q);
    if (state.sort !== 'rank') params.set('sort', state.sort);
    if (state.selected) params.set('detail', state.selected);
    var qs = params.toString();
    window.history.replaceState(null, '', window.location.pathname + (qs ? '?' + qs : ''));
  }

  function filteredRows() {
    var q = state.q.trim().toLowerCase();
    return DATA.rows.filter(function (r) {
      if (state.chain !== 'all' && !(r.chains || []).some(function (c) { return c === state.chain; })) return false;
      if (state.category !== 'all' && (r.category || 'Uncategorized') !== state.category) return false;
      if (q && r.name.toLowerCase().indexOf(q) < 0 && r.slug.toLowerCase().indexOf(q) < 0) return false;
      return true;
    });
  }
  function sortRows(rows) {
    var dir = state.dir;
    var key = state.sort;
    return rows.slice().sort(function (a, b) {
      if (key === 'rank') return (a.rank - b.rank) * dir;
      if (key === 'implied') return (b.implied_value_usd - a.implied_value_usd) * dir;
      if (key === 'tvl') return (b.tvl_usd - a.tvl_usd) * dir;
      if (key === 'growth') {
        var ga = a.change_7d === null || a.change_7d === undefined ? -Infinity : a.change_7d;
        var gb = b.change_7d === null || b.change_7d === undefined ? -Infinity : b.change_7d;
        return (gb - ga) * dir;
      }
      if (key === 'name') return (a.name < b.name ? -1 : a.name > b.name ? 1 : 0) * dir;
      return 0;
    });
  }

  function chainChips(chains, highlight) {
    var list = (chains || []).slice();
    if (highlight && highlight !== 'all') {
      var at = list.indexOf(highlight);
      if (at > 0) { list.splice(at, 1); list.unshift(highlight); }
    }
    var shown = list.slice(0, 2);
    var chips = shown.map(function (c) { return el('span', { class: 'chip', text: c }); });
    if ((chains || []).length > 2) chips.push(el('span', { class: 'chip', text: '+' + (chains.length - 2) }));
    if (chips.length === 0) chips.push(el('span', { class: 'chip', text: '—' }));
    return chips;
  }

  function renderStats() {
    var top = DATA.rows[0];
    var stats = document.getElementById('stats');
    stats.innerHTML = '';
    var cards = [
      { b: String(DATA.protocols_total), s: 'protocols scanned in the snapshot', e: 'at or above $5M TVL' },
      { b: String(DATA.watchlist_size), s: 'on the watchlist', e: 'records no token, $50M floor' },
      { b: String(DATA.board_size), s: 'rows ranked', e: DATA.early_size + ' early finds below the floor' },
      { b: fmtUsd(top ? top.implied_value_usd : 0), s: 'highest implied value', e: top ? top.name : '' }
    ];
    cards.forEach(function (c) {
      stats.appendChild(el('div', { class: 'stat' }, el('b', { text: c.b }), el('span', { text: c.s }), el('em', { text: c.e })));
    });
    document.getElementById('asof').textContent = DATA.as_of;
    document.getElementById('top-value').textContent = fmtUsd(top ? top.implied_value_usd : 0);
    document.getElementById('model-formula').textContent = DATA.model_formula;
    document.getElementById('source').textContent = DATA.source;
  }

  function renderPeers() {
    var tbody = document.querySelector('#peer-table tbody');
    tbody.innerHTML = '';
    DATA.peer_multiples.forEach(function (pm) {
      tbody.appendChild(el('tr', {},
        el('td', { text: pm.category }),
        el('td', { class: 'num', text: String(pm.peers) }),
        el('td', { class: 'num', text: pm.multiple.toFixed(3) + 'x' })));
    });
    document.getElementById('peer-note').textContent =
      'Market-wide median multiple: ' + DATA.global_multiple.toFixed(3) + 'x. Categories with fewer than ' +
      DATA.model.min_peers + ' token-bearing peers use it instead of their own.';
  }

  function renderFilters() {
    var chainSel = document.getElementById('chain');
    var catSel = document.getElementById('category');
    var chainCounts = {};
    var catCounts = {};
    DATA.rows.forEach(function (r) {
      (r.chains || []).forEach(function (c) { chainCounts[c] = (chainCounts[c] || 0) + 1; });
      var cat = r.category || 'Uncategorized';
      catCounts[cat] = (catCounts[cat] || 0) + 1;
    });
    Object.keys(chainCounts).sort(function (a, b) { return chainCounts[b] - chainCounts[a]; }).forEach(function (c) {
      chainSel.appendChild(el('option', { value: c, text: c + ' (' + chainCounts[c] + ')' }));
    });
    Object.keys(catCounts).sort(function (a, b) { return catCounts[b] - catCounts[a]; }).forEach(function (c) {
      catSel.appendChild(el('option', { value: c, text: c + ' (' + catCounts[c] + ')' }));
    });
    chainSel.value = state.chain;
    catSel.value = state.category;
    document.getElementById('q').value = state.q;
    document.getElementById('sort').value = state.sort;
  }

  function renderBoard() {
    var rows = sortRows(filteredRows());
    var tbody = document.getElementById('rows');
    tbody.innerHTML = '';
    rows.forEach(function (r) {
      var tr = el('tr', { 'data-slug': r.slug, onclick: function () { openDetail(r.slug); } });
      if (state.selected === r.slug) tr.className = 'selected';
      tr.appendChild(el('td', { class: 'num' }, el('span', { class: 'rank-badge', text: '#' + r.rank })));
      tr.appendChild(el('td', {}, el('div', { class: 'proto-name', text: r.name }), el('div', { class: 'proto-slug', text: r.slug })));
      tr.appendChild(el('td', { class: 'cat', text: r.category || '—' }));
      tr.appendChild(el('td', {}, chainChips(r.chains, state.chain)));
      tr.appendChild(el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }));
      tr.appendChild(el('td', { class: 'num ' + pctClass(r.change_7d), text: fmtPct(r.change_7d) }));
      tr.appendChild(el('td', { class: 'num', text: fmtAge(r.age_days) }));
      tr.appendChild(el('td', { class: 'num implied', text: fmtUsd(r.implied_value_usd) }));
      tbody.appendChild(tr);
    });
    document.getElementById('count').textContent =
      'Showing ' + rows.length + ' of ' + DATA.rows.length + ' pre-token protocols · all ' +
      DATA.watchlist_size + ' watchlist protocols covered · click a row for its farm plan';
    document.querySelectorAll('#board-table thead th[data-sort]').forEach(function (th) {
      th.classList.toggle('sorted', th.getAttribute('data-sort') === state.sort);
    });
  }

  function renderLive() {
    var q = state.q.trim().toLowerCase();
    var rows = DATA.live.filter(function (r) {
      if (state.chain !== 'all' && !(r.chains || []).some(function (c) { return c === state.chain; })) return false;
      if (state.category !== 'all' && (r.category || 'Uncategorized') !== state.category) return false;
      if (q && r.name.toLowerCase().indexOf(q) < 0 && r.slug.toLowerCase().indexOf(q) < 0) return false;
      return true;
    });
    var tbody = document.getElementById('live-rows');
    tbody.innerHTML = '';
    rows.forEach(function (r, i) {
      var ratio = r.mcap_usd && r.tvl_usd ? r.mcap_usd / r.tvl_usd : null;
      var tr = el('tr', { 'data-slug': r.slug, onclick: function () { openDetail(r.slug); } });
      if (state.selected === r.slug) tr.className = 'selected';
      tr.appendChild(el('td', { class: 'num', text: String(i + 1) }));
      tr.appendChild(el('td', {}, el('div', { class: 'proto-name', text: r.name }), el('div', { class: 'proto-slug', text: r.slug })));
      tr.appendChild(el('td', { class: 'cat', text: r.category || '—' }));
      tr.appendChild(el('td', {}, chainChips(r.chains, state.chain)));
      tr.appendChild(el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }));
      tr.appendChild(el('td', { class: 'num implied', text: fmtUsd(r.mcap_usd) }));
      tr.appendChild(el('td', { class: 'num', text: ratio === null ? 'n/a' : ratio.toFixed(3) + 'x' }));
      tr.appendChild(el('td', { class: 'num ' + pctClass(r.change_7d), text: fmtPct(r.change_7d) }));
      tbody.appendChild(tr);
    });
  }

  function renderTabs() {
    var isLive = state.tab === 'live';
    document.querySelectorAll('.tab').forEach(function (t) {
      var active = t.getAttribute('data-tab') === state.tab;
      t.classList.toggle('active', active);
      t.setAttribute('aria-selected', active ? 'true' : 'false');
    });
    document.getElementById('board-table').closest('.table-wrap').hidden = isLive;
    document.getElementById('live-wrap').hidden = !isLive;
    document.getElementById('count').parentElement.hidden = isLive;
  }

  function stepMeta(step) {
    var cost = step.match(/ Cost: (.*)\. Time: (.*)\.$/);
    var text = step.replace(/ Cost: .*\. Time: .*\.?$/, '');
    var meta = el('div', { class: 'meta' });
    if (cost) {
      meta.appendChild(el('span', { class: 'tag' }, 'Cost: ', el('b', { text: cost[1] })));
      meta.appendChild(el('span', { class: 'tag' }, 'Time: ', el('b', { text: cost[2] })));
    }
    return { text: text, meta: meta };
  }

  function openDetail(slug) {
    var row = DATA.rows.find(function (r) { return r.slug === slug; });
    var live = !row ? DATA.live.find(function (r) { return r.slug === slug; }) : null;
    var body = document.getElementById('detail-body');
    body.innerHTML = '';
    if (!row && !live) { closeDetail(); return; }
    state.selected = slug;
    var p = row || live;
    body.appendChild(el('h2', { text: p.name }));
    body.appendChild(el('p', { class: 'sub', text: p.slug + ' · ' + (p.category || 'Uncategorized') + ' · ' + (p.chains || []).join(', ') }));
    if (live) {
      body.appendChild(el('div', { class: 'live-banner', text: 'This token already trades. The market cap below is the market\u2019s own value — it is shown apart so it never tops the pre-token ranking.' }));
      var figs = el('div', { class: 'figures' });
      figs.appendChild(el('div', { class: 'figure' }, el('b', { text: fmtUsd(live.tvl_usd) }), el('span', { text: 'TVL' })));
      figs.appendChild(el('div', { class: 'figure' }, el('b', { text: fmtUsd(live.mcap_usd) }), el('span', { text: 'Market cap' })));
      figs.appendChild(el('div', { class: 'figure' }, el('b', { text: live.mcap_usd && live.tvl_usd ? (live.mcap_usd / live.tvl_usd).toFixed(3) + 'x' : 'n/a' }), el('span', { text: 'mcap / TVL' })));
      figs.appendChild(el('div', { class: 'figure' }, el('b', { text: fmtPct(live.change_7d) }), el('span', { text: 'TVL change, 7 days' })));
      body.appendChild(figs);
      body.appendChild(el('p', { class: 'note', text: 'No farm plan: the launch already happened. The radar watches it only as a peer — its market-cap / TVL is one of the ratios the model prices pre-token protocols off.' }));
    } else {
      var m = multipliersOf(row, DATA.model);
      var figs2 = el('div', { class: 'figures' });
      figs2.appendChild(el('div', { class: 'figure' }, el('b', { text: fmtUsd(row.tvl_usd) }), el('span', { text: 'TVL' })));
      figs2.appendChild(el('div', { class: 'figure' }, el('b', { text: fmtPct(row.change_7d) }), el('span', { text: 'TVL change, 7 days' })));
      figs2.appendChild(el('div', { class: 'figure' }, el('b', { text: fmtAge(row.age_days) }), el('span', { text: 'Tracked since ' + (row.listed_at || 'unknown') })));
      figs2.appendChild(el('div', { class: 'figure' }, el('b', { text: fmtUsd(row.implied_value_usd) }), el('span', { text: 'Implied value · rank #' + row.rank })));
      body.appendChild(figs2);
      body.appendChild(el('h3', { text: 'Why this value' }));
      var peerNote = row.peer_count >= DATA.model.min_peers
        ? 'median of ' + row.peer_count + ' token-bearing peers in ' + (row.category || 'Uncategorized')
        : 'market-wide median — fewer than ' + DATA.model.min_peers + ' peers in ' + (row.category || 'Uncategorized');
      var math = el('div', { class: 'math' });
      math.appendChild(el('div', {}, el('span', { class: 'lbl', text: 'TVL            ' }), document.createTextNode(fmtFull(row.tvl_usd))));
      math.appendChild(el('div', {}, el('span', { class: 'lbl', text: 'peer multiple  ' }), document.createTextNode(row.peer_multiple.toFixed(3) + 'x  (' + peerNote + ')')));
      math.appendChild(el('div', {}, el('span', { class: 'lbl', text: 'growth         ' }), document.createTextNode('x' + m.growthMult.toFixed(3) + '  (' + fmtPct(m.growthPct) + ' over 7 days)')));
      math.appendChild(el('div', {}, el('span', { class: 'lbl', text: 'maturity       ' }), document.createTextNode('x' + m.maturity.toFixed(3) + '  (' + fmtAge(row.age_days) + ' tracked)')));
      math.appendChild(el('div', {}, el('span', { class: 'lbl', text: 'implied value  ' }), el('span', { class: 'res', text: fmtFull(row.implied_value_usd) })));
      body.appendChild(math);
      body.appendChild(el('h3', { text: 'Farm plan — 8 steps' }));
      var ol = el('ol', { class: 'steps' });
      farmSteps(row).forEach(function (s) {
        var parts = stepMeta(s);
        var li = el('li', {}, el('p', { text: parts.text }));
        li.appendChild(parts.meta);
        ol.appendChild(li);
      });
      body.appendChild(ol);
      body.appendChild(el('p', { class: 'note', text: 'This protocol records no token in the snapshot — that is the snapshot\u2019s record, not proof that none exists. The plan above is the radar\u2019s own reading of that record; costs are planning estimates, not live quotes.' }));
    }
    document.getElementById('detail').hidden = false;
    renderBoard();
    renderLive();
    writeParams();
  }
  function closeDetail() {
    state.selected = null;
    document.getElementById('detail').hidden = true;
    renderBoard();
    renderLive();
    writeParams();
  }

  function renderAll() {
    renderStats();
    renderPeers();
    renderBoard();
    renderLive();
    renderTabs();
  }

  readParams();
  renderFilters();
  renderAll();
  if (state.selected) openDetail(state.selected);

  document.querySelectorAll('.tab').forEach(function (t) {
    t.addEventListener('click', function () {
      state.tab = t.getAttribute('data-tab');
      renderTabs();
      writeParams();
    });
  });
  document.getElementById('q').addEventListener('input', function (e) {
    state.q = e.target.value;
    renderBoard();
    renderLive();
    writeParams();
  });
  document.getElementById('chain').addEventListener('change', function (e) {
    state.chain = e.target.value;
    renderBoard();
    renderLive();
    writeParams();
  });
  document.getElementById('category').addEventListener('change', function (e) {
    state.category = e.target.value;
    renderBoard();
    renderLive();
    writeParams();
  });
  document.getElementById('sort').addEventListener('change', function (e) {
    state.sort = e.target.value;
    state.dir = 1;
    renderBoard();
    writeParams();
  });
  document.querySelectorAll('#board-table thead th[data-sort]').forEach(function (th) {
    th.addEventListener('click', function () {
      var key = th.getAttribute('data-sort');
      if (state.sort === key) state.dir = -state.dir;
      else { state.sort = key; state.dir = 1; }
      document.getElementById('sort').value = key;
      renderBoard();
      writeParams();
    });
  });
  document.getElementById('detail-close').addEventListener('click', closeDetail);
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') closeDetail();
  });
})();
