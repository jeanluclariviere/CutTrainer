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
