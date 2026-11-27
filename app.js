/* Neuro Quiz — spaced repetition on the schematic book. Typed answers only.
   Progress is stored on this phone under its own key (does not touch the vessel quiz). */
const KEY = 'neuroquiz_v1', VERSION = '1.6';
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
       .replace(/\bcranial nerve\b/g, 'cn').replace(/\bof\b/g, ' ');
  s = s.split(/\s+/).map(w => ABBR[w] || w).join(' ');       // abbreviations → full words (on both the answer and what you type)
  for (const [re, to] of ALT) s = s.replace(re, to);         // other wordings of the same structure
  return s.replace(/\s+/g, ' ').trim();
}
// unambiguous abbreviations only (VA = visceral afferent in the book, so it is left out)
const ABBR = { a: 'artery', art: 'artery', aa: 'arteries', v: 'v', pca: 'posterior cerebral artery', aca: 'anterior cerebral artery', mca: 'middle cerebral artery',
  ica: 'internal carotid artery', ba: 'basilar artery', pica: 'posterior inferior cerebellar artery', aica: 'anterior inferior cerebellar artery',
  sca: 'superior cerebellar artery', pcom: 'posterior communicating artery', pcomm: 'posterior communicating artery', pcoa: 'posterior communicating artery',
  acom: 'anterior communicating artery', acomm: 'anterior communicating artery', acoa: 'anterior communicating artery', acha: 'anterior choroidal artery', achoa: 'anterior choroidal artery',
  mlf: 'medial longitudinal fasciculus', vpl: 'ventral posterolateral nucleus', vpm: 'ventral posteromedial nucleus', lgn: 'lateral geniculate nucleus', lgb: 'lateral geniculate nucleus',
  mgn: 'medial geniculate nucleus', mgb: 'medial geniculate nucleus', sn: 'substantia nigra', stn: 'subthalamic nucleus', plic: 'posterior limb internal capsule',
  alic: 'anterior limb internal capsule', pprf: 'pprf', csf: 'csf', nts: 'solitary nucleus', cst: 'corticospinal tract', dcml: 'dorsal column medial lemniscus',
  sss: 'superior sagittal sinus', iss: 'inferior sagittal sinus', icv: 'internal cerebral vein', vog: 'great cerebral vein', ew: 'ew' };
const ALT = [[/\bbasilar trunk\b/g, 'basilar artery'], [/\bspinothalamic( tract)?\b/g, 'anterolateral system'],
  [/\b(great )?vein galen\b/g, 'great cerebral vein'], [/\bgalen vein\b/g, 'great cerebral vein'],
  [/\bnucleus solitarius\b/g, 'solitary nucleus'], [/\bnucleus tractus solitarius\b/g, 'solitary nucleus'],
  [/\bsylvian aqueduct\b/g, 'cerebral aqueduct'], [/\baqueduct sylvius\b/g, 'cerebral aqueduct'],
  [/\bedinger westphal\b/g, 'ew'], [/\bpontine paramedian reticular formation\b/g, 'pprf'], [/\bparamedian pontine reticular formation\b/g, 'pprf'],
  [/\bcerebrospinal fluid\b/g, 'csf'], [/\bfourth ventricle\b/g, '4th ventricle'], [/\bthird ventricle\b/g, '3rd ventricle']];
function alts(label) {
  const A = new Set([label]);
  const base = label.replace(/\s*\([^)]*\)/g, '').trim(); A.add(base);
  (label.match(/\(([^)]*)\)/g) || []).forEach(p => { p = p.slice(1, -1).trim(); if (/^[A-Z0-9][A-Z0-9 ]{1,9}$/.test(p) || /^CN [IVX]+$/.test(p)) A.add(p); });
  if (label.includes(':')) A.add(label.split(':')[0]);
  if (base.includes('→')) A.add(base.split('→')[0]);
  if (base.includes(' / ')) base.split(' / ').forEach(x => A.add(x));
  if (base.includes(' — ')) A.add(base.replace(' — ', ' '));
  if (/ nucleus$/i.test(base)) A.add(base.replace(/ nucleus$/i, ''));
  if (/ (tract|artery)$/i.test(base)) A.add(base.replace(/ (tract|artery)$/i, ''));   // "corticospinal", "basilar"
  if (base.includes(', ')) A.add(base.split(', ').reverse().join(' '));                  // "Internal capsule, posterior limb" = "posterior limb of internal capsule"
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
// opposite words are never a typo: "posterior" for "anterior", "superior" for "inferior"…; segment numbers (A1/P1, C4/C5) must match exactly
const OPP = [['anterior', 'posterior'], ['superior', 'inferior'], ['medial', 'lateral'], ['dorsal', 'ventral'], ['left', 'right'], ['internal', 'external'],
  ['rostral', 'caudal'], ['ascending', 'descending'], ['afferent', 'efferent'], ['cervical', 'cerebral'], ['anterolateral', 'posterolateral'],
  ['anteromedial', 'posteromedial'], ['ventromedial', 'ventrolateral'], ['dorsomedial', 'dorsolateral'], ['posterolateral', 'posteromedial'],
  ['anterolateral', 'anteromedial'], ['crossed', 'uncrossed'], ['ipsilateral', 'contralateral'], ['sensory', 'motor'], ['upper', 'lower'],
  ['greater', 'lesser'], ['major', 'minor'], ['deep', 'superficial'], ['anterior', 'inferior'], ['posterior', 'superior'], ['inferior', 'posterior'], ['superior', 'anterior'],
  ['lateral', 'ventral'], ['medial', 'dorsal']];
function clash(u, a) {
  const U = new Set(u.split(' ')), A = new Set(a.split(' '));
  if (OPP.some(([x, y]) => (U.has(x) && !A.has(x) && A.has(y)) || (U.has(y) && !A.has(y) && A.has(x)))) return true;
  return [...U].some(w => /\d/.test(w) && !A.has(w));
}
function check(input, label) {
  const u = norm(input); if (!u) return 'bad';
  let best = 0;
  for (const a of alts(label)) {
    if (clash(u, a)) continue;
    if (u === a) return 'ok';
    if (a.length <= 4 || u.length <= 3) continue;            // abbreviations must be exact
    best = Math.max(best, sim(u, a), sim(sorted(u), sorted(a)));
  }
  if (best >= 0.88) return 'ok';
  for (const a of softAlts(label)) if (!clash(u, a) && sim(u, a) >= 0.85) return 'almost';
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
    if (isNew) x.ivl = 7;                                   // known on first sight: skip 1 and 3 days
    else if (x.failedToday === d) x.ivl = 1;                // got it after missing it today: check again tomorrow
    else if (x.back) { x.ivl = x.back; delete x.back; }     // passed the next-day check after a lapse: resume at a fifth of the old gap
    else x.ivl = x.ivl < 3 ? 3 : Math.round(x.ivl * x.ease);
    x.ease = Math.min(3.0, x.ease + (x.failedToday === d ? 0 : 0.05));
  } else {
    if (!isNew && x.ivl >= 1) { x.lapses++; x.back = Math.max(3, Math.round(x.ivl * 0.2)); }
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
function vivid(c) {                                // a saturated colour (structure), as opposed to white/greys/beige context
  if (!c || c[0] !== '#' || (c.length !== 7 && c.length !== 4)) return false;
  if (c.length === 4) c = '#' + c[1] + c[1] + c[2] + c[2] + c[3] + c[3];
  const r = parseInt(c.slice(1, 3), 16), g = parseInt(c.slice(3, 5), 16), b = parseInt(c.slice(5, 7), 16), mx = Math.max(r, g, b), mn = Math.min(r, g, b);
  return mx > 0 && ((mx - mn) / mx > 0.10 || mx < 200);      // any tint, or a dark fill (e.g. dark grey zones)
}
function centreOf(svg, el) {                      // centre of an element in the figure's own coordinates (handles group shifts)
  const bb = el.getBBox(), p = svg.createSVGPoint(); p.x = bb.x + bb.width / 2; p.y = bb.y + bb.height / 2;
  const q = p.matrixTransform(svg.getScreenCTM().inverse().multiply(el.getScreenCTM())); return { x: q.x, y: q.y, w: bb.width, h: bb.height };
}
function drawFig(c, reveal, zoom) {
  const F = FIGS[c.f], box = $('#fig');
  box.innerHTML = F.svg + '<span class="hint">' + (zoom ? 'tap: whole figure' : 'tap: zoom on it') + '</span>';
  const svg = box.querySelector('svg'), showAll = reveal && box.dataset.all === '1';
  // 1. labels and leader lines: hidden while asking; after the answer only the target's own label (or all, on request)
  svg.querySelectorAll('text[data-k]').forEach(t => {
    const mine = +t.dataset.k === c.k;
    if (mine && reveal) { t.setAttribute('fill', reveal === 'ok' ? '#2e7d32' : '#c62828'); t.setAttribute('font-weight', '700'); }
    else if (!showAll) t.style.display = 'none';
  });
  const near = (a, b) => Math.abs(a[0] - b[0]) < 1.5 && Math.abs(a[1] - b[1]) < 1.5;
  svg.querySelectorAll('polyline[stroke="#9aa5ab"]').forEach(l => {
    const p0 = l.getAttribute('points').trim().split(/\s+/)[0].split(',').map(Number);
    const mine = c.lead && near(p0, [c.x, c.y]);
    if (!(showAll || (reveal && mine))) l.style.display = 'none';
  });
  svg.querySelectorAll('circle[r="2.6"][fill="#37474f"]').forEach(d => {
    const mine = c.lead && near([+d.getAttribute('cx'), +d.getAttribute('cy')], [c.x, c.y]);
    if (!(showAll || (reveal && mine))) d.style.display = 'none';
  });
  // 2. the structure to name keeps its colour with a red outline; every other named structure goes grey
  const T = [];
  svg.querySelectorAll('[data-n]').forEach(el => { if (el.getAttribute('data-n') === c.a) T.push(el); });
  if (!showAll) svg.querySelectorAll('polygon, polyline, path, circle, ellipse, line, rect').forEach(el => {
    if (T.includes(el) || el.closest('clipPath')) return;            // everything coloured that is not the target turns grey
    const f = el.getAttribute('fill'), st = el.getAttribute('stroke');
    if (vivid(f)) { el.setAttribute('fill', el.tagName === 'polygon' ? '#e4e0da' : '#b8bfc4'); if (el.tagName === 'polygon') { el.setAttribute('stroke', '#d3ccc3'); el.setAttribute('stroke-width', '1'); } }
    if (vivid(st) && !/^#(a89886|9e9488)$/i.test(st)) el.setAttribute('stroke', '#b8bfc4');
  });
  let ax = c.x, ay = c.y, small = true;
  if (T.length) {
    T.forEach(el => {
      const tag = el.tagName, under = el.cloneNode();
      under.removeAttribute('data-n');
      if (tag === 'polygon') { el.setAttribute('stroke', '#e53935'); el.setAttribute('stroke-width', '4'); el.setAttribute('fill-opacity', '1'); }
      else if (tag === 'circle') { under.setAttribute('r', +el.getAttribute('r') + 5); under.setAttribute('fill', '#e53935'); under.setAttribute('stroke', 'none'); el.parentNode.insertBefore(under, el); }
      else { under.setAttribute('stroke', '#e53935'); under.setAttribute('stroke-width', (+el.getAttribute('stroke-width') || 3) + 7); under.removeAttribute('stroke-dasharray'); el.parentNode.insertBefore(under, el); }
      el.parentNode.appendChild(el);                       // bring to front
    });
    // centre: the copy nearest the label's anchor (the labelled side)
    let best = null;
    T.forEach(el => { const q = centreOf(svg, el), d = Math.hypot(q.x - c.x, q.y - c.y); if (!best || d < best.d) best = { ...q, d }; });
    ax = best.x; ay = best.y; small = Math.max(best.w, best.h) < 45;
  }
  if (small || !T.length) for (const cls of ['ring2']) {      // tiny structures: a pulsing ring so they are easy to find
    const r = document.createElementNS(NS, 'circle'); r.setAttribute('cx', ax); r.setAttribute('cy', ay); r.setAttribute('r', 14); r.setAttribute('class', cls);
    svg.appendChild(r);
  }
  // crop to the drawing itself (labels are hidden, so the label column and page margins are dead space)
  if (!showAll) {
    const B = contentBox(svg), pad = 14;
    let x = B.x0 - pad, y = B.y0 - pad, w = B.x1 - B.x0 + 2 * pad, h = B.y1 - B.y0 + 2 * pad;
    if (zoom) {                                           // zoom: a window half the size of the drawing, centred on the target
      const zw = Math.max(w / 2, 260), zh = Math.max(h / 2, 260);
      x = Math.min(Math.max(ax - zw / 2, x), x + w - zw); y = Math.min(Math.max(ay - zh / 2, y), y + h - zh); w = zw; h = zh;
    }
    svg.setAttribute('viewBox', `${x} ${y} ${w} ${h}`);
    box.style.maxHeight = '62vh'; svg.style.maxHeight = '62vh';
  }
}
function contentBox(svg) {                       // union of every drawn shape except the page background, leaders and legend
  const inv = svg.getScreenCTM().inverse(); let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
  svg.querySelectorAll('polygon, polyline, path, circle, ellipse').forEach(el => {
    if (el.style.display === 'none' || el.closest('clipPath') || el.closest('defs')) return;
    const bb = el.getBBox(); if (!bb.width && !bb.height) return;
    const m = inv.multiply(el.getScreenCTM());
    for (const [px, py] of [[bb.x, bb.y], [bb.x + bb.width, bb.y + bb.height], [bb.x, bb.y + bb.height], [bb.x + bb.width, bb.y]]) {
      const p = svg.createSVGPoint(); p.x = px; p.y = py; const q = p.matrixTransform(m);
      x0 = Math.min(x0, q.x); y0 = Math.min(y0, q.y); x1 = Math.max(x1, q.x); y1 = Math.max(y1, q.y);
    }
  });
  return { x0, y0, x1, y1 };
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
    <input id="ans" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" placeholder="Name the highlighted structure">
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
