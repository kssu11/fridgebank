/* 처음 실행 시 들어가는 재료 (2026-09-28 입력). 날짜는 모두 "추정" — 앱에서 실제 날짜로 고쳐주세요. */
window.SEED = (() => {
  const d = '2026-09-28';
  const P = (name, x = {}) => ({ name, kind: 'pantry', state: 'open', date: d, est: true, ...x });
  const F = (name, qty, x = {}) => ({ name, qty, kind: 'food', state: 'fresh', date: d, est: true, ...x });
  return [
    // 남은 요리
    { name: '소고기무국', qty: '3~4인분', kind: 'leftover', state: 'cooked', loc: 'fridge', date: d, est: true },
    { name: '소고기 불고기', qty: '2~3인분', kind: 'leftover', state: 'cooked', loc: 'fridge', date: d, est: true, note: '익힌 불고기로 가정. 생(양념만 한) 상태라면 1~2일 안에 조리.' },
    // 식재료
    F('달걀', ''),
    F('양파', '1kg망 중 3~4개 사용'),
    F('대파', '750g 중 3~4대 사용'),
    F('당근', '3/4개', { note: '자른 당근 — 단면 랩 밀착' }),
    F('햇감자', '1kg'),
    F('무', '2/3개', { note: '자른 무 — 단면 랩 밀착' }),
    // 양념·건식품
    P('치킨스톡'), P('미림'), P('맛술'), P('연두'),
    P('굵은 천일염'), P('순후추'), P('후추 그라인더'),
    P('올리브유'), P('카놀라유'), P('참기름'), P('들기름'),
    P('고추장'), P('올리고당'), P('자일로스 설탕'),
    P('양조간장'), P('국간장'), P('굵은 고춧가루'),
    P('루모 스파게티니', { qty: '300g' }),
    P('부침가루', { qty: '450g', state: 'sealed' }),
    P('갈릭디핑소스', { qty: '1kg 중 절반 남음' }),
  ];
})();
