// Cut Trainer Live: maths and ball detection, kept free of any browser/XR code so it can be tested on its own.

// ---------- vectors & 4x4 matrices (column-major, like WebXR) ----------
export const v3 = {
  add: (a,b)=>[a[0]+b[0],a[1]+b[1],a[2]+b[2]],
  sub: (a,b)=>[a[0]-b[0],a[1]-b[1],a[2]-b[2]],
  mul: (a,k)=>[a[0]*k,a[1]*k,a[2]*k],
  dot: (a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2],
  cross: (a,b)=>[a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]],
  len: a=>Math.hypot(a[0],a[1],a[2]),
  norm: a=>{ const l = Math.hypot(a[0],a[1],a[2]) || 1; return [a[0]/l,a[1]/l,a[2]/l]; },
};
export function m4mul(a, b){
  const o = new Float32Array(16);
  for(let c=0;c<4;c++) for(let r=0;r<4;r++){
    let s = 0; for(let k=0;k<4;k++) s += a[k*4+r]*b[c*4+k];
    o[c*4+r] = s;
  }
  return o;
}
export function m4inv(m){
  const inv = new Float32Array(16);
  inv[0]=m[5]*m[10]*m[15]-m[5]*m[11]*m[14]-m[9]*m[6]*m[15]+m[9]*m[7]*m[14]+m[13]*m[6]*m[11]-m[13]*m[7]*m[10];
  inv[4]=-m[4]*m[10]*m[15]+m[4]*m[11]*m[14]+m[8]*m[6]*m[15]-m[8]*m[7]*m[14]-m[12]*m[6]*m[11]+m[12]*m[7]*m[10];
  inv[8]=m[4]*m[9]*m[15]-m[4]*m[11]*m[13]-m[8]*m[5]*m[15]+m[8]*m[7]*m[13]+m[12]*m[5]*m[11]-m[12]*m[7]*m[9];
  inv[12]=-m[4]*m[9]*m[14]+m[4]*m[10]*m[13]+m[8]*m[5]*m[14]-m[8]*m[6]*m[13]-m[12]*m[5]*m[10]+m[12]*m[6]*m[9];
  inv[1]=-m[1]*m[10]*m[15]+m[1]*m[11]*m[14]+m[9]*m[2]*m[15]-m[9]*m[3]*m[14]-m[13]*m[2]*m[11]+m[13]*m[3]*m[10];
  inv[5]=m[0]*m[10]*m[15]-m[0]*m[11]*m[14]-m[8]*m[2]*m[15]+m[8]*m[3]*m[14]+m[12]*m[2]*m[11]-m[12]*m[3]*m[10];
  inv[9]=-m[0]*m[9]*m[15]+m[0]*m[11]*m[13]+m[8]*m[1]*m[15]-m[8]*m[3]*m[13]-m[12]*m[1]*m[11]+m[12]*m[3]*m[9];
  inv[13]=m[0]*m[9]*m[14]-m[0]*m[10]*m[13]-m[8]*m[1]*m[14]+m[8]*m[2]*m[13]+m[12]*m[1]*m[10]-m[12]*m[2]*m[9];
  inv[2]=m[1]*m[6]*m[15]-m[1]*m[7]*m[14]-m[5]*m[2]*m[15]+m[5]*m[3]*m[14]+m[13]*m[2]*m[7]-m[13]*m[3]*m[6];
  inv[6]=-m[0]*m[6]*m[15]+m[0]*m[7]*m[14]+m[4]*m[2]*m[15]-m[4]*m[3]*m[14]-m[12]*m[2]*m[7]+m[12]*m[3]*m[6];
  inv[10]=m[0]*m[5]*m[15]-m[0]*m[7]*m[13]-m[4]*m[1]*m[15]+m[4]*m[3]*m[13]+m[12]*m[1]*m[7]-m[12]*m[3]*m[5];
  inv[14]=-m[0]*m[5]*m[14]+m[0]*m[6]*m[13]+m[4]*m[1]*m[14]-m[4]*m[2]*m[13]-m[12]*m[1]*m[6]+m[12]*m[2]*m[5];
  inv[3]=-m[1]*m[6]*m[11]+m[1]*m[7]*m[10]+m[5]*m[2]*m[11]-m[5]*m[3]*m[10]-m[9]*m[2]*m[7]+m[9]*m[3]*m[6];
  inv[7]=m[0]*m[6]*m[11]-m[0]*m[7]*m[10]-m[4]*m[2]*m[11]+m[4]*m[3]*m[10]+m[8]*m[2]*m[7]-m[8]*m[3]*m[6];
  inv[11]=-m[0]*m[5]*m[11]+m[0]*m[7]*m[9]+m[4]*m[1]*m[11]-m[4]*m[3]*m[9]-m[8]*m[1]*m[7]+m[8]*m[3]*m[5];
  inv[15]=m[0]*m[5]*m[10]-m[0]*m[6]*m[9]-m[4]*m[1]*m[10]+m[4]*m[2]*m[9]+m[8]*m[1]*m[6]-m[8]*m[2]*m[5];
  let det = m[0]*inv[0]+m[1]*inv[4]+m[2]*inv[8]+m[3]*inv[12];
  if(Math.abs(det) < 1e-12) return null;
  det = 1/det; for(let i=0;i<16;i++) inv[i] *= det;
  return inv;
}
export function m4point(m, p){   // returns [x,y,z,w]
  return [
    m[0]*p[0]+m[4]*p[1]+m[8]*p[2]+m[12],
    m[1]*p[0]+m[5]*p[1]+m[9]*p[2]+m[13],
    m[2]*p[0]+m[6]*p[1]+m[10]*p[2]+m[14],
    m[3]*p[0]+m[7]*p[1]+m[11]*p[2]+m[15]];
}
export const m4identity = ()=>{ const m = new Float32Array(16); m[0]=m[5]=m[10]=m[15]=1; return m; };

// A ray through a point in normalised device coordinates (-1..1), in world space.
export function rayFromNDC(proj, view, x, y){
  const inv = m4inv(m4mul(proj, view)); if(!inv) return null;
  const a = m4point(inv, [x, y, -1]), b = m4point(inv, [x, y, 1]);
  const p0 = [a[0]/a[3], a[1]/a[3], a[2]/a[3]], p1 = [b[0]/b[3], b[1]/b[3], b[2]/b[3]];
  return {o: p0, d: v3.norm(v3.sub(p1, p0))};
}
// World point to NDC (and the depth in front of the camera); null if behind.
export function projectToNDC(proj, view, p){
  const e = m4point(view, p);
  if(e[2] > -1e-4) return null;                      // behind the eye (the camera looks down -z)
  const c = m4point(proj, [e[0], e[1], e[2]]);
  return {x: c[0]/c[3], y: c[1]/c[3], depth: -e[2]};
}
export function rayPlane(ray, plane, lift = 0){
  const p0 = v3.add(plane.p, v3.mul(plane.n, lift));
  const den = v3.dot(ray.d, plane.n);
  if(Math.abs(den) < 1e-6) return null;
  const t = v3.dot(v3.sub(p0, ray.o), plane.n) / den;
  return t > 0 ? v3.add(ray.o, v3.mul(ray.d, t)) : null;
}

// ---------- the table from three tapped corner pockets ----------
// a, b: two corners next to each other; c: the corner next to b, across the table. All on the cloth plane.
export function tableFrom3(a, b, c, n){
  const flat = v => v3.sub(v, v3.mul(n, v3.dot(v, n)));
  let ex = flat(v3.sub(b, a)); const L1 = v3.len(ex); ex = v3.norm(ex);
  let ey = v3.norm(v3.cross(n, ex));
  let L2 = v3.dot(v3.sub(c, b), ey);
  if(L2 < 0){ ey = v3.mul(ey, -1); L2 = -L2; }
  const corners = [a, v3.add(a, v3.mul(ex, L1)), v3.add(a, v3.add(v3.mul(ex, L1), v3.mul(ey, L2))), v3.add(a, v3.mul(ey, L2))];
  // side pockets sit halfway along the long rails
  const long = L1 >= L2;
  const mid = (p, q) => v3.mul(v3.add(p, q), 0.5);
  const sides = long ? [mid(corners[0], corners[1]), mid(corners[3], corners[2])] : [mid(corners[1], corners[2]), mid(corners[0], corners[3])];
  return {origin: a, ex, ey, n, len: Math.max(L1, L2), wid: Math.min(L1, L2), L1, L2, corners,
    pockets: [...corners.map(p=>({p, side:false})), ...sides.map(p=>({p, side:true}))]};
}
// Which nominal table it looks like (playing-surface sizes; pocket-centre taps land a little outside them)
export const TABLES = [{name:'7 ft', len:1.98, wid:0.99}, {name:'8 ft', len:2.34, wid:1.17}, {name:'9 ft', len:2.54, wid:1.27}];
export function guessTable(len, wid){
  let best = null;
  for(const t of TABLES){ const e = Math.abs(len - t.len - 0.06) + Math.abs(wid - t.wid - 0.06); if(!best || e < best.e) best = {...t, e}; }
  return best;
}

// ---------- the shot ----------
export const R = 0.028575;       // ball radius, metres (2¼")
const RAD = Math.PI/180;
export const REFS = [{id:'full',label:'Full',f:1},{id:'34',label:'¾',f:.75},{id:'12',label:'½',f:.5},{id:'14',label:'¼',f:.25},{id:'18',label:'⅛',f:.125}]
  .map(r => ({...r, deg: Math.asin(1-r.f)/RAD}));
export function shotGeometry(cb, ob, pk, n){
  const flat = v => v3.sub(v, v3.mul(n, v3.dot(v, n)));
  const u = v3.norm(flat(v3.sub(pk, ob)));                  // object ball to pocket
  const gb = v3.sub(ob, v3.mul(u, 2*R));                     // ghost ball: touching, opposite the pocket
  const v = v3.norm(flat(v3.sub(gb, cb)));                   // cue ball to ghost ball
  const theta = Math.acos(Math.max(-1, Math.min(1, v3.dot(v, u)))) / RAD;
  const f = 1 - Math.sin(Math.min(90, theta)*RAD);
  const nearest = REFS.reduce((a,b)=> Math.abs(b.f-f) < Math.abs(a.f-f) ? b : a);
  // cue ball after a stop shot: along the tangent line
  const tan = v3.sub(v, v3.mul(u, v3.dot(v, u)));
  return {cb, ob, pk, gb, u, v, theta, f, nearest, tangent: v3.len(tan) > 1e-3 ? v3.norm(tan) : null,
    possible: theta < 89 && v3.len(flat(v3.sub(gb, cb))) > R};
}

// ---------- finding a ball in the camera image ----------
// img: RGBA bytes, w x h, rows in memory order. (x, y) are pixel coordinates in that same order.
// rExp: the ball's expected radius in pixels at that spot. Returns the ball's centre, or null.
const px = (img, w, x, y) => { const i = (y*w + x)*4; return [img[i], img[i+1], img[i+2]]; };
function chromaLuma(c){ const s = c[0]+c[1]+c[2] + 1e-3; return {c: [c[0]/s, c[1]/s, c[2]/s], l: s/765}; }
const median = xs => { const a = [...xs].sort((p,q)=>p-q); return a[a.length>>1]; };

export function detectBall(img, w, h, sx, sy, rExp){
  rExp = Math.max(3, Math.min(250, rExp));
  const half = Math.ceil(rExp*3);
  const x0 = Math.max(0, Math.round(sx-half)), x1 = Math.min(w-1, Math.round(sx+half));
  const y0 = Math.max(0, Math.round(sy-half)), y1 = Math.min(h-1, Math.round(sy+half));
  if(x1-x0 < 6 || y1-y0 < 6) return null;
  // the cloth's colour: the median around the edge of the search window (mostly cloth)
  const cr=[], cg=[], cb=[], cl=[];
  const addEdge = (x,y) => { const q = chromaLuma(px(img,w,x,y)); cr.push(q.c[0]); cg.push(q.c[1]); cb.push(q.c[2]); cl.push(q.l); };
  for(let x=x0;x<=x1;x+=2){ addEdge(x,y0); addEdge(x,y1); }
  for(let y=y0;y<=y1;y+=2){ addEdge(x0,y); addEdge(x1,y); }
  const cloth = {c:[median(cr),median(cg),median(cb)], l:median(cl)};
  // a pixel belongs to a ball if its colour differs from the cloth; a shadow is the cloth's colour, only darker
  const isBall = (x,y) => {
    const q = chromaLuma(px(img,w,x,y));
    const d = Math.abs(q.c[0]-cloth.c[0]) + Math.abs(q.c[1]-cloth.c[1]) + Math.abs(q.c[2]-cloth.c[2]);
    if(q.l > cloth.l*1.7 + 0.05) return true;        // much brighter: white ball, highlights
    if(q.l < cloth.l*0.22) return true;              // much darker than any shadow: the 8-ball
    return d > 0.09;
  };
  // start at the tap, or the nearest ball pixel if the tap landed just off the ball
  let seedHit = isBall(Math.round(sx), Math.round(sy)), cx = sx, cy = sy;
  if(!seedHit){
    let best = null;
    const rr = Math.ceil(rExp*1.2);
    for(let dy=-rr; dy<=rr; dy++) for(let dx=-rr; dx<=rr; dx++){
      const x = Math.round(sx+dx), y = Math.round(sy+dy), d2 = dx*dx+dy*dy;
      if(x<x0||x>x1||y<y0||y>y1||d2>rr*rr) continue;
      if((!best || d2 < best.d2) && isBall(x,y)) best = {x,y,d2};
    }
    if(!best) return null;
    cx = best.x; cy = best.y;
  }
  // settle on the ball: repeatedly move to the centre of the ball pixels within one radius
  let count = 0, sumL = 0, sumC = [0,0,0];
  for(let it=0; it<10; it++){
    let sx2=0, sy2=0; count=0; sumL=0; sumC=[0,0,0];
    const r = rExp, r2 = r*r;
    for(let y=Math.max(y0,Math.floor(cy-r)); y<=Math.min(y1,Math.ceil(cy+r)); y++)
      for(let x=Math.max(x0,Math.floor(cx-r)); x<=Math.min(x1,Math.ceil(cx+r)); x++){
        const dx=x-cx, dy=y-cy; if(dx*dx+dy*dy > r2) continue;
        if(isBall(x,y)){ sx2+=x; sy2+=y; count++; const q = chromaLuma(px(img,w,x,y)); sumL+=q.l; sumC[0]+=q.c[0]; sumC[1]+=q.c[1]; sumC[2]+=q.c[2]; }
      }
    if(!count) return null;
    const nx = sx2/count, ny = sy2/count, moved = Math.hypot(nx-cx, ny-cy);
    cx = nx; cy = ny;
    if(moved < 0.25) break;
  }
  const fill = count / (Math.PI*rExp*rExp);
  if(fill < 0.3) return null;                          // too little there to be a ball
  const mc = sumC.map(v=>v/count), ml = sumL/count;
  const neutral = Math.abs(mc[0]-1/3) + Math.abs(mc[1]-1/3) + Math.abs(mc[2]-1/3) < 0.12;
  return {x: cx, y: cy, fill, seedHit, white: neutral && ml > Math.max(0.5, cloth.l*1.4),
    score: (seedHit ? 1 : 0.6) * (1 - Math.min(1, Math.abs(fill - 0.85)))};
}

// ---------- keeping the pinned table rigid ----------
// The table never moves, so tracking corrections may only slide it and turn it about the vertical, never bend it.
// Fit that rigid move from where the corner anchors were pinned (a) to where tracking says they are now (b).
export function rotationAbout(n, ang){
  const [x,y,z] = n, c = Math.cos(ang), s = Math.sin(ang), t = 1 - c;
  return [t*x*x+c, t*x*y-s*z, t*x*z+s*y,  t*x*y+s*z, t*y*y+c, t*y*z-s*x,  t*x*z-s*y, t*y*z+s*x, t*z*z+c];   // row-major 3x3
}
export function rigidFit(a, b, n){
  const k = a.length, ca = [0,0,0], cb = [0,0,0];
  for(let i=0;i<k;i++){ for(let j=0;j<3;j++){ ca[j] += a[i][j]/k; cb[j] += b[i][j]/k; } }
  const ex = v3.norm(Math.abs(n[0]) < 0.9 ? v3.cross(n, [1,0,0]) : v3.cross(n, [0,1,0])), ey = v3.cross(n, ex);
  let sc = 0, ss = 0;
  for(let i=0;i<k;i++){
    const pa = v3.sub(a[i], ca), pb = v3.sub(b[i], cb);
    const ax = v3.dot(pa, ex), ay = v3.dot(pa, ey), bx = v3.dot(pb, ex), by = v3.dot(pb, ey);
    sc += ax*bx + ay*by; ss += ax*by - ay*bx;
  }
  const ang = Math.atan2(ss, sc);
  // rotation that turns ex toward ey is +ang about n (n = ex × ey)
  const Rm = rotationAbout(n, ang);
  const rot = p => [Rm[0]*p[0]+Rm[1]*p[1]+Rm[2]*p[2], Rm[3]*p[0]+Rm[4]*p[1]+Rm[5]*p[2], Rm[6]*p[0]+Rm[7]*p[1]+Rm[8]*p[2]];
  const t = v3.sub(cb, rot(ca));
  const m = new Float32Array([Rm[0],Rm[3],Rm[6],0, Rm[1],Rm[4],Rm[7],0, Rm[2],Rm[5],Rm[8],0, t[0],t[1],t[2],1]);
  let residual = 0;
  for(let i=0;i<k;i++) residual = Math.max(residual, v3.len(v3.sub(v3.add(rot(a[i]), t), b[i])));
  return {m, residual, angle: ang, shift: v3.len(t)};
}

// ---------- finding every ball on the table ----------
export function pointInPoly(x, y, poly){
  let inside = false;
  for(let i=0, j=poly.length-1; i<poly.length; j=i++){
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if(((yi > y) !== (yj > y)) && (x < (xj-xi)*(y-yi)/(yj-yi) + xi)) inside = !inside;
  }
  return inside;
}
function toHsv(r, g, b){
  r/=255; g/=255; b/=255; const mx = Math.max(r,g,b), mn = Math.min(r,g,b), d = mx - mn;
  let h = 0;
  if(d > 1e-6){ h = mx===r ? ((g-b)/d)%6 : mx===g ? (b-r)/d+2 : (r-g)/d+4; h *= 60; if(h < 0) h += 360; }
  return {h, s: mx ? d/mx : 0, v: mx};
}
// What the cloth looks like: median colour of sample points inside the table outline.
export function clothColour(img, w, h, poly, step = 6){
  const cs=[[],[],[]], ls=[];
  let minX=Infinity,maxX=-Infinity,minY=Infinity,maxY=-Infinity;
  for(const [x,y] of poly){ minX=Math.min(minX,x); maxX=Math.max(maxX,x); minY=Math.min(minY,y); maxY=Math.max(maxY,y); }
  for(let y=Math.max(0,Math.floor(minY)); y<=Math.min(h-1,maxY); y+=step)
    for(let x=Math.max(0,Math.floor(minX)); x<=Math.min(w-1,maxX); x+=step){
      if(!pointInPoly(x, y, poly)) continue;
      const i=(y*w+x)*4, s=img[i]+img[i+1]+img[i+2]+1e-3;
      cs[0].push(img[i]/s); cs[1].push(img[i+1]/s); cs[2].push(img[i+2]/s); ls.push(s/765);
    }
  if(ls.length < 20) return null;
  const med = a => { const b=[...a].sort((p,q)=>p-q); return b[b.length>>1]; };
  const c = cs.map(med), l = med(ls);
  // how uniform it is (lower = more like one cloth), used to check the picture's orientation
  let dev = 0; for(let k=0;k<ls.length;k++) dev += Math.abs(cs[0][k]-c[0]) + Math.abs(cs[1][k]-c[1]) + Math.abs(cs[2][k]-c[2]);
  return {c, l, dev: dev/ls.length, n: ls.length};
}
// What a ball looks like, as numbers to compare two balls with: average colour mix, brightness,
// and how much of it is strongly coloured (a cue ball: almost none; a stripe: some; a solid: most).
export function ballSignature(img, w, h, cx, cy, r){
  let n=0, cr=0, cg=0, cb=0, v=0, sat=0;
  const rr = r*0.75;
  for(let y=Math.max(0,Math.floor(cy-rr)); y<=Math.min(h-1,Math.ceil(cy+rr)); y++)
    for(let x=Math.max(0,Math.floor(cx-rr)); x<=Math.min(w-1,Math.ceil(cx+rr)); x++){
      if((x-cx)**2 + (y-cy)**2 > rr*rr) continue;
      const i=(y*w+x)*4, R=img[i], G=img[i+1], B=img[i+2], s=R+G+B+1e-3, mx=Math.max(R,G,B), mn=Math.min(R,G,B);
      cr+=R/s; cg+=G/s; cb+=B/s; v+=mx/255; if(mx > 20 && (mx-mn)/mx > 0.35) sat++; n++;
    }
  if(!n) return null;
  return [cr/n, cg/n, cb/n, v/n, sat/n];
}
export function signatureDistance(a, b){
  if(!a || !b) return Infinity;
  return Math.abs(a[0]-b[0])*3 + Math.abs(a[1]-b[1])*3 + Math.abs(a[2]-b[2])*3 + Math.abs(a[3]-b[3]) + Math.abs(a[4]-b[4])*1.5;
}
// Name a ball from the colours inside it. Solids 1–7 by colour, the 8 black, stripes 9–15 = colour with lots of white.
const HUES = [{n:1,name:'yellow',h:52},{n:5,name:'orange',h:28},{n:3,name:'red',h:4},{n:4,name:'purple',h:285},{n:2,name:'blue',h:222},{n:6,name:'green',h:140}];
export function classifyBall(img, w, h, cx, cy, r){
  let white=0, black=0, n=0; const hues=[];
  const rr = r*0.8;
  for(let y=Math.max(0,Math.floor(cy-rr)); y<=Math.min(h-1,Math.ceil(cy+rr)); y++)
    for(let x=Math.max(0,Math.floor(cx-rr)); x<=Math.min(w-1,Math.ceil(cx+rr)); x++){
      if((x-cx)**2 + (y-cy)**2 > rr*rr) continue;
      const i=(y*w+x)*4, q = toHsv(img[i], img[i+1], img[i+2]); n++;
      if(q.s < 0.3 && q.v > 0.42) white++;             // white, including its shaded side
      else if(q.v < 0.22) black++;
      else if(q.s > 0.3) hues.push(q);
    }
  if(!n) return {id:'?', label:'?', wf:0};
  const wf = white/n, bf = black/n, cf = hues.length/n;
  if(wf > 0.55 && cf < 0.1) return {id:'cue', label:'Cue', cue:true, wf, conf: wf};   // white with no coloured band: not a stripe
  if(bf > 0.45 && hues.length < n*0.3) return {id:'8', label:'8', wf, conf: bf};
  if(hues.length < n*0.12) return {id:'?', label:'?', wf};
  // circular mean of the hue
  let sx=0, sy=0, sv=0; for(const q of hues){ sx += Math.cos(q.h*Math.PI/180); sy += Math.sin(q.h*Math.PI/180); sv += q.v; }
  let hue = Math.atan2(sy, sx)*180/Math.PI; if(hue < 0) hue += 360;
  const dist = (a,b) => { const d = Math.abs(a-b)%360; return Math.min(d, 360-d); };
  let best = HUES[0]; for(const c of HUES) if(dist(hue, c.h) < dist(hue, best.h)) best = c;
  let num = best.n;
  if(best.n === 3 && sv/hues.length < 0.5) num = 7;          // dark red: maroon 7
  const stripe = wf > 0.22;
  if(stripe) num += 8;
  return {id: String(num), label: String(num), stripe, wf, conf: cf};
}
// Which pixels of each row are inside the (convex) table outline: [x0, x1] per row, or null.
function polyRows(poly, w, h){
  const rows = new Array(h).fill(null);
  for(let y=0; y<h; y++){
    let lo = Infinity, hi = -Infinity;
    for(let i=0, j=poly.length-1; i<poly.length; j=i++){
      const [xi, yi] = poly[i], [xj, yj] = poly[j];
      if((yi > y) !== (yj > y)){ const x = (xj-xi)*(y-yi)/(yj-yi) + xi; lo = Math.min(lo, x); hi = Math.max(hi, x); }
    }
    if(lo <= hi){ const a = Math.max(0, Math.ceil(lo)), b = Math.min(w-1, Math.floor(hi)); if(a <= b) rows[y] = [a, b]; }
  }
  return rows;
}
// All balls in the picture, inside the table outline (image coordinates). rAt(x,y) gives the expected radius there.
// A blob only counts as balls if it's shaped like them: round for one ball, or a chain of round parts for touching balls.
// Long thin blobs (a cushion edge, a shadow along the rail, the cue) are thrown out rather than chopped into "balls".
export function findBalls(img, w, h, poly, rAt){
  const cloth = clothColour(img, w, h, poly, 5); if(!cloth) return [];
  const rows = polyRows(poly, w, h);
  const mask = new Uint8Array(w*h);
  for(let y=0; y<h; y++){
    const rr = rows[y]; if(!rr) continue;
    for(let x=rr[0]; x<=rr[1]; x++){
      const i=(y*w+x)*4, s=img[i]+img[i+1]+img[i+2]+1e-3, l=s/765;
      const d = Math.abs(img[i]/s-cloth.c[0]) + Math.abs(img[i+1]/s-cloth.c[1]) + Math.abs(img[i+2]/s-cloth.c[2]);
      if(l > cloth.l*1.7+0.05 || l < cloth.l*0.22 || d > 0.09) mask[y*w+x] = 1;
    }
  }
  const seen = new Uint8Array(w*h), out = [], stack = [];
  const pts = [];
  for(let k=0; k<w*h; k++){
    if(!mask[k] || seen[k]) continue;
    pts.length = 0; stack.push(k); seen[k] = 1;
    while(stack.length){
      const q = stack.pop(), qx = q % w, qy = (q / w) | 0; pts.push(qx, qy);
      if(qx+1 < w && mask[q+1] && !seen[q+1]){ seen[q+1]=1; stack.push(q+1); }
      if(qx > 0 && mask[q-1] && !seen[q-1]){ seen[q-1]=1; stack.push(q-1); }
      if(qy+1 < h && mask[q+w] && !seen[q+w]){ seen[q+w]=1; stack.push(q+w); }
      if(qy > 0 && mask[q-w] && !seen[q-w]){ seen[q-w]=1; stack.push(q-w); }
    }
    const area = pts.length/2; let sx=0, sy=0;
    for(let i=0;i<pts.length;i+=2){ sx+=pts[i]; sy+=pts[i+1]; }
    const cx = sx/area, cy = sy/area, r = rAt(cx, cy);
    if(!r) continue;
    const one = Math.PI*r*r;
    if(area < one*0.35) continue;                       // specks, chalk, reflections
    const k2 = Math.max(1, Math.round(area/(one*0.9)));
    if(k2 > 4) continue;                                // too big: a hand, the cue, a rail
    // shape: how stretched the blob is (1 = round; two touching balls ≈ 2.2)
    let sxx=0, syy=0, sxy=0;
    for(let i=0;i<pts.length;i+=2){ const dx=pts[i]-cx, dy=pts[i+1]-cy; sxx+=dx*dx; syy+=dy*dy; sxy+=dx*dy; }
    sxx/=area; syy/=area; sxy/=area;
    const tr = sxx+syy, det = sxx*syy-sxy*sxy, disc = Math.sqrt(Math.max(0, tr*tr/4-det));
    const stretch = Math.sqrt((tr/2+disc) / Math.max(1e-6, tr/2-disc));
    if(k2 === 1 && stretch > 1.6) continue;
    if(k2 > 1 && stretch > 1.15*k2 + 0.6) continue;    // longer and thinner than a row of touching balls
    let cents = [];
    if(k2 === 1) cents = [[cx, cy]];
    else {
      for(let c=0;c<k2;c++){ const j = Math.floor((c+0.5)/k2*area)*2; cents.push([pts[j], pts[j+1]]); }
      const lab = new Int8Array(area);
      for(let it=0; it<8; it++){
        const acc = cents.map(()=>[0,0,0]);
        for(let i=0,n=0;i<pts.length;i+=2,n++){ let b=0, bd=Infinity; for(let ci=0;ci<k2;ci++){ const d=(cents[ci][0]-pts[i])**2+(cents[ci][1]-pts[i+1])**2; if(d<bd){bd=d;b=ci;} } lab[n]=b; acc[b][0]+=pts[i]; acc[b][1]+=pts[i+1]; acc[b][2]++; }
        cents = acc.map((a,ci)=> a[2] ? [a[0]/a[2], a[1]/a[2]] : cents[ci]);
      }
      // each part must itself look like a ball: compact, and about a ball's size
      let okParts = true;
      const cnt = new Array(k2).fill(0), inside = new Array(k2).fill(0);
      for(let i=0,n=0;i<pts.length;i+=2,n++){ const c = cents[lab[n]]; cnt[lab[n]]++; if((pts[i]-c[0])**2 + (pts[i+1]-c[1])**2 <= (r*1.15)**2) inside[lab[n]]++; }
      for(let c=0;c<k2;c++) if(cnt[c] < one*0.45 || inside[c] < cnt[c]*0.85) okParts = false;
      if(!okParts) continue;
    }
    for(const [ux,uy] of cents){
      const ru = rAt(ux, uy) || r;
      const d = detectBall(img, w, h, ux, uy, ru);
      if(!d || d.fill < 0.45) continue;
      out.push({x: d.x, y: d.y, r: ru, fill: d.fill, sig: ballSignature(img, w, h, d.x, d.y, ru), ...classifyBall(img, w, h, d.x, d.y, ru)});
    }
  }
  // two detections closer than a ball's width are the same ball
  const kept = [];
  for(const b of out.sort((a,b)=>b.fill-a.fill)) if(!kept.some(o => Math.hypot(o.x-b.x, o.y-b.y) < b.r*1.8)) kept.push(b);
  return uniqueLabels(kept);
}
// There is one of each ball: one cue ball (the whitest), one of each number (the most convincing); the rest become '?'.
export function uniqueLabels(balls){
  const cueScore = b => b.cue ? b.wf : -1;
  const cue = balls.reduce((a,b)=> cueScore(b) > cueScore(a || {cue:false}) ? b : a, null);
  for(const b of balls){ if(b.cue && b !== cue){ b.cue = false; b.label = '?'; b.id = '?'; } }
  const byLabel = {};
  for(const b of balls){ if(b.cue || b.label === '?') continue; const o = byLabel[b.label]; if(!o || (b.conf||0) > (o.conf||0)) byLabel[b.label] = b; }
  for(const b of balls){ if(!b.cue && b.label !== '?' && byLabel[b.label] !== b){ b.label = '?'; b.id = '?'; } }
  return balls;
}
