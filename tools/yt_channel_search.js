// 구독 요리 채널에서 레시피 영상을 찾는다 (유튜브 채널 내 검색, 로그인 불필요, 0.8초 간격).
// 사용: node tools/yt_channel_search.js jobs.json out.json
//   jobs.json = [["라벨", "검색어", ["제목에 포함될 단어", ...]], ...]
const fs = require('fs');
const [, , jobsFile, outFile = 'yt_results.json'] = process.argv;
const CH = {
  '승우아빠': '@swab85', '아하부장': '@_johncook8725', '은수저': '@수저', '공격수셰프': '@strikerchef1542',
  '마법소년 김셰프': '@마법소년김셰프', '아미요': '@Amiyo', 'JUNTV': '@JUNTV9', '정육왕': '@meatcreator',
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const H = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/130 Safari/537.36', 'Accept-Language': 'ko-KR,ko;q=0.9' };

async function search(handle, q) {
  const t = await fetch(`https://www.youtube.com/${encodeURIComponent(handle).replace('%40', '@')}/search?query=${encodeURIComponent(q)}`, { headers: H }).then((r) => r.text());
  const m = t.match(/var ytInitialData = (\{.*?\});<\/script>/s);
  if (!m) return null;
  const vids = [];
  JSON.stringify(JSON.parse(m[1]), (k, v) => {
    if (k === 'videoRenderer' && v && v.videoId) vids.push({ id: v.videoId, title: (v.title?.runs || []).map((r) => r.text).join(''), views: v.viewCountText?.simpleText || '' });
    return v;
  });
  return vids;
}

(async () => {
  const jobs = JSON.parse(fs.readFileSync(jobsFile, 'utf8'));
  const chans = process.env.CHANNELS ? process.env.CHANNELS.split(',') : Object.keys(CH);
  const out = [];
  for (const [label, q, must] of jobs) {
    for (const name of chans) {
      try {
        const v = await search(CH[name], q);
        if (v === null) { console.log(label, name, 'NO DATA'); continue; }
        const hit = v.filter((x) => must.some((w) => x.title.replace(/\s/g, '').includes(w))).slice(0, 2);
        for (const x of hit) out.push({ label, channel: name, ...x });
        console.log(label, name, hit.length);
      } catch (e) { console.log(label, name, 'ERR', e.message); }
      await sleep(800);
    }
  }
  fs.writeFileSync(outFile, JSON.stringify(out, null, 1));
})();
