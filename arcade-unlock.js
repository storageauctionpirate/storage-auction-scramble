/* Pirate Arcade 1.1.2 web / GitHub Pages demo: free demos + Coming soon unlock (no store checkout on the web).
   Takes the place of the old timed-access shell script: no clock, no hidden tester overrides.
   Store code path: CdvPurchase NON_CONSUMABLE, finish/acknowledge, restorePurchases.
   Injected into the hub and every game page. Demo gate = PirateArcadeGate.allow(): the hub's game copies call it at the exact
   point where their state would advance past the demo (Stack next level, Scramble unit start + race join, Survival next facility
   + every update tick, Box Dig new run). It is synchronous and fail-closed (no gate script = no advance), so it does not depend
   on focus, visibility, timers or which input path was used. Rules, balance and saves are unchanged. */
(function () {
  'use strict';

  // ===== ONE place to change price label and store product ID =====
  var ARCADE_CONFIG = {
    priceLabel: '$4.99',        // fallback until the store returns its localized price. ONE-TIME, non-consumable.
    productId: 'arcade_unlock', // non-consumable; create with this exact ID in Play Console + App Store Connect
    version: '1.1.2'
  };
  // ===== DEMO LIMITS (Mike's final call = change one number per line) =====
  var DEMO_LIMITS = {
    'storage-stack':            { levels: 3 },      // Stack: levels 1-3 (classic or twist); gate when level 4 would start
    'storage-auction-scramble': { levels: 4 },      // Scramble: solo units 1-4; gate when unit 5 would start; RACE is full-game
    'storage-survival':         { facilities: 2 },  // Survival: facilities 1-2 (incl. the Spaz boss); gate on the 3rd
    'box-dig':                  { units: 2 }        // Box Dig: 2 full unit runs (any door); gate when a 3rd run would start
  };
  window.ARCADE_CONFIG = ARCADE_CONFIG; window.DEMO_LIMITS = DEMO_LIMITS;

  var K = { owned: 'pirateArcade.unlocked' }; // same ownership cache key as the shipped wrapper
  var ls = { get: function (k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
             set: function (k, v) { try { localStorage.setItem(k, v); } catch (e) {} } };

  var KNOWN = ['storage-stack','storage-auction-scramble','storage-survival','box-dig'];
  var gm = location.pathname.match(/\/games\/([^/]+)\//), game = gm ? gm[1] : null;
  if (!game) {
    var parts = location.pathname.split('/').filter(Boolean);
    for (var ki = 0; ki < parts.length; ki++) {
      if (KNOWN.indexOf(parts[ki]) !== -1) { game = parts[ki]; break; }
    }
  }
  var inGame = !!game;
  var base = '';
  var NAMES = { 'storage-stack': 'Stack', 'storage-auction-scramble': 'Scramble', 'storage-survival': 'Survival', 'box-dig': 'Box Dig' };
  function demoLabel(g) { var d = DEMO_LIMITS[g] || {}; return d.levels ? 'levels 1\u2013' + d.levels : d.facilities ? 'facilities 1\u2013' + d.facilities : d.units ? d.units + ' unit runs' : 'demo'; }

  function unlocked() { return ls.get(K.owned) === '1'; }
  function state() { return { unlocked: unlocked(), demo: !unlocked() }; }

  // ---- store (only on a real phone build; web gets "Coming soon") ----
  var Cap = window.Capacitor;
  var isNative = !!(Cap && Cap.isNativePlatform && Cap.isNativePlatform());
  var storeP = null, storeReady = false, storeSettled = !isNative, storePrice = null, listeners = [];
  function emit() { listeners.slice().forEach(function (f) { try { f(); } catch (e) {} }); }
  function markOwned() { if (ls.get(K.owned) !== '1') { ls.set(K.owned, '1'); } emit(); }
  function loadScript(src) { return new Promise(function (res, rej) { var s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = rej; document.head.appendChild(s); }); }
  function initStore() {
    if (!isNative) return Promise.resolve(null);
    if (storeP) return storeP;
    storeP = loadScript(base + 'vendor/cdv-purchase.js').then(function () {
      var C = window.CdvPurchase, store = C.store;
      var platform = Cap.getPlatform() === 'ios' ? C.Platform.APPLE_APPSTORE : C.Platform.GOOGLE_PLAY;
      store.verbosity = C.LogLevel.WARNING;
      store.register([{ id: ARCADE_CONFIG.productId, type: C.ProductType.NON_CONSUMABLE, platform: platform }]);
      store.when()
        .approved(function (tx) { tx.finish(); })   // acknowledge (Google refunds unacknowledged buys after 3 days)
        .finished(function (tx) { if (tx.products.some(function (p) { return p.id === ARCADE_CONFIG.productId; })) markOwned(); })
        .productUpdated(function (p) {
          if (p.id !== ARCADE_CONFIG.productId) return;
          if (p.pricing && p.pricing.price) storePrice = p.pricing.price;
          if (store.owned(ARCADE_CONFIG.productId)) markOwned(); else emit();
        })
        .receiptUpdated(function () { if (store.owned(ARCADE_CONFIG.productId)) markOwned(); });
      store.error(function (e) { console.warn('[arcade store]', e && e.message); });
      var timeout = new Promise(function (res) { setTimeout(res, 8000); });
      return Promise.race([store.initialize([platform]), timeout]).then(function () {
        var p = store.get(ARCADE_CONFIG.productId, platform);
        storeReady = !!(p && p.getOffer());
        if (p && p.pricing && p.pricing.price) storePrice = p.pricing.price;
        if (store.owned(ARCADE_CONFIG.productId)) markOwned();
        storeSettled = true; emit();
        return { store: store, platform: platform, C: C };
      });
    }).catch(function (e) { console.warn('[arcade store] unavailable', e); storeSettled = true; emit(); return null; });
    return storeP;
  }
  function price() { return storePrice || ARCADE_CONFIG.priceLabel; }
  function buy() {
    return initStore().then(function (s) {
      if (!s || !storeReady) return { msg: 'The treasure chest opens soon. Purchases go live when Pirate Arcade hits the store.' };
      var offer = s.store.get(ARCADE_CONFIG.productId, s.platform).getOffer();
      return offer.order().then(function (err) {
        if (!err) return { msg: 'Hang tight, confirming your purchase\u2026', wait: true };
        if (err.code === s.C.ErrorCode.PAYMENT_CANCELLED || /cancel/i.test(String(err.code) + ' ' + (err.message || ''))) return { msg: 'No worries. Changed your mind? The offer stands.' }; // Google Play cancel arrives as USER_CANCELED
        return { msg: 'That didn\u2019t go through: ' + (err.message || 'try again in a bit.') };
      });
    }).catch(function () { return { msg: 'Couldn\u2019t reach the store. Check your connection and try again.' }; }); // Codex: rejected promise had no UI recovery
  }
  function restore() {
    return initStore().then(function (s) {
      if (!s || !storeReady) return { msg: 'Restore works once Pirate Arcade is in the store.', confirmed: false };
      return s.store.restorePurchases().then(function (err) {
        // Codex restore correction: only a store-confirmed owned arcade_unlock counts as restored.
        // Cached local ownership may still unlock play offline, but must not report a successful restore.
        if (s.store.owned(ARCADE_CONFIG.productId)) { markOwned(); return { msg: 'Found it! Welcome back aboard.', confirmed: true }; }
        if (unlocked()) return { msg: 'This device is still unlocked from a saved copy, but the store didn\u2019t confirm a restore.', confirmed: false };
        return { msg: err ? ('Couldn\u2019t reach the store: ' + (err.message || 'try again.')) : 'No earlier unlock found on this account.', confirmed: false };
      });
    }).catch(function () { return { msg: 'Couldn\u2019t reach the store. Check your connection and try again.', confirmed: false }; });
  }

  // ---- UI ----
  var css = '' +
    '#paLock{position:fixed;inset:0;z-index:2147483646;background:radial-gradient(circle at 50% 0,#1d3a6b,#0b1a33 70%);color:#eef2f8;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;display:flex;align-items:center;justify-content:center;padding:calc(env(safe-area-inset-top) + 20px) 22px calc(env(safe-area-inset-bottom) + 20px);overflow:auto}' +
    '#paLock .c{max-width:380px;width:100%;text-align:center}#paLock .flag{font-size:56px;line-height:1}' +
    '#paLock h2{margin:10px 0 6px;font-size:26px;color:#f1c75b;text-shadow:0 3px 0 #6b4d0c;line-height:1.15}' +
    '#paLock .lead{color:#c9d5e8;font-size:15px;margin:0 0 16px;line-height:1.45}' +
    '#paLock ul{list-style:none;padding:12px 16px;margin:0 0 18px;background:#13284d;border:2px solid #2a4370;border-radius:16px;text-align:left;font-size:15px;line-height:1.85}' +
    '#paLock button{display:block;width:100%;border:0;border-radius:14px;font:700 17px system-ui,sans-serif;padding:15px;margin:0 0 10px;cursor:pointer}' +
    '#paLock .buy{background:linear-gradient(#f6d16a,#d4a73a);color:#2b1c00;box-shadow:0 4px 0 #6b4d0c}#paLock .buy[disabled]{opacity:.75}' +
    '#paLock .ghost{background:transparent;color:#f1c75b;border:2px solid #d4a73a;font-size:15px;padding:12px}' +
    '#paLock .link{background:none;color:#9fb0c9;font-size:14px;font-weight:600;padding:8px;min-height:44px;display:flex;align-items:center;justify-content:center;box-sizing:border-box}#paLock .msg{min-height:20px;font-size:14px;color:#f1c75b;margin:6px 0 10px}' +
    '#paBadge{display:block;width:max-content;max-width:100%;margin:0 auto 16px;padding:7px 14px;border-radius:999px;background:#13284d;border:2px solid #d4a73a;color:#f1c75b;font:700 13px system-ui,sans-serif;text-decoration:none;cursor:pointer}' +
    '#paBadge.own{background:#d4a73a;color:#2b1c00}.paDemo{display:block;margin-top:3px;font:700 11px system-ui;color:#f1c75b}' +
    '#paToast{position:fixed;left:50%;bottom:calc(env(safe-area-inset-bottom) + 24px);transform:translateX(-50%);background:#000c;color:#fff;padding:10px 16px;border-radius:10px;font:600 13px system-ui;z-index:2147483647}' +
    '#paIdeaBtn{display:block;width:100%;max-width:520px;margin:16px auto 0;border:2px solid #d4a73a;background:#13284d;color:#f1c75b;border-radius:14px;font:800 16px system-ui,sans-serif;padding:14px 16px;cursor:pointer;min-height:48px}' +
    '#paIdeaBtn.mini{position:fixed;right:max(8px,env(safe-area-inset-right));top:max(6px,env(safe-area-inset-top));z-index:99999;width:44px;height:44px;min-width:44px;max-width:44px;margin:0;padding:0;border-radius:10px;font-size:22px;line-height:1}' +
    '#paIdea{position:fixed;inset:0;z-index:2147483646;background:rgba(5,10,22,.82);display:flex;align-items:flex-end;justify-content:center;padding:0 0 calc(env(safe-area-inset-bottom) + 8px);font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif}' +
    '#paIdea .c{background:#0f1e3a;border:2px solid #d4a73a;border-radius:20px 20px 0 0;width:100%;max-width:440px;padding:22px 18px 16px;color:#eef2f8;text-align:center;box-sizing:border-box}' +
    '#paIdea h2{margin:0 0 14px;font-size:26px;color:#f1c75b;text-shadow:0 3px 0 #6b4d0c}' +
    '#paIdea .chips{display:flex;flex-wrap:wrap;gap:8px;justify-content:center;margin:0 0 16px}' +
    '#paIdea .chip{border:2px solid #2a4370;background:#13284d;color:#eef2f8;border-radius:999px;font:800 16px system-ui,sans-serif;padding:12px 14px;min-height:44px;cursor:pointer}' +
    '#paIdea .chip.on{border-color:#d4a73a;background:#d4a73a;color:#2b1c00}' +
    '#paIdea .lab{display:block;text-align:left;color:#9fb0c9;font:700 13px system-ui,sans-serif;margin:0 0 6px}' +
    '#paIdea input{width:100%;box-sizing:border-box;border:2px solid #2a4370;background:#0b1a33;color:#eef2f8;border-radius:12px;font:16px system-ui,sans-serif;padding:12px 14px;min-height:48px}' +
    '#paIdea .cnt{text-align:right;color:#9fb0c9;font:700 12px system-ui,sans-serif;margin:4px 0 8px}' +
    '#paIdea .err{min-height:20px;color:#ff8a7a;font:700 13px system-ui,sans-serif;margin:0 0 8px}' +
    '#paIdea .send{display:block;width:100%;border:0;border-radius:14px;font:800 20px system-ui,sans-serif;padding:16px;margin:0 0 8px;background:linear-gradient(#f6d16a,#d4a73a);color:#2b1c00;box-shadow:0 4px 0 #6b4d0c;cursor:pointer;min-height:52px}' +
    '#paIdea .send[disabled]{opacity:.75}' +
    '#paIdea .link{display:flex;width:100%;align-items:center;justify-content:center;min-height:44px;border:0;background:none;color:#9fb0c9;font:700 14px system-ui,sans-serif;cursor:pointer}' +
    '#paIdea .thanks{font:800 28px system-ui,sans-serif;color:#f1c75b;text-shadow:0 3px 0 #6b4d0c;padding:48px 12px}';
  function addCss() { if (document.getElementById('paCss')) return; var s = document.createElement('style'); s.id = 'paCss'; s.textContent = css; document.head.appendChild(s); }
  function toast(t) { var d = document.createElement('div'); d.id = 'paToast'; d.textContent = t; document.body.appendChild(d); setTimeout(function () { d.remove(); }, 2200); }
  function blockKeys(e) { if (document.getElementById('paLock')) { e.stopImmediatePropagation(); } }

  // opts: {reason:'demo-end'|'hub'|'race', onUnlock(), onBack()}
  function showLock(opts) {
    opts = opts || {};
    if (document.getElementById('paLock')) return;
    addCss();
    var nm = NAMES[game], end = opts.reason === 'demo-end';
    var lead = end ? 'That\u2019s the end of the free ' + nm + ' demo. Your progress is saved: unlock and you keep playing right where you are.'
             : opts.reason === 'race' ? 'Races with friends are part of the full game.'
             : 'Play a free demo of every game. One payment unlocks all 4 full games for keeps.';
    var d = document.createElement('div'); d.id = 'paLock'; d.setAttribute('role', 'dialog'); d.setAttribute('aria-modal', 'true');
    d.innerHTML = '<div class="c"><div class="flag">\uD83C\uDFF4\u200D\u2620\uFE0F</div>' +
      '<h2>Unlock all 4 games: <span class="pr"></span> one time</h2>' +
      '<p class="lead">' + lead + '</p>' +
      '<ul><li>\uD83C\uDFAE Full Stack, Scramble, Survival and Box Dig</li><li>\uD83D\uDCB0 <b class="pr"></b> one time. No subscription, no auto-renew</li><li>\uD83D\uDCBE Your progress and best scores are kept</li><li>\uD83D\uDEAB No ads. No surprise charges</li></ul>' +
      '<button class="buy"></button><div class="msg" aria-live="polite"></div>' +
      '<button class="ghost restore">Restore purchase</button>' +
      '<button class="link back">Not now</button></div>';
    document.body.appendChild(d);
    var buyB = d.querySelector('.buy'), msg = d.querySelector('.msg'), waitT = null, done = false, restoreResult = null, unlockedNotified = false;
    function paint() {
      d.querySelectorAll('.pr').forEach(function (e) { e.textContent = price(); });
      if (done) return;
      if (unlocked()) {
        // Cached-only restore: play stays unlocked, but keep the sheet open so the unconfirmed message stays visible.
        if (restoreResult && restoreResult.confirmed === false) {
          if (!unlockedNotified) { unlockedNotified = true; if (opts.onUnlock) opts.onUnlock(); }
          buyB.disabled = true;
          var back = d.querySelector('.link.back'); if (back) back.textContent = 'Got it';
          return;
        }
        done = true; close(); toast((restoreResult && restoreResult.msg) || 'All 4 games unlocked. Yo ho ho!'); if (opts.onUnlock) opts.onUnlock(); return;
      } // once only (restore + store events both repaint)
      if (!storeReady) { buyB.textContent = isNative && !storeSettled ? 'Checking the store\u2026' : 'Coming soon'; buyB.disabled = true; }
      else { buyB.disabled = false; buyB.textContent = 'Unlock all 4 games: ' + price() + ' one time'; }
    }
    function close() { clearTimeout(waitT); d.remove(); window.removeEventListener('keydown', blockKeys, true); listeners = listeners.filter(function (f) { return f !== paint; }); }
    listeners.push(paint); paint();
    window.addEventListener('keydown', blockKeys, true);
    buyB.onclick = function () { buyB.disabled = true; msg.textContent = 'Opening the store\u2026'; buy().then(function (r) { msg.textContent = r.msg; if (!r.wait) paint();
      else waitT = setTimeout(function () { if (!unlocked() && d.isConnected) { msg.textContent = 'Still waiting on the store. If you were charged, tap Restore purchase.'; paint(); } }, 20000); }); }; // Codex: pending order left Buy disabled forever
    d.querySelector('.restore').onclick = function () { msg.textContent = isNative ? 'Checking the ship\u2019s logs\u2026' : ''; restore().then(function (r) { restoreResult = r; msg.textContent = r.msg; paint(); }); };
    d.querySelector('.back').onclick = function () { close(); if (opts.onBack) opts.onBack(); };
    initStore();
  }

  // ---- hub ----
  function home() {
    addCss();
    var b = document.getElementById('paBadge');
    if (!b) { b = document.createElement('a'); b.id = 'paBadge'; var sub = document.querySelector('.sub'); (sub && sub.parentNode ? sub.parentNode.insertBefore(b, sub.nextSibling) : document.body.prepend(b)); }
    function paint() { var u = unlocked(); b.textContent = u ? '\u2705 Unlocked: all 4 full games' : '\uD83C\uDFAE Free demos \u00B7 Unlock all 4 games: ' + price() + ' one time'; b.className = u ? 'own' : '';
      document.querySelectorAll('a.tile[href*="games/"]').forEach(function (a) { var g = (a.getAttribute('href').match(/games\/([^/]+)\//) || [])[1], t = a.querySelector('.t'); if (!g || !t) return;
        var e = t.querySelector('.paDemo'); if (!e) { e = document.createElement('span'); e.className = 'paDemo'; t.appendChild(e); } e.textContent = u ? 'Full game' : 'Free demo: ' + demoLabel(g); }); }
    listeners.push(paint); paint();
    b.onclick = function () { if (!unlocked()) showLock({ reason: 'hub' }); };
    var v = document.getElementById('paVersion');
    if (!v) { v = document.createElement('div'); v.id = 'paVersion'; var f = document.querySelector('footer') || document.body; f.appendChild(v); }
    v.textContent = 'v' + ARCADE_CONFIG.version; v.style.cssText = 'color:#5f7393;font-size:11px;margin-top:10px';
    if (isNative) initStore(); // picks up the localized price + restores ownership silently
  }

  // ---- demo gate: authoritative, called by the game copies at the state transition itself ----
  function over(g, i) { var lim = DEMO_LIMITS[g]; if (!lim) return false; i = i || {};
    if (g === 'storage-stack') return i.next > lim.levels;                                  // level about to start
    if (g === 'storage-auction-scramble') return !!i.race || i.lvl > lim.levels;            // unit about to start / race join
    if (g === 'storage-survival') return i.tick ? i.fi >= lim.facilities : i.fi + 1 >= lim.facilities; // tick: already past / next(): would pass
    if (g === 'box-dig') return (i.unitsDone || 0) >= lim.units;                           // NEW run about to start (a run in progress may finish)
    return false; }
  var Gate = { allow: function (g, info) {
      if (unlocked() || !over(g, info)) return true;
      if (document.body && !document.getElementById('paLock')) showLock({ reason: info && info.race ? 'race' : 'demo-end', onUnlock: info && info.resume });
      return false; },
    over: over };
  try { Object.defineProperty(window, 'PirateArcadeGate', { value: Gate, writable: false, configurable: false }); } catch (e) { window.PirateArcadeGate = Gate; }
  var GATES = {
    'storage-auction-scramble': function () { // RACE button -> lock screen (joinMenu itself is gated in the copy)
      var rm = window.raceMenu; if (typeof rm === 'function') { window.raceMenu = function () { if (unlocked()) return rm.apply(this, arguments); showLock({ reason: 'race' }); };
        var rb = document.getElementById('race'); if (rb) rb.onclick = window.raceMenu; new MutationObserver(function () { var r = document.getElementById('race'); if (r && r.onclick !== window.raceMenu) r.onclick = window.raceMenu; }).observe(document.body, { childList: true, subtree: true }); }
    }
  };

  // ---- player idea box (test copy only; posts to the test Worker, no personal data) ----
  var IDEA_URL = ''; // idea box is test-copy only, not on public Pages
  var IDEA_CHIPS = ['More levels', 'New game', 'Too hard', 'Too easy', 'New items', 'Something else'];
  function ideaScreen() { return inGame ? game : 'hub'; }
  function openIdeaSheet() {
    if (document.getElementById('paIdea')) return;
    addCss();
    var d = document.createElement('div');
    d.id = 'paIdea';
    d.setAttribute('role', 'dialog');
    d.setAttribute('aria-modal', 'true');
    d.setAttribute('aria-label', 'What should we add?');
    var chipsHtml = IDEA_CHIPS.map(function (c) {
      return '<button type="button" class="chip" data-chip="' + c + '" aria-pressed="false">' + c + '</button>';
    }).join('');
    d.innerHTML = '<div class="c"><h2>What should we add?</h2><div class="chips">' + chipsHtml + '</div>' +
      '<label class="lab" for="paIdeaNote">A one-line note (optional)</label>' +
      '<input id="paIdeaNote" maxlength="140" autocomplete="off" placeholder="Your idea in one line">' +
      '<div class="cnt"><span id="paIdeaCnt">0</span>/140</div>' +
      '<div class="err" id="paIdeaErr" aria-live="polite"></div>' +
      '<button type="button" class="send" id="paIdeaSend">SEND</button>' +
      '<button type="button" class="link" id="paIdeaClose">Not now</button></div>';
    document.body.appendChild(d);
    var selected = {};
    d.querySelectorAll('.chip').forEach(function (b) {
      b.onclick = function () {
        var on = b.getAttribute('aria-pressed') === 'true';
        b.setAttribute('aria-pressed', on ? 'false' : 'true');
        b.classList.toggle('on', !on);
        if (on) delete selected[b.getAttribute('data-chip')];
        else selected[b.getAttribute('data-chip')] = true;
      };
    });
    var note = d.querySelector('#paIdeaNote');
    var cnt = d.querySelector('#paIdeaCnt');
    note.oninput = function () { cnt.textContent = String(note.value.length); };
    function close() { d.remove(); }
    d.querySelector('#paIdeaClose').onclick = close;
    d.addEventListener('click', function (e) { if (e.target === d) close(); });
    d.querySelector('#paIdeaSend').onclick = function () { sendIdea(d, Object.keys(selected), note.value); };
  }
  function sendIdea(d, chips, note) {
    var err = d.querySelector('#paIdeaErr');
    var send = d.querySelector('#paIdeaSend');
    note = String(note || '').trim().slice(0, 140);
    if (!chips.length && !note) { err.textContent = 'Tap a chip or write a short note.'; return; }
    send.disabled = true; send.textContent = 'Sending\u2026'; err.textContent = '';
    var body = { chips: chips, note: note, screen: ideaScreen(), version: ARCADE_CONFIG.version, ts: new Date().toISOString() };
    fetch(IDEA_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }, function () { return { ok: r.ok, j: {} }; }); })
      .catch(function () { return { ok: false, j: {} }; })
      .then(function (res) {
        if (!res.ok) {
          send.disabled = false; send.textContent = 'SEND';
          err.textContent = (res.j && res.j.error === 'rate') ? 'Give it a minute, then try again.' : 'Could not send. Try again.';
          return;
        }
        d.querySelector('.c').innerHTML = '<div class="thanks">Thanks, Captain! \uD83C\uDFF4\u200D\u2620\uFE0F</div>';
        setTimeout(function () { if (d.isConnected) d.remove(); }, 1600);
      });
  }
  function mountIdea() {
    addCss();
    if (document.getElementById('paIdeaBtn')) return;
    var b = document.createElement('button');
    b.id = 'paIdeaBtn';
    b.type = 'button';
    if (inGame) { b.className = 'mini'; b.setAttribute('aria-label', 'Got an idea?'); b.textContent = '\uD83D\uDCA1'; }
    else { b.textContent = '\uD83D\uDCA1 Got an idea?'; }
    b.onclick = openIdeaSheet;
    if (inGame) document.body.appendChild(b);
    else {
      var f = document.querySelector('footer');
      if (f && f.parentNode) f.parentNode.insertBefore(b, f);
      else document.body.appendChild(b);
    }
  }

  function boot() {
    if (inGame) { if (!unlocked() && GATES[game] && DEMO_LIMITS[game]) GATES[game](DEMO_LIMITS[game]); if (isNative) initStore(); }
    else home();
    // idea box omitted on public GitHub Pages
  }
  window.PirateArcadeUnlock = { config: ARCADE_CONFIG, demo: DEMO_LIMITS, state: state, showLock: showLock, buy: buy, restore: restore };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
