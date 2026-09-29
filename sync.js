/* 냉장고뱅크 공유 동기화 (Supabase) — config.js 에 supabaseUrl / supabaseAnonKey 가 있을 때만 켜진다.
   로그인: 이메일 매직링크. 집(household) 단위로 재료·직접 입력 할인을 공유, 실시간 반영.
   앱은 그대로 localStorage 에 먼저 저장하고(오프라인 OK), save() 때마다 바뀐 기록만 올린다. */
(() => {
  const C = window.FB_CONFIG || {};
  if (!C.supabaseUrl || !C.supabaseAnonKey) return;

  const HK = 'fridgebank.household';
  let sb, hid = localStorage.getItem(HK), synced = new Map(), ready = false, starting = false, chain = Promise.resolve();

  const api = window.fbSync = { status: '연결 중…', push: () => (chain = chain.then(push)), login: loginSheet, fillInfo, logout };
  const setStatus = (t) => { api.status = t; const el = document.getElementById('sync'); if (el) el.textContent = t; };

  // supabase-js 는 설정됐을 때만 불러온다
  const s = document.createElement('script');
  s.src = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2';
  s.onload = init;
  s.onerror = () => setStatus('오프라인 (로컬 저장)');
  document.head.appendChild(s);

  function init() {
    sb = window.supabase.createClient(C.supabaseUrl, C.supabaseAnonKey);
    sb.auth.onAuthStateChange((ev) => { if (ev === 'SIGNED_IN' && !ready) start(); });
    start();
  }

  async function start() {
    if (starting || ready) return;
    starting = true;
    try {
      const { data: { session } } = await sb.auth.getSession();
      if (!session) { setStatus('로그인 필요'); loginSheet(); return; }
      if (hid) {
        const { data } = await sb.from('households').select('id').eq('id', hid);
        if (!data?.length) hid = null; // 나간 집이거나 다른 계정
      }
      if (!hid) {
        const { data: m } = await sb.from('members').select('household_id').eq('user_id', session.user.id).limit(1);
        if (m?.length) { hid = m[0].household_id; localStorage.setItem(HK, hid); }
        else { setStatus('집 선택 필요'); householdSheet(); return; }
      }
      await pull();
      subscribe();
      setStatus('공유 동기화');
    } catch (e) {
      setStatus('동기화 오류'); toast('동기화 연결 실패: ' + e.message);
    } finally { starting = false; }
  }

  // ── 기록 ↔ 앱 상태
  const snapshot = () => {
    const m = new Map();
    for (const x of S.items) m.set(x.id, ['item', JSON.stringify(x)]);
    for (const x of S.deals) { if (!x.id) x.id = uid(); m.set(x.id, ['deal', JSON.stringify(x)]); }
    return m;
  };
  const same = (a, b) => a && b && a[0] === b[0] && a[1] === b[1];
  const keepLocal = () => { try { localStorage.setItem(DB_KEY, JSON.stringify(S)); } catch (e) {} };

  async function pull() {
    const { data, error } = await sb.from('fb_records').select('id,kind,data').eq('household_id', hid);
    if (error) throw error;
    if (!data.length) { ready = true; synced = new Map(); await push(); return; } // 새 집: 이 기기 내용을 올림
    S.items = data.filter((r) => r.kind === 'item').map((r) => r.data);
    S.deals = data.filter((r) => r.kind === 'deal').map((r) => r.data);
    keepLocal(); synced = snapshot(); ready = true; render();
  }

  async function push() {
    if (!ready) return;
    const prev = synced, now = snapshot(), up = [], del = [];
    for (const [id, v] of now) if (!same(prev.get(id), v)) up.push({ id, household_id: hid, kind: v[0], data: JSON.parse(v[1]), updated_at: new Date().toISOString() });
    for (const id of prev.keys()) if (!now.has(id)) del.push(id);
    if (!up.length && !del.length) return;
    synced = now; setStatus('저장 중…');
    try {
      if (up.length) { const { error } = await sb.from('fb_records').upsert(up); if (error) throw error; }
      if (del.length) { const { error } = await sb.from('fb_records').delete().in('id', del); if (error) throw error; }
      setStatus('공유 동기화');
    } catch (e) {
      synced = prev; setStatus('동기화 오류'); toast('저장은 이 기기에만 됐어요: ' + e.message);
    }
  }

  function subscribe() {
    const apply = (p) => {
      if (p.eventType === 'DELETE') {
        const id = p.old?.id; if (!id) return;
        S.items = S.items.filter((x) => x.id !== id); S.deals = S.deals.filter((x) => x.id !== id); synced.delete(id);
      } else {
        const r = p.new; if (!r || r.household_id !== hid) return;
        const list = r.kind === 'item' ? S.items : S.deals, i = list.findIndex((x) => x.id === r.id);
        if (i >= 0) list[i] = r.data; else list.push(r.data);
        synced.set(r.id, [r.kind, JSON.stringify(r.data)]);
      }
      keepLocal(); render();
    };
    sb.channel('fb-' + hid)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'fb_records', filter: `household_id=eq.${hid}` }, apply)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'fb_records', filter: `household_id=eq.${hid}` }, apply)
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'fb_records' }, apply)
      .subscribe();
  }

  // ── 화면
  function loginSheet() {
    openModal(`<div class="sheet"><h1>로그인<button class="x" data-act="close">✕</button></h1>
      <p class="sub">이메일로 받은 링크를 누르면 로그인돼요. 비밀번호는 없어요.</p>
      <form class="form" id="fbLogin"><label>이메일<input type="email" name="email" required autocomplete="email"></label>
      <button class="btn pri" type="submit">로그인 링크 받기</button></form>
      <p class="small muted">로그인하지 않으면 이 기기에만 저장돼요.</p></div>`);
  }
  function householdSheet() {
    openModal(`<div class="sheet"><h1>우리 집 연결</h1>
      <form class="form" id="fbHouse">
        <label>내 이름 (누가 수정했는지 표시)<input name="member" value="${esc(S.me || '')}" required></label>
        <div class="card pad"><b>처음 쓰는 사람</b><p class="small muted">새 집을 만들고, 나오는 참여 코드를 같이 쓸 사람에게 알려주세요. 이 기기의 재료 목록이 그대로 올라갑니다.</p>
          <button class="btn pri" name="create" value="1" type="submit">새 집 만들기</button></div>
        <div class="card pad"><b>초대받은 사람</b>
          <label>참여 코드<input name="code" placeholder="8자리" autocapitalize="off"></label>
          <button class="btn" name="join" value="1" type="submit" style="margin-top:8px">참여하기</button></div>
      </form></div>`);
  }
  async function fillInfo() {
    const el = document.getElementById('fbInfo'); if (!el || !sb) return;
    const { data: { session } } = await sb.auth.getSession();
    if (!session) { el.innerHTML = `<button class="btn" data-act="fb-login">로그인</button>`; return; }
    let code = '';
    if (hid) { const { data } = await sb.from('households').select('name,join_code').eq('id', hid); code = data?.[0] ? `${esc(data[0].name)} · 참여 코드 <b style="font-size:17px;letter-spacing:.05em">${esc(data[0].join_code)}</b>` : ''; }
    el.innerHTML = `<p class="small">${esc(session.user.email)}${code ? '<br>' + code : ''}</p><button class="btn danger" data-act="fb-logout">로그아웃</button>`;
  }
  async function logout() { await sb.auth.signOut(); localStorage.removeItem(HK); location.reload(); }

  document.addEventListener('click', (e) => {
    const a = e.target.closest('[data-act]')?.dataset.act;
    if (a === 'fb-login') loginSheet();
    if (a === 'fb-logout' && confirm('로그아웃할까요? (이 기기의 목록은 남아 있어요)')) logout();
  });
  document.addEventListener('submit', async (e) => {
    const f = e.target;
    if (f.id === 'fbLogin') {
      const { error } = await sb.auth.signInWithOtp({ email: f.email.value.trim(), options: { emailRedirectTo: location.origin + location.pathname } });
      if (error) toast('메일 발송 실패: ' + error.message); else { closeModal(); toast('메일함에서 로그인 링크를 눌러주세요'); }
    }
    if (f.id === 'fbHouse') {
      const member = f.member.value.trim(); S.me = member;
      const join = e.submitter?.name === 'join';
      const { data, error } = join
        ? await sb.rpc('join_household', { p_code: f.code.value, p_member: member })
        : await sb.rpc('create_household', { p_name: C.household || '우리집', p_member: member });
      if (error) { toast(error.message); return; }
      hid = data; localStorage.setItem(HK, hid); closeModal();
      await pull(); subscribe(); setStatus('공유 동기화');
      if (!join) { go('settings'); toast('참여 코드를 같이 쓸 사람에게 알려주세요'); }
    }
  });
})();
