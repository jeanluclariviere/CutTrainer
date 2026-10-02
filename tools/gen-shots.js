#!/usr/bin/env node
// Cut Trainer: build the shipped shot library (shots.bin) from the game's own code.
// It loads index.html in a headless DOM (jsdom), so the shots are dealt, rounded and re-checked by exactly the code
// the game runs, then spreads the work over every CPU core.
//
//   node tools/gen-shots.js [--per 20000] [--per-basic 5000] [--workers N] [--out shots.bin]
//   --per: shots for each zone grade (B+ to S+), --per-basic: for each grade without zones (F to B)
//
// Re-run it whenever the physics, the strokes or the zone rules change: the game only uses a library whose version
// matches its own, and builds shots on the device until then.
'use strict';
const fs = require('fs'), path = require('path'), os = require('os');
const { Worker, isMainThread, parentPort, workerData } = require('worker_threads');
const ROOT = path.resolve(__dirname, '..');

function loadGame(seed){
  const { JSDOM, VirtualConsole } = require('jsdom');
  let html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  // inline the local scripts (no network in the headless page); three.js isn't needed: no WebGL here
  html = html.replace(/<script src="([^"]+)"><\/script>/g, (m, src)=>{
    if(/three/.test(src)) return '';
    const f = path.join(ROOT, src.split('?')[0]);
    return fs.existsSync(f) ? `<script>${fs.readFileSync(f, 'utf8')}</script>` : '';
  });
  const vc = new VirtualConsole();   // keep jsdom's "not implemented" noise out of the output
  vc.on('jsdomError', ()=>{});
  const dom = new JSDOM(html, {url: 'https://cuttrainer.local/#test', runScripts: 'dangerously', pretendToBeVisual: true, virtualConsole: vc,
    beforeParse(w){
      w.matchMedia = () => ({matches: false, addEventListener(){}, removeEventListener(){}, addListener(){}, removeListener(){}});
      w.fetch = () => Promise.reject(new Error('offline'));
      w.HTMLCanvasElement.prototype.getContext = () => null;
      w.scrollTo = () => {};
      let x = seed >>> 0 || 1; w.Math.random = () => ((x = (x*1664525 + 1013904223) >>> 0) / 4294967296);   // each worker its own stream
      w.localStorage.setItem('cutreader-settings', JSON.stringify({sv: 2, sv3: 1, sv4: 1, sv5: 1, tut: 1, stanceSet: 1, tutSeen: {}, sound: '0', task: 'shoot', table: '9'}));
      w.localStorage.setItem('cutreader-stats', JSON.stringify({n: 0, c: 0, made: 0, streak: 0, best: 0, log: [], shoot: {g: 15, best: 15, pts: 0, v: 1}, sessions: []}));
    }});
  const w = dom.window;
  if(!w.__lib) throw new Error('the game did not expose its library hooks (window.__lib)');
  w.__lib.setTable('9');
  return w;
}

if(!isMainThread){
  // a worker: make records for the steps it's given, and send them back as they come
  const w = loadGame(workerData.seed), L = w.__lib;
  parentPort.postMessage({ver: L.libVer()});
  const want = workerData.want;   // {step: count}
  const steps = Object.keys(want).map(Number);
  const done = Object.fromEntries(steps.map(k=>[k, 0]));
  while(steps.some(k=>done[k] < want[k])){
    for(const k of steps){
      if(done[k] >= want[k]) continue;
      if(L.curTable() !== L.tableFor(k)) L.setTable(L.tableFor(k));   // each grade's shots on its own table
      const r = L.makeRec(k);
      if(r){ const out = new Uint8Array(L.REC); L.encodeRec(r, out, 0); done[k]++; parentPort.postMessage({step: k, rec: out}); }
      else parentPort.postMessage({step: k, miss: 1});
    }
  }
  parentPort.postMessage({finished: true});
  return;
}

// ---------- the main thread ----------
const arg = (n, d) => { const i = process.argv.indexOf('--' + n); return i > 0 ? process.argv[i + 1] : d; };
const PER = +arg('per', 20000), PER_BASIC = +arg('per-basic', 5000), N = Math.max(1, +arg('workers', Math.max(1, os.cpus().length - 1))), OUT = path.resolve(ROOT, arg('out', 'shots.bin'));
const probe = loadGame(1).__lib, STEPS = probe.LIB_STEPS, VER = probe.libVer(), REC = probe.REC;
const target = k => probe.ZONE_STEPS.includes(k) ? PER : PER_BASIC;
console.log(`shots: ${PER} per zone grade, ${PER_BASIC} per other grade (${STEPS.length} grades), ${N} workers\nversion: ${VER}`);

const recs = Object.fromEntries(STEPS.map(k=>[k, []])), miss = Object.fromEntries(STEPS.map(k=>[k, 0]));
const t0 = Date.now();
let live = N;
function report(final){
  const got = STEPS.reduce((t, k)=>t + recs[k].length, 0), all = STEPS.reduce((t, k)=>t + target(k), 0), sec = (Date.now() - t0)/1000, rate = got/Math.max(1, sec);
  const eta = rate > 0 ? Math.round((all - got)/rate) : 0;
  process.stdout.write(`\r${got}/${all} shots · ${rate.toFixed(1)}/s · ${STEPS.map(k=>`${k}:${recs[k].length}`).join(' ')}${final ? '' : ` · about ${Math.floor(eta/60)}m${eta%60}s left`}   `);
}
const timer = setInterval(report, 2000);
for(let i = 0; i < N; i++){
  // each worker takes an even share of every step
  const want = Object.fromEntries(STEPS.map(k=>[k, Math.ceil(target(k)/N)]));
  const wk = new Worker(__filename, {workerData: {seed: 1000 + i*7919, want}});
  wk.on('message', m=>{
    if(m.ver && m.ver !== VER){ console.error('\nversion mismatch between workers'); process.exit(1); }
    if(m.rec && recs[m.step].length < target(m.step)) recs[m.step].push(Buffer.from(m.rec));
    if(m.miss) miss[m.step]++;
    if(m.finished && --live === 0) finish();
  });
  wk.on('error', e=>{ console.error('\nworker failed:', e); process.exit(1); });
}
function finish(){
  clearInterval(timer); report(true);
  const ver = Buffer.from(VER, 'utf8'), parts = [Buffer.from('CTS2'), Buffer.from([ver.length & 255, ver.length >> 8]), ver, Buffer.from([STEPS.length])];
  for(const k of STEPS){
    const n = recs[k].length, h = Buffer.alloc(6); h[0] = k; h[1] = +probe.tableFor(k); h.writeUInt32LE(n, 2);
    parts.push(h, ...recs[k]);
  }
  const buf = Buffer.concat(parts);
  fs.writeFileSync(OUT, buf);
  console.log(`\nwrote ${path.relative(ROOT, OUT)}: ${(buf.length/1024).toFixed(0)} KB, ${STEPS.map(k=>`${k}:${recs[k].length} (${miss[k]} rejected)`).join(', ')}, ${Math.round((Date.now() - t0)/1000)} s`);
  process.exit(0);
}
