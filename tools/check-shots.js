#!/usr/bin/env node
// Check shots.bin: does this version of the game accept it, and does every grade deal from it?
//   node tools/check-shots.js [--restamp]   (--restamp rewrites the file's version to the game's current one)
'use strict';
const fs = require('fs'), path = require('path'), ROOT = path.resolve(__dirname, '..');
const { JSDOM, VirtualConsole } = require('jsdom');
let html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8').replace(/<script src="([^"]+)"><\/script>/g, (m, src)=>/three/.test(src) ? '' : `<script>${fs.readFileSync(path.join(ROOT, src), 'utf8')}</script>`);
const vc = new VirtualConsole(); vc.on('jsdomError', ()=>{});
const w = new JSDOM(html, {url: 'https://cuttrainer.local/#test', runScripts: 'dangerously', pretendToBeVisual: true, virtualConsole: vc, beforeParse(w){
  w.matchMedia = () => ({matches: false, addEventListener(){}, removeEventListener(){}}); w.fetch = () => Promise.reject(new Error('offline'));
  w.HTMLCanvasElement.prototype.getContext = () => null; w.scrollTo = () => {};
  w.localStorage.setItem('cutreader-settings', JSON.stringify({sv: 2, sv3: 1, sv4: 1, sv5: 1, tut: 1, stanceSet: 1, tutSeen: {}, sound: '0', task: 'shoot'}));
  w.localStorage.setItem('cutreader-stats', JSON.stringify({log: [], shoot: {g: 15, best: 15, pts: 0, v: 1}, sessions: []}));
}}).window, L = w.__lib;
const file = path.join(ROOT, 'shots.bin');
let buf = fs.readFileSync(file);
if(process.argv.includes('--restamp')){
  const vl = buf[4] | (buf[5] << 8), ver = Buffer.from(L.libVer(), 'utf8');
  buf = Buffer.concat([buf.subarray(0, 4), Buffer.from([ver.length & 255, ver.length >> 8]), ver, buf.subarray(6 + vl)]);
  fs.writeFileSync(file, buf); console.log('restamped to', L.libVer());
}
const S = L.parseShipped(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.length));
L.setShipped(S);
console.log('file version', S.ver, '· game', L.libVer(), '·', L.shippedOk() ? 'accepted' : 'REJECTED');
let bad = 0;
for(const k of L.LIB_STEPS){
  L.setTable(L.tableFor(k));
  let ok = 0, zones = 0, n = 40;
  for(let i = 0; i < n; i++){ const s = L.fromLibrary(k, Math.floor(Math.random()*5)); if(s){ ok++; if(s.zone) zones++; } }
  const wantZone = L.isZoneStep(k);
  if(ok < n*.8 || (wantZone && zones !== ok) || (!wantZone && zones)) bad++;
  console.log(`grade ${k} (${L.tableFor(k)} ft): ${S.steps[k] ? S.steps[k].cnt : 0} stored · dealt ${ok}/${n}${wantZone ? ` · with zones ${zones}` : ''}`);
}
console.log(bad ? `${bad} grade(s) look wrong` : 'all grades deal from the library');
process.exit(bad ? 1 : 0);
