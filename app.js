/* 냉장고뱅크 — 재료·양념·남은 요리 관리 + 메뉴 추천 + 이마트 할인/제철
   데이터: 로컬 모드(localStorage). config.js 에 Supabase 가 설정되면 공유 동기화(2단계). */
'use strict';

// ─────────────────────────── 유틸
const $ = (s, r = document) => r.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const DAY = 864e5;
const today = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; };
const parseD = (s) => { if (!s) return null; const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const fmtD = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const md = (d) => `${d.getMonth() + 1}/${d.getDate()}`;
const addDays = (d, n) => new Date(d.getTime() + n * DAY);
const uid = () => Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-4);
const norm = (s) => String(s || '').replace(/\s/g, '').toLowerCase();

const LOC = { fridge: '냉장', freezer: '냉동', room: '실온' };
const LOCKEY = { fridge: 'f', freezer: 'z', room: 'r' };
const KIND = { food: '식재료', pantry: '양념·건식품', leftover: '남은 요리' };
const DATE_LABEL = { fresh: '구입일', open: '개봉일', sealed: '구입일', cooked: '조리일' };
const STAPLES = new Set(['물', '밥']);

// ─────────────────────────── 저장소
const DB_KEY = 'fridgebank.v1';
let S = load();
function load() {
  try { const s = JSON.parse(localStorage.getItem(DB_KEY)); if (s && s.items) return s; } catch (e) {}
  return freshState();
}
function freshState() {
  return { v: 1, me: '', items: (window.SEED || []).map(normalizeItem), deals: [], updated: Date.now() };
}
function save() {
  S.updated = Date.now();
  try { localStorage.setItem(DB_KEY, JSON.stringify(S)); } catch (e) { toast('저장 실패: 브라우저 저장공간을 확인하세요'); }
  window.fbSync?.push(); // 공유 모드면 바뀐 기록만 서버로
}
function normalizeItem(x) {
  const g = findGuide(x.name);
  const kind = x.kind || (g && g.c === '조리' ? 'leftover' : g && (g.c === '양념' || g.c === '건식품') ? 'pantry' : 'food');
  const state = x.state || (kind === 'pantry' ? 'open' : kind === 'leftover' ? 'cooked' : 'fresh');
  const loc = x.loc || (g ? (state === 'open' && g.ol ? g.ol : g.l) : 'fridge');
  return { id: x.id || uid(), name: x.name, qty: x.qty || '', kind, state, loc, date: x.date || fmtD(today()),
    expire: x.expire || '', est: !!x.est, note: x.note || '', by: x.by || '', at: x.at || Date.now() };
}

// ─────────────────────────── 보관 기준
function findGuide(name) {
  const s = norm(name); if (!s) return null;
  let best = null, bl = 0;
  for (const g of window.GUIDE) for (const w of [g.n, ...(g.a || [])]) {
    const ww = norm(w);
    if (ww && s.includes(ww) && ww.length > bl) { best = g; bl = ww.length; }
  }
  return best;
}
const guideOf = (it) => findGuide(it.name);
const keyOf = (it) => { const g = guideOf(it); return g ? g.n : it.name; };

function life(it) {
  const g = guideOf(it);
  if (it.expire) return { exp: parseD(it.expire), basis: 'label', g };
  if (it.state === 'sealed') return { basis: 'sealed', g };
  if (!g) return { basis: 'none' };
  let r = null, warn = '';
  if (it.state === 'open' && g.o) {
    r = g.o;
    if (g.ol && g.ol !== it.loc) warn = `개봉 후 권장 보관: ${LOC[g.ol]}`;
  } else {
    r = g[LOCKEY[it.loc]];
    if (!r) { warn = `${LOC[it.loc]} 보관은 권장하지 않음 (권장: ${LOC[g.l]})`; r = g[LOCKEY[g.l]]; }
  }
  const b = parseD(it.date);
  if (!b || !r) return { basis: 'guide', r, warn, g };
  return { exp: addDays(b, r[0]), max: addDays(b, r[1]), r, warn, g, basis: 'guide' };
}
function dday(it) { const L = life(it); return L.exp ? Math.round((L.exp - today()) / DAY) : null; }
function rangeText(r) {
  if (!r) return '—';
  const f = (n) => n >= 730 ? `${Math.round(n / 365)}년` : n >= 60 ? `${Math.round(n / 30)}개월` : `${n}일`;
  return r[0] === r[1] ? f(r[0]) : `${f(r[0])}~${f(r[1])}`;
}
function badge(it) {
  const L = life(it);
  if (L.basis === 'sealed') return `<span class="bdg muted">미개봉</span>`;
  if (!L.exp) return `<span class="bdg muted">기한 미정</span>`;
  const d = Math.round((L.exp - today()) / DAY);
  const cls = d <= 2 ? 'bad' : d <= 7 ? 'warn' : 'ok';
  const txt = d < 0 ? `${-d}일 지남` : d === 0 ? '오늘까지' : d > 90 ? `~${L.exp.getFullYear() % 100}.${L.exp.getMonth() + 1}월` : `D-${d}`;
  return `<span class="bdg ${cls}">${txt}</span>`;
}

// ─────────────────────────── 할인·제철
function allDeals() {
  const t = today();
  const src = (window.EMART_DEALS?.items || []).map((d) => ({ ...d, auto: true }));
  return [...src, ...S.deals].filter((d) => !d.end || parseD(d.end) >= t);
}
function expandKeys(keys) {
  const out = new Set();
  for (const k of keys) {
    out.add(k);
    const g = window.GUIDE.find((x) => x.n === k);
    if (g) (g.a || []).filter((a) => norm(a).length >= 2).forEach((a) => out.add(a)); // '파'→양파·파스타 오매칭 방지
  }
  return [...out].map(norm).filter((x) => x.length >= 1);
}
function dealFor(keys) {
  const ks = expandKeys(keys);
  return allDeals().find((d) => ks.some((k) => norm(d.name).includes(k)));
}
const seasonNow = () => window.SEASON[today().getMonth() + 1] || [];
function inSeason(keys, name) {
  const ks = expandKeys(keys);
  return seasonNow().some((s) => ks.includes(norm(s.n)) || norm(name).includes(norm(s.n)));
}

// ─────────────────────────── 레시피 매칭
function haveItems(keys) {
  const ks = keys.map(norm);
  return S.items.filter((it) => {
    const d = dday(it); if (d !== null && d < 0) return false;
    const k = norm(keyOf(it)), n = norm(it.name);
    // 남은 요리는 정확히 같은 키일 때만 (소고기무국 ≠ 무, 소고기 불고기 ≠ 생 소고기)
    return ks.some((x) => x === k || (it.kind !== 'leftover' && n.includes(x)));
  });
}
function analyze(r) {
  const rows = r.ing.map((i) => {
    const staple = i.k.some((k) => STAPLES.has(k));
    const found = staple ? [] : haveItems(i.k);
    return { ...i, staple, found, ok: staple || found.length > 0 };
  });
  const req = rows.filter((x) => !x.opt && !x.staple);
  const miss = req.filter((x) => !x.ok);
  const used = rows.flatMap((x) => x.found);
  const urgent = used.filter((it) => { const d = dday(it); return d !== null && d <= 3; });
  const leftover = used.some((it) => it.kind === 'leftover');
  const seasonal = rows.some((x) => inSeason(x.k, x.n));
  const sale = rows.map((x) => ({ x, deal: dealFor(x.k) })).filter((y) => y.deal);
  const pct = req.length ? (req.length - miss.length) / req.length : 1;
  const score = pct * 100 + (leftover ? 30 : 0) + Math.min(urgent.length, 3) * 8 - miss.length * 6 + (seasonal ? 4 : 0) + (sale.length ? 4 : 0);
  return { r, rows, req, miss, urgent, leftover, seasonal, sale, pct, score };
}
const analyzed = () => window.RECIPES.map(analyze).sort((a, b) => b.score - a.score);

// 분량 표시
const FR = [[0, ''], [0.25, '¼'], [1 / 3, '⅓'], [0.5, '½'], [2 / 3, '⅔'], [0.75, '¾'], [1, '']];
function amount(i, f) {
  if (i.q == null) return i.u || '약간';
  const v = i.q * f;
  if (['g', 'ml'].includes(i.u)) {
    const step = v < 20 ? 1 : v < 100 ? 5 : 10;
    const n = Math.max(step, Math.round(v / step) * step);
    return n >= 1000 && i.u === 'ml' ? `${+(n / 1000).toFixed(2)}L` : n >= 1000 ? `${+(n / 1000).toFixed(2)}kg` : `${n}${i.u}`;
  }
  let w = Math.floor(v), frac = v - w, best = FR[0];
  for (const c of FR) if (Math.abs(c[0] - frac) < Math.abs(best[0] - frac)) best = c;
  if (best[0] === 1) { w += 1; best = FR[0]; }
  let s = (w ? String(w) : '') + best[1];
  if (!s) s = '¼';
  return `${s}${i.u}`;
}

// ─────────────────────────── UI 상태
const ui = { view: 'home', filter: 'all', q: '', cookCat: '전체', cookMode: 'all', store: '전체', vs: '전체', month: today().getMonth() + 1, serv: {} };

function render() {
  const v = VIEWS[ui.view] || VIEWS.home;
  $('#view').innerHTML = v();
  document.querySelectorAll('#tabs a').forEach((a) => a.classList.toggle('on', a.dataset.view === ui.view));
  $('#sync').textContent = window.fbSync ? window.fbSync.status : '로컬 모드';
  if (ui.view === 'settings') window.fbSync?.fillInfo();
}
function go(view) { ui.view = view; location.hash = view; render(); window.scrollTo(0, 0); }

// ─────────────────────────── 홈
function itemRow(it) {
  const L = life(it);
  const meta = [it.qty, `${LOC[it.loc]}`, it.date ? `${DATE_LABEL[it.state]} ${md(parseD(it.date))}` : '']
    .filter(Boolean).join(' · ');
  return `<div class="row" data-act="edit" data-id="${it.id}">
    <div class="main"><div class="name">${esc(it.name)} ${it.est ? '<span class="tag est">날짜 추정</span>' : ''}</div>
      <div class="meta">${esc(meta)}</div>
      ${L.warn ? `<div class="warnline">⚠ ${esc(L.warn)}</div>` : ''}</div>
    ${badge(it)}</div>`;
}
function recipeCard(a) {
  const r = a.r;
  const ings = a.rows.filter((x) => !x.staple && !x.opt).map((x) => x.ok ? `<span class="have">${esc(short(x.n))}</span>` : `<span class="miss">${esc(short(x.n))}</span>`).join(' · ');
  const tags = [
    a.leftover ? '<span class="bdg info">남은 요리 소진</span>' : '',
    a.urgent.length ? '<span class="bdg warn">임박 재료</span>' : '',
    a.seasonal ? '<span class="bdg ok">제철</span>' : '',
    a.sale.length ? '<span class="bdg bad">할인</span>' : '',
  ].join(' ');
  const st = a.miss.length === 0 ? '<span class="bdg ok">바로 가능</span>' : `<span class="bdg muted">${a.miss.length}개 부족</span>`;
  return `<div class="card rc" data-act="recipe" data-id="${r.id}">
    <div class="t">${esc(r.name)} ${st}</div>
    <div class="small muted">${esc(r.cat)} · ${r.base}인분 · ${r.min}분${r.note ? ' ' + esc(r.note) : ''}</div>
    <div class="bar"><i style="width:${Math.round(a.pct * 100)}%"></i></div>
    <div class="ings">${ings}</div>
    ${tags.trim() ? `<div>${tags}</div>` : ''}</div>`;
}
const short = (s) => s.replace(/\(.*?\)/g, '').trim();

function shoppingHints(list) {
  const cnt = new Map();
  for (const a of list) if (a.miss.length && a.miss.length <= 2) for (const m of a.miss) {
    const key = short(m.n);
    const e = cnt.get(key) || { n: key, k: m.k, recipes: [] };
    e.recipes.push(a.r.name); cnt.set(key, e);
  }
  return [...cnt.values()].sort((x, y) => y.recipes.length - x.recipes.length).slice(0, 4);
}

const VIEWS = {};
VIEWS.home = () => {
  const t = today();
  const urgent = S.items.filter((it) => { const d = dday(it); return (d !== null && d <= 3) || it.kind === 'leftover'; })
    .sort((a, b) => (dday(a) ?? 99) - (dday(b) ?? 99));
  const list = analyzed();
  const top = list.slice(0, 4);
  const hints = shoppingHints(list);
  const deals = allDeals();
  const season = seasonNow();
  const estCount = S.items.filter((i) => i.est).length;
  return `
  <h1>${t.getMonth() + 1}월 ${t.getDate()}일 ${'일월화수목금토'[t.getDay()]}요일</h1>
  <p class="sub">재료 ${S.items.length}개 · 레시피 ${window.RECIPES.length}개${S.me ? ` · ${esc(S.me)}님` : ''}</p>
  ${estCount ? `<div class="note" style="margin-top:12px"><b>날짜 확인 필요</b> — ${estCount}개 재료의 구입/개봉일이 오늘(추정)로 들어가 있어요. 냉장고 탭에서 눌러서 실제 날짜로 고치면 D-day가 정확해집니다.</div>` : ''}

  <h2>🔥 먼저 먹을 것 <a class="more" data-act="nav" data-view="fridge">냉장고 →</a></h2>
  <div class="card list">${urgent.length ? urgent.map(itemRow).join('') : '<div class="empty">3일 안에 먹어야 할 재료가 없어요 👍</div>'}</div>

  <h2>🍳 오늘 추천 <a class="more" data-act="nav" data-view="cook">전체 →</a></h2>
  <div class="grid">${top.map(recipeCard).join('')}</div>

  ${hints.length ? `<h2>🛒 이것만 사면</h2>
  <div class="card list">${hints.map((h) => { const d = dealFor(h.k); return `<div class="row" data-act="nav" data-view="cook">
    <div class="main"><div class="name">${esc(h.n)}</div><div class="meta">${h.recipes.map(esc).join(', ')}</div></div>
    ${d ? `<span class="bdg bad">할인 ${esc(d.price || '')}</span>` : `<span class="bdg muted">+${h.recipes.length}메뉴</span>`}</div>`; }).join('')}</div>` : ''}

  <h2>🏷️ 마트 할인 <a class="more" data-act="nav" data-view="market">전체 →</a></h2>
  ${deals.length ? `<div class="card list">${[...deals].sort((a, b) => (VS_ORDER[a.cp?.vs] ?? 2) - (VS_ORDER[b.cp?.vs] ?? 2)).slice(0, 5).map(dealRow).join('')}</div>`
    : `<div class="card pad small muted">아직 이번 주 행사 정보가 없어요. 할인·제철 탭에서 직접 추가하거나, Claude in Chrome 주간 작업이 채워줍니다.</div>`}

  <h2>🍂 ${t.getMonth() + 1}월 제철</h2>
  <div class="chips">${season.map((s) => `<span class="chip">${esc(s.n)}</span>`).join('')}</div>`;
};

// ─────────────────────────── 냉장고
VIEWS.fridge = () => {
  const F = [['all', '전체'], ['leftover', '남은 요리'], ['fridge', '냉장'], ['freezer', '냉동'], ['room', '실온'], ['pantry', '양념·건식품']];
  const q = norm(ui.q);
  let items = S.items.filter((it) => !q || norm(it.name).includes(q));
  const sortD = (a, b) => (dday(a) ?? 9999) - (dday(b) ?? 9999);
  const groups = [
    ['leftover', '🍲 남은 요리', items.filter((i) => i.kind === 'leftover')],
    ['fridge', '🧊 냉장', items.filter((i) => i.kind === 'food' && i.loc === 'fridge')],
    ['freezer', '❄️ 냉동', items.filter((i) => i.kind === 'food' && i.loc === 'freezer')],
    ['room', '🧺 실온', items.filter((i) => i.kind === 'food' && i.loc === 'room')],
    ['pantry', '🧂 양념·건식품', items.filter((i) => i.kind === 'pantry')],
  ].filter(([k]) => ui.filter === 'all' || ui.filter === k);
  return `
  <h1>냉장고</h1><p class="sub">항목을 누르면 날짜·수량 수정, 보관법 확인</p>
  <div class="chips">${F.map(([k, l]) => `<button class="chip ${ui.filter === k ? 'on' : ''}" data-act="filter" data-v="${k}">${l}</button>`).join('')}</div>
  <input class="search" id="q" placeholder="재료 검색" value="${esc(ui.q)}">
  ${groups.map(([k, label, list]) => list.length ? `<div class="grp">${label} <span class="muted">${list.length}</span></div>
    <div class="card list">${list.sort(sortD).map(itemRow).join('')}</div>` : '').join('')}
  ${items.length ? '' : '<div class="empty">재료가 없어요. + 버튼으로 추가하세요.</div>'}
  <button class="fab" data-act="add" aria-label="재료 추가">+</button>`;
};

function itemForm(it) {
  const isNew = !it;
  it = it || { id: '', name: '', qty: '', kind: 'food', state: 'fresh', loc: 'fridge', date: fmtD(today()), expire: '', est: false, note: '' };
  const seg = (name, opts, cur) => `<div class="seg" data-seg="${name}">${opts.map(([v, l]) => `<button type="button" data-v="${v}" class="${cur === v ? 'on' : ''}">${l}</button>`).join('')}</div>`;
  return `<div class="sheet"><h1>${isNew ? '재료 추가' : esc(it.name)}<button class="x" data-act="close">✕</button></h1>
  <form class="form" id="itemForm" data-id="${it.id}">
    <label>이름<input name="name" list="guideNames" value="${esc(it.name)}" required autocomplete="off" placeholder="예: 대파, 양조간장, 남은 카레"></label>
    <datalist id="guideNames">${window.GUIDE.map((g) => `<option value="${esc(g.n)}">`).join('')}</datalist>
    <label>종류${seg('kind', [['food', '식재료'], ['pantry', '양념·건식품'], ['leftover', '남은 요리']], it.kind)}</label>
    <label>보관 위치${seg('loc', [['fridge', '냉장'], ['freezer', '냉동'], ['room', '실온']], it.loc)}</label>
    <label id="stateWrap" ${it.kind === 'pantry' ? '' : 'hidden'}>상태${seg('state', [['open', '개봉'], ['sealed', '미개봉']], it.kind === 'pantry' ? it.state : 'open')}</label>
    <div class="two">
      <label><span id="dateLabel">${DATE_LABEL[it.state]}</span><input type="date" name="date" value="${esc(it.date)}"></label>
      <label>유통기한 (라벨, 선택)<input type="date" name="expire" value="${esc(it.expire)}"></label>
    </div>
    <label>수량<input name="qty" value="${esc(it.qty)}" placeholder="예: 3개, 반 통, 2인분"></label>
    <label>메모<input name="note" value="${esc(it.note)}"></label>
    <label style="display:flex;gap:8px;align-items:center;color:var(--text)"><input type="checkbox" name="est" ${it.est ? 'checked' : ''} style="width:auto"> 날짜가 정확하지 않음 (추정)</label>
    <div id="guideBox"></div>
    <div class="btns">
      ${isNew ? '' : '<button type="button" class="btn danger" data-act="del">다 먹음/버림</button>'}
      <button class="btn pri" type="submit">저장</button>
    </div>
    ${!isNew && it.by ? `<p class="small muted">마지막 수정: ${esc(it.by)} · ${new Date(it.at).toLocaleString('ko-KR')}</p>` : ''}
  </form></div>`;
}
function readForm(f) {
  const segv = (n) => f.querySelector(`[data-seg="${n}"] .on`)?.dataset.v;
  const kind = segv('kind');
  const state = kind === 'pantry' ? segv('state') : kind === 'leftover' ? 'cooked' : 'fresh';
  return { name: f.name.value.trim(), kind, state, loc: segv('loc'), date: f.date.value, expire: f.expire.value,
    qty: f.qty.value.trim(), note: f.note.value.trim(), est: f.est.checked };
}
function updateGuideBox() {
  const f = $('#itemForm'); if (!f) return;
  const d = readForm(f);
  $('#dateLabel').textContent = DATE_LABEL[d.state];
  $('#stateWrap').hidden = d.kind !== 'pantry';
  const g = findGuide(d.name);
  if (!g) { $('#guideBox').innerHTML = d.name ? '<div class="guidebox">보관표에 없는 재료예요. 라벨의 유통기한을 입력해 주세요.</div>' : ''; return; }
  const L = life({ ...d, id: 'x' });
  const exp = L.exp ? `→ <b>${fmtD(L.exp)}</b>까지 (${badge({ ...d })})` : L.basis === 'sealed' ? '→ 미개봉: 라벨 유통기한을 입력하세요' : '';
  $('#guideBox').innerHTML = `<div class="guidebox">
    <div class="ranges">${g.o ? `<span>개봉 후 ${rangeText(g.o)} (${LOC[g.ol || g.l]})</span>` : ''}${g.f ? `<span>냉장 ${rangeText(g.f)}</span>` : ''}${g.z ? `<span>냉동 ${rangeText(g.z)}</span>` : ''}${g.r ? `<span>실온 ${rangeText(g.r)}</span>` : ''}</div>
    <div>${esc(g.t || '')}</div>
    ${exp ? `<div style="margin-top:6px">${exp}</div>` : ''}
    ${L.warn ? `<div style="margin-top:4px;color:var(--warn)">⚠ ${esc(L.warn)}</div>` : ''}</div>`;
}
function openItem(id) {
  const it = id ? S.items.find((x) => x.id === id) : null;
  openModal(itemForm(it));
  updateGuideBox();
}

// ─────────────────────────── 요리
VIEWS.cook = () => {
  let list = analyzed();
  const cats = ['전체', ...new Set(window.RECIPES.map((r) => r.cat))];
  if (ui.cookCat !== '전체') list = list.filter((a) => a.r.cat === ui.cookCat);
  const now = list.filter((a) => a.miss.length === 0);
  const near = list.filter((a) => a.miss.length > 0 && a.miss.length <= 2);
  const rest = list.filter((a) => a.miss.length > 2);
  const sec = (t, arr) => arr.length ? `<h2>${t} <span class="muted small">${arr.length}</span></h2><div class="grid">${arr.map(recipeCard).join('')}</div>` : '';
  return `<h1>요리</h1><p class="sub">냉장고·양념 기준으로 자동 정렬 — 남은 요리와 임박 재료를 먼저 쓰는 메뉴가 위로</p>
  <div class="chips">${cats.map((c) => `<button class="chip ${ui.cookCat === c ? 'on' : ''}" data-act="cookcat" data-v="${esc(c)}">${esc(c)}</button>`).join('')}</div>
  ${sec('✅ 지금 바로 가능', now)}${sec('🛒 1~2개만 사면', near)}${sec('그 외', rest)}`;
};

function recipeSheet(id) {
  const r = window.RECIPES.find((x) => x.id === id); if (!r) return '';
  const a = analyze(r);
  const n = ui.serv[id] || r.base, f = n / r.base;
  const yt = `https://www.youtube.com/results?search_query=${encodeURIComponent(r.name + ' 레시피')}`;
  const row = (x) => {
    const st = x.staple ? '<span class="muted">·</span>' : x.ok ? '<span class="have">✓</span>' : x.opt ? '<span class="muted">○</span>' : '<span class="miss">✗</span>';
    const deal = !x.ok && !x.staple ? dealFor(x.k) : null;
    const nt = [x.opt ? '선택' : '', x.note || '', deal ? `🏷 ${deal.store || ''} ${deal.price || ''}${deal.cp?.vs ? ` (${VS[deal.cp.vs][1]}, ${deal.cp.src || '쿠팡'} ${deal.cp.price || '—'})` : ''}` : ''].filter(Boolean).join(' · ');
    return `<tr><td class="s">${st}</td><td>${esc(x.n)}${nt ? `<span class="nt">${esc(nt)}</span>` : ''}</td><td class="q">${esc(amount(x, f))}</td></tr>`;
  };
  return `<div class="sheet"><h1>${esc(r.name)}<button class="x" data-act="close">✕</button></h1>
  <p class="sub">${esc(r.cat)} · 약 ${r.min}분${r.note ? ' ' + esc(r.note) : ''} · 기준 ${r.base}인분</p>
  <div style="display:flex;align-items:center;gap:10px;margin-top:14px">
    <div class="stepper"><button data-act="serv" data-id="${id}" data-d="-1">−</button><b>${n}인분</b><button data-act="serv" data-id="${id}" data-d="1">+</button></div>
    ${a.miss.length ? `<span class="bdg bad">부족: ${a.miss.map((m) => esc(short(m.n))).join(', ')}</span>` : '<span class="bdg ok">재료 다 있음</span>'}
  </div>
  <table class="ing">${a.rows.map(row).join('')}</table>
  <p class="small muted">1큰술 = 15ml(밥숟가락 수북이) · 1작은술 = 5ml · 1컵 = 200ml(종이컵)</p>
  <h2>만드는 법</h2><ol class="steps">${r.steps.map((s) => `<li>${esc(s)}</li>`).join('')}</ol>
  ${r.tips?.length ? `<h2>팁</h2><ul class="tips">${r.tips.map((t) => `<li>${esc(t)}</li>`).join('')}</ul>` : ''}
  <p class="small muted">여러 레시피(만개의레시피·유튜브 인기 영상)의 공통 비율로 정리한 표준 레시피예요. 간은 80%만 넣고 맛보며 추가하세요.</p>
  <div class="btns">
    <a class="btn" href="${yt}" target="_blank" rel="noopener">▶ 유튜브 영상</a>
    <button class="btn pri" data-act="cooked" data-id="${id}">다 만들었어요 → 남은 요리 등록</button>
  </div></div>`;
}

// ─────────────────────────── 할인·제철
// 온라인 비교: cp.src = '쿠팡' | '에누리'(여러 쇼핑몰 최저가), cp.vs = 'mart'(마트가 쌈) | 'similar'(±10% 이내) | 'online'(온라인이 쌈) | 'na'(비교 불가)
const VS = { mart: ['ok', '마트가 쌈'], similar: ['muted', '비슷'], online: ['bad', '온라인이 쌈'], coupang: ['bad', '온라인이 쌈'], na: ['muted', '비교 불가'] };
const VS_ORDER = { mart: 0, similar: 1, na: 2, online: 3, coupang: 3 };
const vsBadge = (d) => d.cp?.vs ? `<span class="bdg ${VS[d.cp.vs][0]}">${VS[d.cp.vs][1]}</span>` : '';
function dealRow(d) {
  const off = d.price && d.was ? Math.round((1 - num(d.price) / num(d.was)) * 100) : 0;
  const period = d.end ? `~${md(parseD(d.end))}` : '';
  const cp = d.cp ? `<div class="small" style="margin-top:3px">${vsBadge(d)} <span class="muted">${esc(d.cp.src || '쿠팡')}</span> <b>${esc(d.cp.price || '—')}</b> <span class="muted">${esc([d.cp.name, d.cp.unit].filter(Boolean).join(' · '))}</span>${d.cp.why ? `<div class="small muted">${esc(d.cp.why)}</div>` : ''}</div>` : '';
  return `<div class="deal"><div class="main" style="flex:1;min-width:0">
      <div class="name" style="font-weight:600">${esc(d.name)}</div>
      <div class="small muted">${[d.store, d.unit, period, d.note].filter(Boolean).map(esc).join(' · ')}${d.auto ? '' : ' · 직접 입력'}</div>${cp}</div>
    <div class="price">${off > 0 ? `<span class="bdg bad">${off}%</span> ` : ''}<b>${esc(d.price || '')}</b>${d.was ? `<s>${esc(d.was)}</s>` : ''}</div>
    ${d.auto ? '' : `<button class="btn sm" data-act="deldeal" data-id="${d.id}">✕</button>`}</div>`;
}
const num = (s) => Number(String(s).replace(/[^\d.]/g, '')) || 0;

VIEWS.market = () => {
  const E = window.EMART_DEALS || {};
  const stores = ['전체', ...(E.stores || ['칠성점', '만촌점'])];
  const deals = allDeals().filter((d) => ui.store === '전체' || !d.store || d.store === '공통' || d.store === ui.store)
    .filter((d) => ui.vs === '전체' || d.cp?.vs === ui.vs);
  const vsCount = (k) => allDeals().filter((d) => d.cp?.vs === k).length;
  const m = ui.month, season = window.SEASON[m] || [];
  return `<h1>할인·제철</h1>
  <p class="sub">${esc(E.source || '마트 전단')} · ${E.updatedAt ? `마지막 갱신 ${esc(E.updatedAt)}` : '자동 갱신 전'}</p>
  ${ui.store !== '전체' && E.branches?.[ui.store] ? `<p class="small muted" style="margin:6px 0 0">기준 지점: ${esc(E.branches[ui.store])}</p>` : ''}
  <div class="chips">${stores.map((s) => `<button class="chip ${ui.store === s ? 'on' : ''}" data-act="store" data-v="${esc(s)}">${esc(s)}</button>`).join('')}</div>
  <div class="chips" style="margin-top:-4px"><span class="small muted" style="align-self:center">온라인 비교</span>${[['전체', '전체'], ['mart', `마트가 쌈 ${vsCount('mart')}`], ['similar', `비슷 ${vsCount('similar')}`], ['online', `온라인이 쌈 ${vsCount('online')}`]].map(([k, l]) => `<button class="chip ${ui.vs === k ? 'on' : ''}" data-act="vs" data-v="${k}">${l}</button>`).join('')}</div>
  ${E.coupangAt ? `<p class="small muted" style="margin:0 0 8px">온라인 가격: ${esc(E.coupangAt)} 에누리 가격비교 기준 — "쿠팡"은 쿠팡 상품, "에누리"는 여러 쇼핑몰 최저가. 배송비·와우 할인·쿠폰 제외, 같은 단위(100g당·개당)로 비교, ±10% 이내는 "비슷".</p>` : ''}
  <div class="card list">${deals.length ? deals.map(dealRow).join('') : '<div class="empty">표시할 행사 상품이 없어요.</div>'}</div>
  <details class="card pad" style="margin-top:10px"><summary style="cursor:pointer;font-weight:600">+ 행사 상품 직접 추가 (전단 보고)</summary>
    <form class="form" id="dealForm">
      <label>상품명<input name="name" required placeholder="예: 국내산 대하 500g"></label>
      <div class="two"><label>행사가<input name="price" placeholder="12,900원"></label><label>정상가<input name="was" placeholder="17,900원"></label></div>
      <div class="two"><label>매장<select name="store"><option>공통</option>${(E.stores || []).map((s) => `<option>${esc(s)}</option>`).join('')}</select></label>
      <label>행사 종료일<input type="date" name="end"></label></div>
      <button class="btn pri" type="submit">추가</button>
    </form></details>

  <h2>🍂 제철 재료</h2>
  <div class="chips">${Array.from({ length: 12 }, (_, i) => i + 1).map((i) => `<button class="chip ${m === i ? 'on' : ''}" data-act="month" data-v="${i}">${i}월</button>`).join('')}</div>
  <div class="season">${season.map((s) => {
    const rs = window.RECIPES.filter((r) => r.ing.some((i) => expandKeys(i.k).includes(norm(s.n)))).map((r) => r.name);
    return `<div class="card"><b>${esc(s.n)} <span class="tag">${esc(s.c)}</span></b>
      ${s.t ? `<div class="small">${esc(s.t)}</div>` : ''}
      ${rs.length ? `<div class="small muted">레시피: ${rs.map(esc).join(', ')}</div>` : ''}</div>`;
  }).join('')}</div>`;
};

// ─────────────────────────── 설정
VIEWS.settings = () => `<h1>설정</h1>
  <div class="card pad form">
    <label>내 이름 (누가 수정했는지 표시)<input id="meName" value="${esc(S.me)}" placeholder="예: 성수"></label>
  </div>
  <h2>동기화</h2>
  <div class="note"><b>${window.fbSync ? '공유 동기화 켜짐' : '로컬 모드'}</b> — ${window.fbSync ? '같은 집 구성원과 실시간 공유됩니다. 같이 쓸 사람은 로그인 후 아래 참여 코드를 입력하면 돼요.' : '지금은 이 기기 브라우저에만 저장돼요. 2인 공유는 Supabase 연결 후 켜집니다. 그 전까지는 아래 백업 파일로 옮길 수 있어요.'}</div>
  ${window.fbSync ? '<div class="card pad" id="fbInfo" style="margin-top:10px"><span class="small muted">계정 확인 중…</span></div>' : ''}
  <h2>백업</h2>
  <div class="btns" style="flex-wrap:wrap">
    <button class="btn" data-act="export">⬇ 백업 파일 저장</button>
    <label class="btn">⬆ 백업 불러오기<input type="file" id="importFile" accept=".json" hidden></label>
    <button class="btn danger" data-act="reset">처음 상태로 초기화</button>
  </div>
  <h2>정보</h2>
  <p class="small muted">보관 기간은 일반 가정 기준의 보수적 범위이며, 제품 라벨·상태(냄새·색·곰팡이)가 항상 우선입니다. D-day는 범위의 최소값 기준.</p>`;

// ─────────────────────────── 모달·토스트
function openModal(html) { const m = $('#modal'); m.innerHTML = html; m.hidden = false; document.body.style.overflow = 'hidden'; }
function closeModal() { const m = $('#modal'); m.hidden = true; m.innerHTML = ''; document.body.style.overflow = ''; }
let toastT;
function toast(msg) { const t = $('#toast'); t.textContent = msg; t.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => (t.hidden = true), 2200); }

// ─────────────────────────── 이벤트
document.addEventListener('click', (e) => {
  const seg = e.target.closest('.seg button');
  if (seg) {
    seg.parentElement.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b === seg));
    const f = $('#itemForm');
    if (f && seg.parentElement.dataset.seg === 'kind' && !f.dataset.id) { // 새 항목: 종류 바꾸면 상태 기본값도
      const st = f.querySelector('[data-seg="state"]');
      st.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.v === 'open'));
    }
    updateGuideBox(); return;
  }
  if (e.target.id === 'modal') { closeModal(); return; }
  const el = e.target.closest('[data-act], [data-view]'); if (!el) return;
  const act = el.dataset.act || 'nav', id = el.dataset.id;
  switch (act) {
    case 'nav': go(el.dataset.view); break;
    case 'filter': ui.filter = el.dataset.v; render(); break;
    case 'cookcat': ui.cookCat = el.dataset.v; render(); break;
    case 'store': ui.store = el.dataset.v; render(); break;
    case 'vs': ui.vs = el.dataset.v; render(); break;
    case 'month': ui.month = +el.dataset.v; render(); break;
    case 'add': openItem(null); break;
    case 'edit': openItem(id); break;
    case 'close': closeModal(); break;
    case 'recipe': openModal(recipeSheet(id)); break;
    case 'serv': {
      const r = window.RECIPES.find((x) => x.id === id);
      ui.serv[id] = Math.max(1, Math.min(12, (ui.serv[id] || r.base) + +el.dataset.d));
      const sc = $('#modal .sheet').scrollTop; openModal(recipeSheet(id)); $('#modal .sheet').scrollTop = sc; break;
    }
    case 'cooked': {
      const r = window.RECIPES.find((x) => x.id === id);
      const it = normalizeItem({ name: r.name, kind: 'leftover', state: 'cooked', loc: 'fridge', qty: '', by: S.me });
      S.items.push(it); save(); closeModal(); render(); openItem(it.id); toast('남은 요리로 등록했어요. 양만 적어주세요');
      break;
    }
    case 'del': {
      const f = $('#itemForm'); const it = S.items.find((x) => x.id === f.dataset.id);
      if (it && confirm(`'${it.name}' 을(를) 목록에서 지울까요?`)) { S.items = S.items.filter((x) => x !== it); save(); closeModal(); render(); toast('지웠어요'); }
      break;
    }
    case 'deldeal': S.deals = S.deals.filter((d) => d.id !== id); save(); render(); break;
    case 'export': {
      const blob = new Blob([JSON.stringify(S, null, 2)], { type: 'application/json' });
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `냉장고뱅크_${fmtD(today())}.json`; a.click();
      break;
    }
    case 'reset':
      if (confirm('모든 재료·직접 입력한 할인 정보를 지우고 처음 상태로 돌릴까요?')) { localStorage.removeItem(DB_KEY); S = freshState(); save(); render(); toast('초기화했어요'); }
      break;
  }
});
document.addEventListener('input', (e) => {
  if (e.target.id === 'q') { ui.q = e.target.value; const pos = e.target.selectionStart; render(); const q = $('#q'); q.focus(); q.setSelectionRange(pos, pos); }
  if (e.target.closest('#itemForm')) updateGuideBox();
  if (e.target.id === 'meName') { S.me = e.target.value.trim(); save(); }
});
document.addEventListener('change', (e) => {
  if (e.target.closest('#itemForm')) updateGuideBox();
  if (e.target.id === 'importFile' && e.target.files[0]) {
    e.target.files[0].text().then((t) => {
      const s = JSON.parse(t); if (!s.items) throw new Error('형식 오류');
      if (confirm(`재료 ${s.items.length}개로 덮어쓸까요?`)) { S = s; save(); render(); toast('불러왔어요'); }
    }).catch(() => toast('백업 파일을 읽지 못했어요'));
  }
});
document.addEventListener('submit', (e) => {
  e.preventDefault();
  const f = e.target;
  if (f.id === 'itemForm') {
    const d = readForm(f); if (!d.name) return;
    const prev = S.items.find((x) => x.id === f.dataset.id);
    const it = normalizeItem({ ...(prev || {}), ...d, by: S.me || '', at: Date.now() });
    if (prev) Object.assign(prev, it); else S.items.push(it);
    save(); closeModal(); render(); toast(prev ? '저장했어요' : '추가했어요');
  }
  if (f.id === 'dealForm') {
    const d = Object.fromEntries(new FormData(f));
    S.deals.push({ id: uid(), ...d, by: S.me }); save(); render(); toast('행사 상품을 추가했어요');
  }
});
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !$('#modal').hidden) closeModal(); });
window.addEventListener('hashchange', () => { const v = location.hash.slice(1); if (v && v !== ui.view && VIEWS[v]) { ui.view = v; render(); } });

// ─────────────────────────── 시작
if (!localStorage.getItem(DB_KEY)) save();
ui.view = VIEWS[location.hash.slice(1)] ? location.hash.slice(1) : 'home';
render();
if ('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('sw.js').catch(() => {});
