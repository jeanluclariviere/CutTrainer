#!/usr/bin/env node
// Keep only the stored zone shots that pass the current zone rules (zoneSpotOk), and restamp shots.bin to this version.
'use strict';
const fs = require('fs'), path = require('path'), ROOT = path.resolve(__dirname, '..');
const { JSDOM, VirtualConsole } = require('jsdom');
let html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8').replace(/<script src="([^"]+)"><\/script>/g, (m, src)=>/three/.test(src) ? '' : `<script>${fs.readFileSync(path.join(ROOT, src), 'utf8')}</script>`);
const vc = new VirtualConsole(); vc.on('jsdomError', ()=>{});
const L = new JSDOM(html, {url: 'https://x.local/#test', runScripts: 'dangerously', pretendToBeVisual: true, virtualConsole: vc, beforeParse(w){
  w.matchMedia = () => ({matches: false, addEventListener(){}, removeEventListener(){}}); w.fetch = () => Promise.reject(); w.HTMLCanvasElement.prototype.getContext = () => null; w.scrollTo = () => {};
  w.localStorage.setItem('cutreader-settings', JSON.stringify({sv: 2, sv3: 1, sv4: 1, sv5: 1, tut: 1, stanceSet: 1, tutSeen: {}, sound: '0', task: 'shoot'}));
  w.localStorage.setItem('cutreader-stats', JSON.stringify({log: [], shoot: {g: 15, best: 15, pts: 0, v: 1}, sessions: []}));
}}).window.__lib;
const file = path.join(ROOT, 'shots.bin'), b = fs.readFileSync(file), REC = L.REC;
const vl = b[4] | (b[5] << 8); let o = 6 + vl; const n = b[o++];
const ver = Buffer.from(L.libVer(), 'utf8'), parts = [Buffer.from('CTS2'), Buffer.from([ver.length & 255, ver.length >> 8]), ver, Buffer.from([n])];
for(let i = 0; i < n; i++){
  const st = b[o], table = b[o+1], cnt = b.readUInt32LE(o + 2); o += 6;
  const keep = [];
  L.setTable(String(table));
  for(let j = 0; j < cnt; j++){
    const rec = b.subarray(o + j*REC, o + (j + 1)*REC);
    if(!L.isZoneStep(st)){ keep.push(rec); continue; }
    const s = L.shotOf(L.decodeRec(rec, 0), st, false);
    if(L.zoneSpotOk(s, s.zone.c)) keep.push(Buffer.from(rec));
  }
  o += cnt*REC;
  const h = Buffer.alloc(6); h[0] = st; h[1] = table; h.writeUInt32LE(keep.length, 2); parts.push(h, ...keep);
  console.log(`grade ${st}: kept ${keep.length} of ${cnt}`);
}
fs.writeFileSync(file, Buffer.concat(parts)); console.log('restamped to', L.libVer());
