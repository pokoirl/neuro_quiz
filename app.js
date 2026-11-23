/* Neuro Quiz — spaced repetition on the schematic book. Typed answers only.
   Progress is stored on this phone under its own key (does not touch the vessel quiz). */
const KEY = 'neuroquiz_v1', VERSION = '1.1';
const DAY0 = 4;                                    // the day starts at 04:00
const today = () => Math.floor((Date.now() - new Date().getTimezoneOffset() * 6e4 - DAY0 * 36e5) / 864e5);
const S = (() => { try { return JSON.parse(localStorage.getItem(KEY)) || {} } catch (e) { return {} } })();
S.cards = S.cards || {}; S.goal = S.goal || 30; S.newDay = S.newDay || {}; S.hist = S.hist || {}; S.override = S.override || {};
const save = () => localStorage.setItem(KEY, JSON.stringify(S));
const $ = s => document.querySelector(s), app = $('#app');

/* ---------------- answer checking ---------------- */
const ROMAN = ['', 'i', 'ii', 'iii', 'iv', 'v', 'vi', 'vii', 'viii', 'ix', 'x', 'xi', 'xii'];
function norm(s) {
  s = s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  s = s.replace(/[→–—\-\/,:;.()'’"|+]/g, ' ').replace(/\s+/g, ' ').trim();
  s = s.replace(/\bfibers\b/g, 'fibres').replace(/\bfiber\b/g, 'fibre').replace(/\bgray\b/g, 'grey').replace(/\bcenter\b/g, 'centre')
       .replace(/\bnuclei\b/g, 'nucleus').replace(/\bnu\b/g, 'nucleus').replace(/\bthe\b/g, '').replace(/\bcn (\d{1,2})\b/g, (m, d) => 'cn ' + (ROMAN[+d] || d))
       .replace(/\bcranial nerve\b/g, 'cn');
  return s.replace(/\s+/g, ' ').trim();
}
function alts(label) {
  const A = new Set([label]);
  const base = label.replace(/\s*\([^)]*\)/g, '').trim(); A.add(base);
  (label.match(/\(([^)]*)\)/g) || []).forEach(p => { p = p.slice(1, -1).trim(); if (/^[A-Z0-9][A-Z0-9 ]{1,9}$/.test(p) || /^CN [IVX]+$/.test(p)) A.add(p); });
  if (label.includes(':')) A.add(label.split(':')[0]);
  if (base.includes('→')) A.add(base.split('→')[0]);
  if (base.includes(' / ')) base.split(' / ').forEach(x => A.add(x));
  if (base.includes(' — ')) A.add(base.replace(' — ', ' '));
  if (/ nucleus$/i.test(base)) A.add(base.replace(/ nucleus$/i, ''));
  return [...A].map(norm).filter(x => x.length);
}
function softAlts(label) {                                   // half-answers that should prompt "almost", never count as right on their own
  const base = label.replace(/\s*\([^)]*\)/g, '').trim(), A = new Set();
  if (base.includes(' — ')) base.split(' — ').forEach(x => A.add(x));
  if (base.includes(' → ')) A.add(base.split(' → ')[1]);
  return [...A].map(norm).filter(x => x.length > 3);
}
function lev(a, b) {
  const m = a.length, n = b.length; if (!m) return n; if (!n) return m;
  let p = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) { const c = [i]; for (let j = 1; j <= n; j++) c[j] = Math.min(p[j] + 1, c[j - 1] + 1, p[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)); p = c; }
  return p[n];
}
const sim = (a, b) => 1 - lev(a, b) / Math.max(a.length, b.length);
const sorted = s => s.split(' ').sort().join(' ');
function check(input, label) {
  const u = norm(input); if (!u) return 'bad';
  let best = 0;
  for (const a of alts(label)) {
    if (u === a) return 'ok';
    if (a.length <= 4 || u.length <= 3) continue;            // abbreviations must be exact
    best = Math.max(best, sim(u, a), sim(sorted(u), sorted(a)));
  }
  if (best >= 0.88) return 'ok';
  for (const a of softAlts(label)) if (sim(u, a) >= 0.85) return 'almost';
  return best >= 0.70 ? 'almost' : 'bad';
}


/* ---------------- days off: weekends + Moroccan public holidays ----------------
   Fixed holidays per decree 2.77.169 as amended (Yennayer since 2024, Fête de l'Unité since 2026).
   Religious holidays from the tabular Hijri calendar, which matched Morocco's announced dates for 2025–2026;
   moon sighting can still shift one by a day — use the "mark today" button on the home screen. */
const FIXED = [[1, 1, 'Nouvel An'], [1, 11, 'Manifeste de l\'Indépendance'], [1, 14, 'Nouvel An amazigh'], [5, 1, 'Fête du Travail'],
  [7, 30, 'Fête du Trône'], [8, 14, 'Oued Ed-Dahab'], [8, 20, 'Révolution du Roi et du Peuple'], [8, 21, 'Fête de la Jeunesse'],
  [10, 31, 'Fête de l\'Unité'], [11, 6, 'Marche Verte'], [11, 18, 'Fête de l\'Indépendance']];
const RELIG = [[10, 1, 'Aïd al-Fitr'], [10, 2, 'Aïd al-Fitr (2e jour)'], [12, 10, 'Aïd al-Adha'], [12, 11, 'Aïd al-Adha (2e jour)'],
  [1, 1, '1er Moharram'], [3, 12, 'Aïd al-Mawlid'], [3, 13, 'Aïd al-Mawlid (2e jour)']];
const hijriToDay = (y, m, d) => d + Math.ceil(29.5 * (m - 1)) + (y - 1) * 354 + Math.floor((3 + 11 * y) / 30) + 1948439.5 - 1 - 2440587.5;
const HOL = {};
function holidaysOf(gy) {
  if (HOL[gy]) return HOL[gy];
  const H = {};
  for (const [m, d, n] of FIXED) { if (m === 10 && d === 31 && gy < 2026) continue; H[Math.round(Date.UTC(gy, m - 1, d) / 864e5)] = n; }
  const hy0 = Math.floor((gy - 622) * 33 / 32);
  for (let hy = hy0 - 1; hy <= hy0 + 2; hy++) for (const [m, d, n] of RELIG) {
    const day = Math.round(hijriToDay(hy, m, d));
    if (new Date(day * 864e5).getUTCFullYear() === gy) H[day] = n;
  }
  return HOL[gy] = H;
}
function offReason(d) {
  if (d in S.override) return S.override[d] ? 'marked as a day off' : null;
  const dt = new Date(d * 864e5), wd = dt.getUTCDay();
  if (wd === 6) return 'Saturday'; if (wd === 0) return 'Sunday';
  return holidaysOf(dt.getUTCFullYear())[d] || null;
}
const isOff = d => !!offReason(d);
const nextWork = d => { let k = 0; while (isOff(d) && k++ < 30) d++; return d; };
const fmt = d => new Date(d * 864e5).toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
function upcomingHolidays(n) {
  const out = [], d0 = today();
  for (let d = d0 + 1; out.length < n && d < d0 + 400; d++) { const dt = new Date(d * 864e5), wd = dt.getUTCDay(); const h = holidaysOf(dt.getUTCFullYear())[d]; if (h && wd !== 0 && wd !== 6) out.push(`${fmt(d)} — ${h}`); }
  return out;
}
/* ---------------- scheduling (SM-2 style) ---------------- */
const st = id => S.cards[id];
function grade(c, right) {
  const d = today(); let x = S.cards[c.id];
  const isNew = !x;
  if (!x) { x = S.cards[c.id] = { ivl: 0, ease: 2.5, due: d, seen: d, n: 0, lapses: 0 }; S.newDay[d] = (S.newDay[d] || 0) + 1; }
  x.n++;
  if (right) {
    x.ivl = x.ivl < 1 ? 1 : x.ivl < 3 ? 3 : Math.round(x.ivl * x.ease);
    x.ease = Math.min(3.0, x.ease + (x.failedToday === d ? 0 : 0.05));
  } else {
    if (!isNew && x.ivl >= 1) x.lapses++;
    x.ease = Math.max(1.3, x.ease - 0.2); x.ivl = 0; x.failedToday = d;
  }
  x.due = x.ivl ? nextWork(d + x.ivl) : d;               // never due on a weekend or holiday
  const h = S.hist[d] = S.hist[d] || { r: 0, ok: 0 }; h.r++; if (right) h.ok++;
  save();
}
function tierStats() {
  const T = { 1: { n: 0, seen: 0 }, 2: { n: 0, seen: 0 }, 3: { n: 0, seen: 0 } };
  for (const c of CARDS) { T[c.t].n++; if (st(c.id)) T[c.t].seen++; }
  let open = 1; while (open < 3 && T[open].seen === T[open].n) open++;
  return { T, open };
}
function dueCards() { const d = today(); return CARDS.filter(c => { const x = st(c.id); return x && x.due <= d; }); }
function newCards(k) {
  const { open } = tierStats(), out = [];
  for (const c of CARDS) { if (out.length >= k) break; if (c.t > open) break; if (!st(c.id)) out.push(c); }
  return out;
}
const newLeft = () => Math.max(0, S.goal - (S.newDay[today()] || 0));

/* ---------------- figure rendering ---------------- */
const NS = 'http://www.w3.org/2000/svg';
function drawFig(c, reveal, zoom) {
  const F = FIGS[c.f], box = $('#fig');
  box.innerHTML = F.svg + '<span class="hint">' + (zoom ? 'tap: whole figure' : 'tap: zoom on the ring') + '</span>';
  const svg = box.querySelector('svg');
  let ax = c.x, ay = c.y;
  if (!c.lead) {                                     // label sits on its structure: ring its real drawn centre
    const t = svg.querySelector(`text[data-k="${c.k}"]`), bb = t.getBBox(), p = svg.createSVGPoint();
    p.x = bb.x + bb.width / 2; p.y = bb.y + bb.height / 2;
    const q = p.matrixTransform(svg.getScreenCTM().inverse().multiply(t.getScreenCTM())); ax = q.x; ay = q.y;
  }
  svg.querySelectorAll('text[data-k]').forEach(t => {
    const k = +t.dataset.k;
    if (k === c.k) {
      if (reveal) { t.setAttribute('fill', reveal === 'ok' ? '#2e7d32' : '#c62828'); t.setAttribute('font-weight', '700'); }
      else {
        const bb = t.getBBox(), r = document.createElementNS(NS, 'rect');
        r.setAttribute('x', bb.x - 4); r.setAttribute('y', bb.y - 3); r.setAttribute('width', Math.max(46, bb.width + 8)); r.setAttribute('height', bb.height + 6);
        r.setAttribute('rx', 6); r.setAttribute('fill', '#e53935'); t.removeAttribute('stroke'); t.parentNode.insertBefore(r, t);
        t.textContent = '?'; t.setAttribute('fill', '#fff'); t.setAttribute('font-weight', '700'); t.setAttribute('x', bb.x + Math.max(46, bb.width + 8) / 2 - 8);
        t.removeAttribute('text-anchor');
      }
    } else if (!(reveal && box.dataset.all === '1')) t.style.visibility = 'hidden';
  });
  if (c.lead) for (const cls of ['ring', 'ring2']) {
    const r = document.createElementNS(NS, 'circle'); r.setAttribute('cx', ax); r.setAttribute('cy', ay); r.setAttribute('r', 14); r.setAttribute('class', cls);
    svg.appendChild(r);
  }
  if (zoom) {
    const w = 560, h = Math.round(w * 1.15), x = Math.min(Math.max(ax - w / 2, 0), F.w - w), y = Math.min(Math.max(ay - h / 2, 78), F.h - h);
    svg.setAttribute('viewBox', `${x} ${y} ${w} ${h}`);
  }
}

/* ---------------- screens ---------------- */
let Q = [], cur = null, done = 0, total = 0, zoom = false, answered = null;
function home() {
  $('#htitle').textContent = 'Neuro Quiz'; $('#hprog').textContent = ''; $('#hbtn').hidden = true;
  const off = offReason(today());
  const { T, open } = tierStats(), due = off ? 0 : dueCards().length, nl = off ? 0 : Math.min(newLeft(), newCards(newLeft()).length);
  const h = S.hist[today()] || { r: 0, ok: 0 };
  app.innerHTML = `
  <div class="card"><div class="row">
    <div class="stat"><div class="big">${due}</div><small>reviews due</small></div>
    <div class="stat"><div class="big">${nl}</div><small>new today</small></div>
    <div class="stat"><div class="big">${h.r}</div><small>answered today</small></div></div>
    <button class="btn" id="go" ${due + nl ? '' : 'disabled'}>${off ? 'Day off — ' + off : due + nl ? 'Start session' : 'All done for today'}</button>
    <button class="btn alt" id="ovd" style="font-size:14px;padding:10px">${off ? 'Moon sighting moved it? Make today a working day' : 'Make today a day off (holiday moved)'}</button></div>
  <div class="card"><b>Next holidays</b> <span class="muted">— weekends are always off; religious dates are expected dates</span>
    <div class="muted" style="margin-top:6px;line-height:1.6">${upcomingHolidays(4).join('<br>')}</div></div>
  <div class="card"><b>Tiers</b> <span class="muted">— a tier opens once every card of the tier before has been seen</span>
    ${[1, 2, 3].map(t => `<div style="margin-top:10px">Tier ${t} ${t > open ? '🔒' : ''} <span class="muted">${T[t].seen} / ${T[t].n} seen</span>
      <div class="bar"><i style="width:${100 * T[t].seen / T[t].n}%"></i></div></div>`).join('')}</div>
  <div class="card"><b>New cards per day</b><div class="seg">${[15, 30, 40, 50].map(g => `<button data-g="${g}" class="${S.goal === g ? 'on' : ''}">${g}</button>`).join('')}</div>
    <div class="muted" style="margin-top:6px">Each session = today's new cards + every review that is due.</div></div>
  <div class="card"><b>Backup</b><div class="muted">Progress is stored only on this phone. Export now and then.</div>
    <div class="two"><button class="btn alt" id="exp">Export</button><button class="btn alt" id="imp">Import</button></div>
    <input type="file" id="file" accept=".json,application/json" hidden>
    <button class="btn alt" id="rst" style="margin-top:14px;color:#c62828">Reset all progress</button>
    <div class="muted" style="margin-top:8px">${CARDS.length} cards · ${FIGS.length} figures · v${VERSION}</div></div>`;
  $('#go').onclick = start;
  $('#ovd').onclick = () => { const d = today(); S.override[d] = !off; save(); home(); };
  app.querySelectorAll('.seg button').forEach(b => b.onclick = () => { S.goal = +b.dataset.g; save(); home(); });
  $('#exp').onclick = () => {
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify(S)], { type: 'application/json' }));
    a.download = `neuroquiz-backup-${new Date().toISOString().slice(0, 10)}.json`; a.click();
  };
  $('#imp').onclick = () => $('#file').click();
  $('#file').onchange = e => {
    const f = e.target.files[0]; if (!f) return;
    f.text().then(t => { try { const o = JSON.parse(t); if (!o.cards) throw 0; if (!confirm('Replace progress on this phone with the backup?')) return;
      localStorage.setItem(KEY, t); location.reload(); } catch (err) { alert('Not a Neuro Quiz backup file.'); } });
  };
  $('#rst').onclick = () => { if (confirm('Erase ALL progress on this phone?') && confirm('Really? This cannot be undone.')) { localStorage.removeItem(KEY); location.reload(); } };
}
function start() {
  const due = dueCards(); shuffle(due);
  const nw = newCards(newLeft());
  Q = [...interleave(due, nw)]; done = 0; total = Q.length; next();
}
function shuffle(a) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1));[a[i], a[j]] = [a[j], a[i]]; } }
function* interleave(rev, nw) { let i = 0, j = 0; while (i < rev.length || j < nw.length) { if (i < rev.length) yield rev[i++]; if (i < rev.length) yield rev[i++]; if (j < nw.length) yield nw[j++]; } }
function next() {
  if (!Q.length) return finish();
  cur = Q.shift(); answered = null; zoom = false;
  $('#hbtn').hidden = false; $('#hbtn').onclick = () => { if (confirm('End the session? Answers so far are saved.')) home(); };
  $('#hprog').textContent = `${done} / ${total}`;
  const F = FIGS[cur.f], isNew = !st(cur.id);
  $('#htitle').textContent = `Tier ${cur.t} · ${F.sec}`;
  app.innerHTML = `<div class="meta">${isNew ? '<b style="color:#00897b">NEW</b> · ' : ''}${esc(F.sub)}</div>
    <div id="fig"></div>
    <input id="ans" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" placeholder="Name the ringed structure">
    <div class="two"><button class="btn alt" id="idk">Don't know</button><button class="btn" id="chk">Check</button></div>
    <div id="out"></div>`;
  drawFig(cur, null, zoom);
  $('#fig').onclick = () => { zoom = !zoom; drawFig(cur, answered, zoom); };
  $('#ans').onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); answered ? $('#nx').click() : submit(); } };
  $('#chk').onclick = () => submit(false); $('#idk').onclick = () => { $('#ans').value = ''; submit(true); };
  setTimeout(() => $('#ans').focus(), 50);
}
function submit(gaveUp) {
  if (answered) return;
  const r = gaveUp ? 'bad' : check($('#ans').value, cur.a);
  answered = r; $('#ans').disabled = true; $('#chk').parentNode.remove();
  const F = FIGS[cur.f];
  const msg = { ok: 'Correct', almost: 'Almost — accept it?', bad: gaveUp ? 'Answer' : 'Wrong' }[r];
  $('#out').innerHTML = `<div class="fb ${r}">${msg}<b>${esc(cur.a)}</b><div class="muted" style="margin-top:4px">${esc(F.title)} · Haines p.${F.page}</div></div>
    <div class="two">${r === 'ok' ? '<button class="btn alt" id="ovr">Mark wrong</button><button class="btn" id="nx">Next</button>'
      : r === 'almost' ? '<button class="btn warn" id="ovr">No, wrong</button><button class="btn" id="nx">Yes, accept</button>'
      : '<button class="btn alt" id="ovr">I was right</button><button class="btn" id="nx">Next</button>'}</div>
    <button class="btn alt" id="all">Show all labels</button>`;
  let right = r !== 'bad';
  $('#ovr').onclick = () => { right = r === 'bad'; finishCard(right); };
  $('#nx').onclick = () => finishCard(right);
  $('#all').onclick = () => { const b = $('#fig'); b.dataset.all = b.dataset.all === '1' ? '0' : '1'; drawFig(cur, answered === 'bad' ? 'bad' : 'ok', zoom); };
  drawFig(cur, r === 'bad' ? 'bad' : 'ok', zoom);
  $('#nx').focus();
}
function finishCard(right) {
  grade(cur, right);
  if (right) done++; else Q.splice(Math.min(5, Q.length), 0, cur);   // missed cards come back a few cards later
  next();
}
function finish() {
  $('#hbtn').hidden = true; $('#hprog').textContent = '';
  const h = S.hist[today()] || { r: 0, ok: 0 };
  app.innerHTML = `<div class="card"><div class="big">Done</div><p>${h.r} answers today, ${h.r ? Math.round(100 * h.ok / h.r) : 0}% right first time or after retry.</p>
    <button class="btn" id="hm">Home</button></div>`;
  $('#hm').onclick = home;
}
const esc = s => s.replace(/[&<>"]/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[m]));
home();
