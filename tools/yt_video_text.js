// 유튜브 영상의 설명란 + 한국어 자막을 가져온다 (레시피 분량 확인용, 1초 간격).
// 사용: node tools/yt_video_text.js id1,id2,... outDir
const fs = require('fs');
const [, , ids, outDir = '.'] = process.argv;
const H = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/130 Safari/537.36', 'Accept-Language': 'ko-KR,ko;q=0.9' };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  for (const id of ids.split(',')) {
    try {
      const t = await fetch('https://www.youtube.com/watch?v=' + id, { headers: H }).then((r) => r.text());
      const m = t.match(/var ytInitialPlayerResponse = (\{.*?\});(?:var|<\/script>)/s);
      if (!m) { console.log(id, 'NO PLAYER'); continue; }
      const p = JSON.parse(m[1]);
      const v = p.videoDetails || {};
      let caps = '';
      const tracks = p.captions?.playerCaptionsTracklistRenderer?.captionTracks || [];
      const tr = tracks.find((x) => x.languageCode === 'ko' && !x.kind) || tracks.find((x) => x.languageCode === 'ko');
      if (tr) {
        const j = await fetch(tr.baseUrl + '&fmt=json3', { headers: H }).then((r) => r.text());
        try { caps = (JSON.parse(j).events || []).map((e) => (e.segs || []).map((s) => s.utf8).join('')).join(' ').replace(/\s+/g, ' '); } catch (e) { caps = ''; }
      }
      const txt = `# ${v.title}\n채널: ${v.author}\n길이: ${Math.round((+v.lengthSeconds || 0) / 60)}분\n자막: ${tr ? (tr.kind === 'asr' ? '자동' : '수동') + ' ' + caps.length + '자' : '없음'}\n\n## 설명\n${v.shortDescription || ''}\n\n## 자막\n${caps}\n`;
      fs.writeFileSync(`${outDir}/${id}.txt`, txt);
      console.log(id, (v.title || '').slice(0, 40), '| 설명', (v.shortDescription || '').length, '| 자막', tr ? caps.length : 'none');
    } catch (e) { console.log(id, 'ERR', e.message); }
    await sleep(1000);
  }
})();
