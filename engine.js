// Cut Trainer physics engine: one table definition shared by the physics and the drawing, and a simulation of every ball
// on it at once. Units: inches, seconds, radians. The playing surface is x in [0, W], y in [0, H], z up; balls rest at z = R.
// Works in the browser (window.PoolEngine) and in Node (require), so it can be tested on its own.
(function(root){
'use strict';

const R = 1.125;                 // ball radius (2.25" ball)
const G = 386.1;                 // gravity, in/s²
const C = {
  muSlide: 0.28,                 // ball-cloth sliding friction
  rollDecel: 6,                  // rolling resistance, in/s²
  muSpin: 0.044,                 // ball-cloth friction slowing sidespin
  eBall: 0.95,                   // ball-ball restitution
  eCushion: 0.85,                // cushion restitution (the contact sits above centre, so the rebound off the cloth is about 0.74)
  eJaw: 0.7,                     // jaws and points are softer (about 0.6 effective)
  muCushion: 0.2,                // ball-cushion friction
  noseHeight: 1.43,              // height of the cushion nose above the cloth (contact sits above the ball's centre)
  cushionWidth: 2.0,             // nose to the rail
  railWidth: 4.4,                // rail top, beyond the cushion
  jawAngle: {corner: 142, side: 104},   // between the cushion nose and the jaw face, degrees
  jawLength: 2.4,
  shelf: {corner: 1.5, side: 0.5},      // how far past the mouth a ball's centre goes before it's over the hole
  hole: {corner: 2.3, side: 2.5},       // hole radius
};
// ball-ball friction falls with sliding speed (Alciatore's fit; speed in m/s)
const muBall = vrel => 9.951e-3 + 0.108*Math.exp(-1.088*vrel*0.0254);

// ---------- vectors ----------
const v2 = {
  add:(a,b)=>[a[0]+b[0],a[1]+b[1]], sub:(a,b)=>[a[0]-b[0],a[1]-b[1]], mul:(a,k)=>[a[0]*k,a[1]*k],
  dot:(a,b)=>a[0]*b[0]+a[1]*b[1], len:a=>Math.hypot(a[0],a[1]), norm:a=>{const l=Math.hypot(a[0],a[1])||1;return [a[0]/l,a[1]/l];},
};
const v3 = {
  add:(a,b)=>[a[0]+b[0],a[1]+b[1],a[2]+b[2]], sub:(a,b)=>[a[0]-b[0],a[1]-b[1],a[2]-b[2]], mul:(a,k)=>[a[0]*k,a[1]*k,a[2]*k],
  dot:(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2], len:a=>Math.hypot(a[0],a[1],a[2]),
  cross:(a,b)=>[a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]],
  norm:a=>{const l=Math.hypot(a[0],a[1],a[2])||1;return [a[0]/l,a[1]/l,a[2]/l];},
};
function matRot(M, k, a){   // M rotated by angle a about unit axis k (applied after M)
  const c = Math.cos(a), s = Math.sin(a), t = 1 - c, [x, y, z] = k;
  const Rm = [[c+x*x*t, x*y*t-z*s, x*z*t+y*s],[y*x*t+z*s, c+y*y*t, y*z*t-x*s],[z*x*t-y*s, z*y*t+x*s, c+z*z*t]];
  return Rm.map(r=>[0,1,2].map(j=>r[0]*M[0][j] + r[1]*M[1][j] + r[2]*M[2][j]));
}
const I3 = [[1,0,0],[0,1,0],[0,0,1]];

// ---------- the table ----------
// mouth: [corner, side] pocket mouth widths between the points.
function makeTable(W, H, mouth){
  const [mC, mS] = mouth, e = mC/Math.SQRT2, sd = mS/2;
  // cushion noses: each runs between two points, with the inward normal
  const noses = [
    {a:[e,0],   b:[W-e,0],   n:[0,1]},  {a:[W-e,H], b:[e,H],   n:[0,-1]},
    {a:[0,H/2-sd], b:[0,e],  n:[1,0]},  {a:[0,H-e], b:[0,H/2+sd], n:[1,0]},
    {a:[W,e], b:[W,H/2-sd],  n:[-1,0]}, {a:[W,H/2+sd], b:[W,H-e], n:[-1,0]},
  ];
  const corners = [[0,0],[W,0],[0,H],[W,H]];
  const pockets = [];
  // corner pockets: the mouth is the line between the two points; the hole sits behind it, past the shelf
  corners.forEach((c, i)=>{
    const sx = c[0] ? -1 : 1, sy = c[1] ? -1 : 1;
    const into = v2.norm([sx, sy]);                                     // along the corner's bisector, into the table
    const p1 = [c[0] + sx*e, c[1]], p2 = [c[0], c[1] + sy*e];          // the two points
    const mouthMid = v2.mul(v2.add(p1, p2), .5);
    const hole = v2.add(mouthMid, v2.mul(into, -(C.shelf.corner + C.hole.corner)));
    pockets.push({id:i, side:false, corner:c, into, points:[p1, p2], mouthMid, mouth:mC,
      hole, holeR: C.hole.corner, aim: v2.add(mouthMid, v2.mul(into, -0.9))});
  });
  [[0, H/2, [1,0]], [W, H/2, [-1,0]]].forEach(([x, y, n], k)=>{
    const p1 = [x, y - sd], p2 = [x, y + sd], mouthMid = [x, y];
    const hole = v2.add(mouthMid, v2.mul(n, -(C.shelf.side + C.hole.side)));
    pockets.push({id:4+k, side:true, n, into:n, points:[p1, p2], mouthMid, mouth:mS,
      hole, holeR: C.hole.side, aim: v2.add(mouthMid, v2.mul(n, -0.6))});
  });
  // everything a ball can hit: the noses, and at each point a jaw face angled back into the rail
  const segs = [];
  for(const s of noses){
    segs.push({a:s.a, b:s.b, n:s.n, jaw:false});
    for(const [pt, other] of [[s.a, s.b], [s.b, s.a]]){
      const away = v2.norm(v2.sub(other, pt)), out = v2.mul(s.n, -1);
      const corner = corners.some(c=>v2.len(v2.sub(c, pt)) < mC);
      const J = (corner ? C.jawAngle.corner : C.jawAngle.side)*Math.PI/180;
      const f = v2.add(v2.mul(away, Math.cos(J)), v2.mul(out, Math.sin(J)));
      // the jaw runs back until it meets the hole (or its full length)
      const P = pockets.find(P=>P.points.some(q=>v2.len(v2.sub(q, pt)) < 1e-6));
      let L = C.jawLength;
      if(P){ const q = v2.sub(pt, P.hole), bq = v2.dot(q, f), cq = v2.dot(q, q) - P.holeR*P.holeR, disc = bq*bq - cq; if(disc > 0){ const t = -bq - Math.sqrt(disc); if(t > 0) L = Math.min(L, t); } }
      segs.push({a:pt, b:v2.add(pt, v2.mul(f, L)), jaw:true, away, out, n:s.n, corner});
    }
  }
  return {W, H, R, mouth, noses, segs, pockets, C};
}

// ---------- contacts ----------
const K = 2.5/(R*R);   // 1/I per unit mass (I = 2/5 m R²)
// a ball against something fixed: impulse along nc (pointing into the ball) at contact offset rc (from the ball's centre),
// with restitution e and friction mu (limited to what stops the slip). Changes v (horizontal) and w in place.
function hitFixed(b, nc, rc, e, mu){
  const vc = v3.add([b.v[0], b.v[1], 0], v3.cross(b.w, rc));
  const vn = v3.dot(vc, nc);
  if(vn >= 0) return 0;
  const Jn = -(1 + e)*vn;
  const vt = v3.sub(vc, v3.mul(nc, vn)), vtl = v3.len(vt);
  let J = v3.mul(nc, Jn);
  if(vtl > 1e-9){ const Jt = Math.min(mu*Jn, vtl/3.5); J = v3.sub(J, v3.mul(vt, Jt/vtl)); }
  b.v = [b.v[0] + J[0], b.v[1] + J[1]];
  b.w = v3.add(b.w, v3.mul(v3.cross(rc, J), K));
  b.state = 'slide';
  return -vn;
}
// two balls: n from a to b. Normal impulse with restitution; friction at the contact (this is what throws the object ball).
function hitBalls(a, b, n){
  const n3 = [n[0], n[1], 0], ra = v3.mul(n3, R), rb = v3.mul(n3, -R);
  const va = v3.add([a.v[0], a.v[1], 0], v3.cross(a.w, ra)), vb = v3.add([b.v[0], b.v[1], 0], v3.cross(b.w, rb));
  const vrel = v3.sub(va, vb), vn = v3.dot(vrel, n3);
  if(vn <= 0) return 0;
  const Jn = (1 + C.eBall)*vn/2;                       // equal masses
  const vt = v3.sub(vrel, v3.mul(n3, vn)), vtl = v3.len(vt);
  let J = v3.mul(n3, Jn);                               // impulse on b (a gets -J)
  if(vtl > 1e-9){ const Jt = Math.min(muBall(vtl)*Jn, vtl/7); J = v3.add(J, v3.mul(vt, Jt/vtl)); }
  a.v = [a.v[0] - J[0], a.v[1] - J[1]]; b.v = [b.v[0] + J[0], b.v[1] + J[1]];
  a.w = v3.add(a.w, v3.mul(v3.cross(ra, v3.mul(J, -1)), K));
  b.w = v3.add(b.w, v3.mul(v3.cross(rb, J), K));
  a.state = b.state = 'slide';
  return vn;
}

// ---------- the cue ----------
// Struck along dir at speed V with the tip at (side a, height b), both in ball radii from the centre.
// A level cue, no squirt or swerve: the tip height sets top/back spin, the side offset sets sidespin.
function strike(ball, dir, V, tip){
  const [a, b] = tip || [0, 0], d = v2.norm(dir);
  ball.v = v2.mul(d, V);
  // rolling is surface speed = V: w = (V/R)(-dy, dx); a tip height b gives 5/2·b of that
  const k = 2.5*V/R;
  ball.w = [-d[1]*k*b, d[0]*k*b, -k*a];
  ball.state = 'slide';
}

// ---------- one step of cloth friction ----------
function cloth(b, dt){
  if(b.state === 'rest' || b.state === 'gone' || b.state === 'falling') return;
  const ug = C.muSlide*G;
  const u = [b.v[0] - R*b.w[1], b.v[1] + R*b.w[0]];      // the cloth contact point's slip
  const ul = Math.hypot(u[0], u[1]);
  if(ul > 0.02){
    const uh = [u[0]/ul, u[1]/ul];
    // slip falls at 7/2·μg: don't overshoot past rolling
    const tStop = ul/(3.5*ug), h = Math.min(dt, tStop);
    b.v = [b.v[0] - ug*uh[0]*h, b.v[1] - ug*uh[1]*h];
    b.w = [b.w[0] - (2.5*ug/R)*uh[1]*h, b.w[1] + (2.5*ug/R)*uh[0]*h, b.w[2]];
    if(h < dt){ b.state = 'roll'; rollStep(b, dt - h); } else b.state = 'slide';
  } else { b.state = 'roll'; rollStep(b, dt); }
  // sidespin wears off
  const sd = 2.5*C.muSpin*G/R*dt;
  b.w[2] = Math.abs(b.w[2]) <= sd ? 0 : b.w[2] - Math.sign(b.w[2])*sd;
  if(b.state === 'roll' && Math.hypot(b.v[0], b.v[1]) < 1e-3 && Math.abs(b.w[2]) < 1e-3){ b.v = [0,0]; b.w = [0,0,0]; b.state = 'rest'; }
}
function rollStep(b, dt){
  const vl = Math.hypot(b.v[0], b.v[1]);
  const nl = Math.max(0, vl - C.rollDecel*dt), k = vl > 1e-9 ? nl/vl : 0;
  b.v = [b.v[0]*k, b.v[1]*k];
  b.w = [-b.v[1]/R, b.v[0]/R, b.w[2]];                  // rolling: no slip
}

// ---------- the simulation ----------
// balls: [{id, p:[x,y], v?, w?}], all at rest unless given velocity/spin.
// opts: {dt, tMax, record (sample every k steps), orient (track each ball's turning, for drawing), stopWhen(state)}
// Returns {balls (final), paths {id: [{t, p, z, M}]}, events [{t, type: 'ball'|'cushion'|'jaw'|'pocket', ids, speed, pocket}]}
function simulate(table, balls, opts = {}){
  const dt = opts.dt || 1/600, tMax = opts.tMax || 12, rec = opts.record || 0, orient = !!opts.orient;
  const B = balls.map(b=>({id:b.id, p:[...b.p], v:b.v ? [...b.v] : [0,0], w:b.w ? [...b.w] : [0,0,0], z:R, vz:0,
    state: (b.v && Math.hypot(b.v[0], b.v[1]) > 0) || (b.w && v3.len(b.w) > 0) ? 'slide' : 'rest', M: I3, pocket:null}));
  const paths = {}, events = [];
  if(rec) for(const b of B) paths[b.id] = [{t:0, p:[...b.p], z:R, M:b.M}];
  let t = 0, step = 0;
  const near = b => !(b.p[0] > R && b.p[0] < table.W - R && b.p[1] > R && b.p[1] < table.H - R);
  while(t < tMax){
    const moving = B.filter(b=>b.state !== 'rest' && b.state !== 'gone');
    if(!moving.length) break;
    // move, with exact times of ball-ball contact inside the step
    let rem = dt;
    for(let guard = 0; rem > 1e-9 && guard < 8; guard++){
      let tc = rem, pair = null;
      for(let i=0;i<B.length;i++) for(let j=i+1;j<B.length;j++){
        const a = B[i], b = B[j];
        if(a.state === 'gone' || b.state === 'gone' || a.state === 'falling' || b.state === 'falling') continue;
        if(a.state === 'rest' && b.state === 'rest') continue;
        const dp = v2.sub(b.p, a.p), dv = v2.sub(b.v, a.v);
        const A = v2.dot(dv, dv); if(A < 1e-12) continue;
        const Bq = 2*v2.dot(dp, dv), Cq = v2.dot(dp, dp) - 4*R*R;
        if(Bq >= 0) continue;                                     // separating
        const disc = Bq*Bq - 4*A*Cq; if(disc < 0) continue;
        const s = (-Bq - Math.sqrt(disc))/(2*A);
        if(s >= -1e-9 && s < tc){ tc = Math.max(0, s); pair = [a, b]; }
      }
      for(const b of B) if(b.state !== 'rest' && b.state !== 'gone' && b.state !== 'falling'){
        b.p = v2.add(b.p, v2.mul(b.v, tc));
        if(orient){ const wl = v3.len(b.w); if(wl > 1e-9) b.M = matRot(b.M, v3.mul(b.w, 1/wl), wl*tc); }
      }
      rem -= tc;
      if(pair){
        const [a, b] = pair, n = v2.norm(v2.sub(b.p, a.p));
        const sp = hitBalls(a, b, n);
        if(sp > 0) events.push({t: t + dt - rem, type:'ball', ids:[a.id, b.id], speed: sp, n, at:[...a.p], pa:[...a.p], pb:[...b.p]});
      }
    }
    t += dt; step++;
    for(const b of B){
      if(b.state === 'falling'){
        b.vz -= G*dt; b.z += b.vz*dt;
        const toHole = v2.sub(b.pocket.hole, b.p), d = v2.len(toHole);
        if(d > 1e-6){ const k = Math.min(1, 6*dt); b.p = v2.add(b.p, v2.mul(toHole, k)); }   // the hole's walls steer it in
        if(b.z < -4*R){ b.state = 'gone'; }
        continue;
      }
      if(b.state === 'rest' || b.state === 'gone') continue;
      cloth(b, dt);
      if(near(b)){
        // cushions, points, jaws: contact on the nose sits above the ball's centre
        for(const sg of table.segs){
          const ab = v2.sub(sg.b, sg.a), q = Math.max(0, Math.min(1, v2.dot(v2.sub(b.p, sg.a), ab)/v2.dot(ab, ab)));
          const cp = v2.add(sg.a, v2.mul(ab, q)), dv = v2.sub(b.p, cp), dl = v2.len(dv);
          if(dl >= R || dl < 1e-9) continue;
          const n = v2.mul(dv, 1/dl);
          if(v2.dot(b.v, n) >= 0) continue;
          b.p = v2.add(cp, v2.mul(n, R));
          const sinT = Math.min(.5, Math.max(0, (C.noseHeight - R)/R)), cosT = Math.sqrt(1 - sinT*sinT);
          const nc = [n[0]*cosT, n[1]*cosT, -sinT], rc = v3.mul(nc, -R);
          const jaw = sg.jaw || q <= 0 || q >= 1;
          const sp = hitFixed(b, nc, rc, jaw ? C.eJaw : C.eCushion, C.muCushion);
          if(sp > 0) events.push({t, type: jaw ? 'jaw' : 'cushion', ids:[b.id], speed: sp});
        }
        // through the mouth and past the jaws without finding the hole (shouldn't happen): it's in the nearest pocket
        if(b.p[0] < -2*R || b.p[0] > table.W + 2*R || b.p[1] < -2*R || b.p[1] > table.H + 2*R){
          const P = table.pockets.reduce((a, q)=>v2.len(v2.sub(b.p, q.hole)) < v2.len(v2.sub(b.p, a.hole)) ? q : a);
          b.state = 'falling'; b.pocket = P; b.vz = 0; events.push({t, type:'pocket', ids:[b.id], pocket:P.id, speed: v2.len(b.v), stray:true});
          continue;
        }
        // over a hole: it drops
        for(const P of table.pockets){
          if(v2.len(v2.sub(b.p, P.hole)) < P.holeR){
            b.state = 'falling'; b.pocket = P; b.vz = 0;
            events.push({t, type:'pocket', ids:[b.id], pocket:P.id, speed: v2.len(b.v)});
            break;
          }
        }
      }
    }
    if(rec && step % rec === 0) for(const b of B) if(b.state !== 'gone' || paths[b.id][paths[b.id].length-1].z > -4*R)
      paths[b.id].push({t, p:[...b.p], z:b.z, M:b.M});
    if(opts.stopWhen && opts.stopWhen(B, events)) break;
  }
  if(rec) for(const b of B){ const L = paths[b.id], last = L[L.length-1]; if(last.t < t) L.push({t, p:[...b.p], z:b.z, M:b.M}); }
  return {balls: B, paths, events, t};
}

// ---------- helpers for aiming ----------
// The cue ball's state on arrival after travelling d inches in a straight line from a strike (no sidespin):
// speed at contact and how much of rolling its spin is (1 rolling, 0 stun, < 0 draw). Exact for the slide-then-roll motion.
function arrive(V, b, d){
  const ug = C.muSlide*G;
  // forward speed v and spin-speed s (R·w along the travel direction); slip u = v - s falls at 3.5·μg
  let v = V, s = 2.5*b*V, x = 0;
  const u0 = v - s;
  if(Math.abs(u0) > 1e-9){
    const sign = Math.sign(u0), tSlip = Math.abs(u0)/(3.5*ug);
    const dSlip = v*tSlip - sign*ug*tSlip*tSlip/2;
    if(d <= dSlip){   // still sliding at contact
      const a = sign*ug, disc = v*v - 2*a*d, tc = (v - Math.sqrt(Math.max(0, disc)))/a;
      const vc = v - a*tc, sc = s + 2.5*a*tc;
      return {v: vc, spin: vc > 1e-9 ? sc/vc : 0};
    }
    v = v - sign*ug*tSlip; x = dSlip;
  }
  const vc = Math.sqrt(Math.max(0, v*v - 2*C.rollDecel*(d - x)));
  return {v: vc, spin: 1};
}
// The cue speed and tip height for the cue ball to arrive at speed vc with spin ratio spinC (1 rolling, 0 stun) after d inches.
function strikeFor(vc, spinC, d){
  if(spinC >= 1) return {V: Math.sqrt(vc*vc + 2*C.rollDecel*d), b: 0.4};   // rolling from the tip: tip at 2/5 R above centre
  // sliding the whole way: v(t) = V - ug·t, slip u falls 3.5·ug·t; arrive with s = spinC·vc
  const ug = C.muSlide*G;
  const T = (-vc + Math.sqrt(vc*vc + 2*ug*d))/ug, V = vc + ug*T;
  const s0 = spinC*vc - 2.5*ug*T;              // spin speed at the strike
  return {V, b: s0/(2.5*V)};
}
// Where the object ball goes after a cue ball arriving along dir at speed vc with spin ratio spin, meeting it so the line of
// centres is n: returns the object ball's departure direction and speed (and the cue ball's). One contact, no cloth.
function collide(dir, vc, spin, n){
  const d = v2.norm(dir);
  const a = {v: v2.mul(d, vc), w: [-d[1]*spin*vc/R, d[0]*spin*vc/R, 0]}, b = {v:[0,0], w:[0,0,0]};
  hitBalls(a, b, n);
  return {obDir: v2.norm(b.v), obSpeed: v2.len(b.v), cbV: a.v, cbW: a.w, obW: b.w};
}

const api = {R, G, C, makeTable, simulate, strike, arrive, strikeFor, collide, matRot, I3, muBall};
if(typeof module !== 'undefined' && module.exports) module.exports = api; else root.PoolEngine = api;
})(typeof window !== 'undefined' ? window : this);
