// 유튜브 "스크립트 표시" 패널과 같은 경로(youtubei get_transcript)로 대본을 가져온다. 1.5초 간격.
// 사용: node tools/yt_transcript.js id1,id2,... outDir   → outDir/<id>.tr.txt
const fs = require('fs');
const [, , ids, outDir = '.'] = process.argv;
const H = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/130 Safari/537.36', 'Accept-Language': 'ko-KR,ko;q=0.9' };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  for (const id of ids.split(',')) {
    try {
      const page = await fetch('https://www.youtube.com/watch?v=' + id + '&hl=ko', { headers: H }).then((r) => r.text());
      const key = (page.match(/"INNERTUBE_API_KEY":"([^"]+)"/) || [])[1];
      const ctx = JSON.parse((page.match(/"INNERTUBE_CONTEXT":(\{.*?\}),"INNERTUBE_CONTEXT_CLIENT_NAME"/s) || [, 'null'])[1]);
      const params = (page.match(/"getTranscriptEndpoint":\{"params":"([^"]+)"/) || [])[1];
      if (!key || !ctx || !params) { console.log(id, 'no transcript endpoint', !!key, !!ctx, !!params); continue; }
      const r = await fetch('https://www.youtube.com/youtubei/v1/get_transcript?key=' + key, {
        method: 'POST', headers: { ...H, 'Content-Type': 'application/json' }, body: JSON.stringify({ context: ctx, params }),
      });
      const j = await r.json();
      const segs = [];
      JSON.stringify(j, (k, v) => { if (k === 'transcriptSegmentRenderer' && v) segs.push((v.snippet?.runs || []).map((x) => x.text).join('')); return v; });
      const txt = segs.join(' ').replace(/\s+/g, ' ');
      fs.writeFileSync(`${outDir}/${id}.tr.txt`, txt);
      console.log(id, 'HTTP', r.status, 'segments', segs.length, 'chars', txt.length);
    } catch (e) { console.log(id, 'ERR', e.message); }
    await sleep(1500);
  }
})();
