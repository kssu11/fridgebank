// 에누리 가격비교 검색을 천천히(4초 간격) 돌려 조회어별 에누리 최저가 목록 + 쿠팡 상품(광고 블록)을 모은다.
// 사용: node tools/enuri_fetch.js queries.json out.json    (queries.json = ["국내산 다진마늘", ...])
// 403/429 를 받으면 즉시 멈춘다 — 재시도·우회하지 않는다.
const fs = require('fs');
const [, , qFile, outFile = 'enuri_results.json'] = process.argv;
const Q = JSON.parse(fs.readFileSync(qFile, 'utf8'));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const un = (s) => s.replace(/\\"/g, '"').replace(/\\u0026/g, '&').replace(/\\\\/g, '\\');

(async () => {
  const out = {};
  for (const q of Q) {
    try {
      const res = await fetch('https://price.enuri.com/search?keyword=' + encodeURIComponent(q), { headers: { 'User-Agent': 'Mozilla/5.0' } });
      if (res.status !== 200) {
        out[q] = { error: res.status }; console.log(q, 'HTTP', res.status);
        if (res.status === 403 || res.status === 429) { console.log('차단 응답 — 중단'); break; }
        continue;
      }
      const t = un(await res.text());
      // schema.org ItemList: 상품명·최저가·판매 쇼핑몰 수
      const enuri = [];
      for (const m of t.matchAll(/"offers":\{[^{}]*"lowPrice":(\d+),"offerCount":(\d+)[^{}]*\}[^{}]*?"name":"([^"]+)"/g)) enuri.push({ name: m[3], price: +m[1], malls: +m[2] });
      // 쿠팡 상품 블록 (mallName: coupang)
      const coupang = [], seen = new Set();
      for (const s of t.match(/\{[^{}]*"mallName":"coupang"[^{}]*\}/g) || []) {
        try { const o = JSON.parse(s); if (seen.has(o.productName)) continue; seen.add(o.productName); coupang.push({ name: o.productName, price: o.price, rocket: o.isRocketDelivery }); } catch (e) {}
      }
      out[q] = { enuri: enuri.slice(0, 12), coupang };
      console.log(q, '에누리', enuri.length, '쿠팡', coupang.length);
    } catch (e) { out[q] = { error: String(e) }; console.log(q, 'ERR', e.message); }
    await sleep(4000);
  }
  fs.writeFileSync(outFile, JSON.stringify(out, null, 1));
})();
