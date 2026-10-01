// Cut Trainer: background music. Three small loops played live with Web Audio (no audio files):
// Parlor (swing jazz, ii–V–I), Smoke (slow lo-fi), Felt (bossa nova). Each 8-bar loop repeats exactly, melody included.
(function(root){
'use strict';
let playTok = 0, ctx = null, out = null, timer = 0, track = null, nextT = 0, step = 0, noise = null, vol = 0.5;
const mtof = m => 440*Math.pow(2, (m - 69)/12);
function rng(seed){ return () => (seed = (seed*16807) % 2147483647) / 2147483647; }

function ensure(){
  if(ctx) return true;
  const AC = root.AudioContext || root.webkitAudioContext; if(!AC) return false;
  ctx = new AC();
  out = ctx.createGain(); out.gain.value = 0;
  const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 5200;   // a little warm and dull, like a radio in the corner
  out.connect(lp); lp.connect(ctx.destination);
  noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
  const d = noise.getChannelData(0); for(let i = 0; i < d.length; i++) d[i] = Math.random()*2 - 1;
  return true;
}

// ---------- instruments ----------
function epiano(t, m, dur, v){   // soft electric piano: a sine with a bell-ish overtone that fades fast, slow tremolo
  const f = mtof(m), g = ctx.createGain(), o1 = ctx.createOscillator(), o2 = ctx.createOscillator(), g2 = ctx.createGain();
  o1.type = 'sine'; o1.frequency.value = f; o2.type = 'sine'; o2.frequency.value = f*4.01;
  g2.gain.setValueAtTime(.18*v, t); g2.gain.exponentialRampToValueAtTime(.0005, t + .35);
  g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(.16*v, t + .008); g.gain.exponentialRampToValueAtTime(.06*v, t + .5);
  g.gain.exponentialRampToValueAtTime(.0005, t + dur + .4);
  const trem = ctx.createOscillator(), tg = ctx.createGain(); trem.frequency.value = 4.5; tg.gain.value = .015*v; trem.connect(tg); tg.connect(g.gain);
  o1.connect(g); o2.connect(g2); g2.connect(g); g.connect(out);
  [o1, o2, trem].forEach(o=>{ o.start(t); o.stop(t + dur + .5); });
}
function pluck(t, m, dur, v){    // nylon-ish guitar: a filtered triangle that dies quickly
  const o = ctx.createOscillator(), f = ctx.createBiquadFilter(), g = ctx.createGain();
  o.type = 'triangle'; o.frequency.value = mtof(m); f.type = 'lowpass'; f.frequency.setValueAtTime(2600, t); f.frequency.exponentialRampToValueAtTime(700, t + .25);
  g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(.12*v, t + .004); g.gain.exponentialRampToValueAtTime(.0005, t + Math.min(dur, .9));
  o.connect(f); f.connect(g); g.connect(out); o.start(t); o.stop(t + 1);
}
function bass(t, m, dur, v){     // upright-ish bass: a round tone with a soft thump
  const o = ctx.createOscillator(), f = ctx.createBiquadFilter(), g = ctx.createGain();
  o.type = 'triangle'; o.frequency.value = mtof(m); f.type = 'lowpass'; f.frequency.value = 520;
  g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(.42*v, t + .012); g.gain.exponentialRampToValueAtTime(.12*v, t + .25);
  g.gain.exponentialRampToValueAtTime(.0005, t + dur);
  o.connect(f); f.connect(g); g.connect(out); o.start(t); o.stop(t + dur + .05);
}
function hiss(t, dur, freq, q, v, type){   // brushes, hats, snare: shaped noise
  const s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
  s.buffer = noise; f.type = type || 'bandpass'; f.frequency.value = freq; f.Q.value = q;
  g.gain.setValueAtTime(.0005, t); g.gain.exponentialRampToValueAtTime(v, t + Math.min(.03, dur*.3)); g.gain.exponentialRampToValueAtTime(.0005, t + dur);
  s.connect(f); f.connect(g); g.connect(out); s.start(t, Math.random()*.5); s.stop(t + dur + .02);
}
function kick(t, v){
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.frequency.setValueAtTime(95, t); o.frequency.exponentialRampToValueAtTime(48, t + .12);
  g.gain.setValueAtTime(.5*v, t); g.gain.exponentialRampToValueAtTime(.0005, t + .28);
  o.connect(g); g.connect(out); o.start(t); o.stop(t + .3);
}
function rim(t, v){
  const o = ctx.createOscillator(), g = ctx.createGain(); o.type = 'square'; o.frequency.value = 1750;
  g.gain.setValueAtTime(.06*v, t); g.gain.exponentialRampToValueAtTime(.0005, t + .04);
  o.connect(g); g.connect(out); o.start(t); o.stop(t + .05);
}

// ---------- the tracks: 8 bars of 4 beats, scheduled an eighth note at a time ----------
// chords: [bass root, [voicing]] in MIDI
const TRACKS = {
  parlor: {name:'Parlor', bpm:84, swing:.62, seed:7, scale:[60,62,64,67,69,72,74,76],
    chords:[[38,[53,57,60,64]],[43,[53,57,59,64]],[36,[52,55,59,62]],[45,[55,58,61,64]],[38,[53,57,60,64]],[43,[53,57,59,65]],[36,[52,55,59,62]],[36,[52,55,57,62]]],
    play(t, bar, e, C, R, d8){
      const [root, v] = C;
      if(e === 0) v.forEach((m, i)=>epiano(t + i*.012, m, d8*3, .8));
      if(e === 3 && R() < .7) v.forEach(m=>epiano(t, m, d8*.9, .55));
      if(e % 2 === 0){ const walk = [root, root + 7, root + 12, root + (R() < .5 ? 10 : 4)]; bass(t, walk[e/2], d8*1.9, .85); }
      hiss(t, d8*(e % 2 ? .7 : 1.6), 5200, .7, e % 2 ? .02 : .035);   // brushes
      if(e === 0 || e === 4) kick(t, .45);
      if(e === 6 && bar % 2) rim(t, .8);
    }},
  smoke: {name:'Smoke', bpm:70, swing:.5, seed:11, scale:[65,67,69,72,74,77,79],
    chords:[[41,[57,60,64,67]],[40,[55,59,62,67]],[38,[57,60,62,65]],[36,[55,59,64,67]],[41,[57,60,64,69]],[40,[55,59,62,64]],[38,[53,57,60,64]],[43,[53,57,59,62]]],
    play(t, bar, e, C, R, d8){
      const [root, v] = C;
      if(e === 0) v.forEach((m, i)=>epiano(t + i*.03, m, d8*7, .7));
      if(e === 0) bass(t, root, d8*2.5, .9);
      if(e === 3) bass(t, root + (bar % 2 ? 7 : 12), d8*1.5, .7);
      if(e === 0 || e === 5) kick(t, .6);
      if(e === 2 || e === 6) hiss(t, .22, 1800, .9, .06);           // a soft, dusty snare
      hiss(t, .05, 7500, 1.2, e % 2 ? .012 : .02, 'highpass');      // hats
    }},
  felt: {name:'Felt', bpm:100, swing:.5, seed:23, scale:[57,59,60,62,64,67,69,71,72],
    chords:[[45,[55,60,64,67]],[38,[54,57,60,64]],[43,[54,59,62,66]],[36,[52,55,59,64]],[42,[52,57,60,64]],[47,[51,57,59,63]],[40,[50,55,59,62]],[40,[50,55,59,62]]],
    play(t, bar, e, C, R, d8){
      const [root, v] = C;
      if(e === 0 || e === 3 || e === 4) bass(t, e === 3 ? root + 7 : root, d8*1.6, .85);   // the bossa bass: root, fifth on the and of two, root
      if(e === 7) bass(t, root + 7, d8*.9, .7);
      if([0, 2, 3, 5, 6].includes(e)) v.forEach((m, i)=>pluck(t + i*.008, m, d8*1.6, e === 0 ? .9 : .65));
      if([0, 3, 6].includes(e) && bar % 2 === 0 || [2, 4].includes(e) && bar % 2) rim(t, 1);   // clave
      hiss(t, .06, 6500, 1, .015, 'highpass');
    }},
};
const MEL = {};   // each track's melody: fixed per track so the loop repeats
function melody(id){
  if(MEL[id]) return MEL[id];
  const T = TRACKS[id], R = rng(T.seed), m = [];
  let n = 2 + Math.floor(R()*3);
  for(let i = 0; i < 64; i++){
    if(R() < (i % 2 ? .18 : .32)){ n = Math.max(0, Math.min(T.scale.length - 1, n + Math.round((R() - .5)*3))); m.push([i, T.scale[n] + 12, R() < .3 ? 3 : 1]); }
  }
  return MEL[id] = m;
}

function schedule(){
  const T = TRACKS[track]; if(!T) return;
  const beat = 60/T.bpm, R = rng(T.seed + 101);
  while(nextT < ctx.currentTime + .25){
    const s = step % 64, bar = Math.floor(s/8), e = s % 8;
    const swingOff = e % 2 ? (T.swing - .5)*beat : 0, t = nextT + swingOff, d8 = beat/2;
    T.play(t, bar, e, T.chords[bar], R, d8);
    for(const [i, m, len] of melody(track)) if(i === s) (track === 'felt' ? pluck : epiano)(t, m, d8*len, .45);
    nextT += d8; step++;
  }
}
function play(id){
  if(!TRACKS[id]){ stop(); return; }
  if(!ensure()) return;
  if(ctx.state === 'suspended') ctx.resume();
  if(track === id && timer) return;
  const now = ctx.currentTime, tok = ++playTok, wait = timer ? 300 : 0;
  out.gain.cancelScheduledValues(now); out.gain.setTargetAtTime(0, now, .08);   // a quick fade between tracks
  clearInterval(timer); timer = 0;
  setTimeout(()=>{
    if(tok !== playTok) return;
    track = id; step = 0; nextT = ctx.currentTime + .08;
    out.gain.cancelScheduledValues(ctx.currentTime); out.gain.setTargetAtTime(vol*.6, ctx.currentTime, .4);
    timer = setInterval(schedule, 60); schedule();
  }, wait);
}
function stop(){
  if(!ctx) return;
  track = null; playTok++; clearInterval(timer); timer = 0;
  out.gain.cancelScheduledValues(ctx.currentTime); out.gain.setTargetAtTime(0, ctx.currentTime, .15);
}
function setVolume(v){ vol = Math.max(0, Math.min(1, v)); if(ctx && track) out.gain.setTargetAtTime(vol*.6, ctx.currentTime, .1); }
function resume(){ if(ctx && ctx.state === 'suspended') ctx.resume(); }
root.Music = {play, stop, setVolume, resume, tracks: Object.fromEntries(Object.entries(TRACKS).map(([k, T])=>[k, T.name])), playing: ()=>track};
})(typeof window !== 'undefined' ? window : this);
