// Cut Trainer: the table in 3D (three.js), built from the engine's table definition, so what you see is what the balls hit.
// World units are the engine's: inches, z up, the cloth at z = 0. Lines, ghost balls, labels and the pocket ring stay in the
// SVG drawn over this canvas, through the same camera.
(function(root){
'use strict';
const T3 = root.THREE;
const COL = {cloth:0x24609c, shelf:0x1f5689, cushion:0x2569a8, nose:0x1a4f80, rail:0x3a2618, railEdge:0x2a1b11, hole:0x050505, diamond:0xeadcbf, room:0x15100c};

function make(canvas){
  if(!T3) return null;
  let renderer;
  const AA = (root.localStorage && (()=>{ try{ return JSON.parse(localStorage.getItem('cutreader-settings') || '{}').gfxAA; }catch(e){ return null; } })()) !== '0';   // antialiasing is fixed when the renderer is made
  try{ renderer = new T3.WebGLRenderer({canvas, antialias:AA, alpha:false, powerPreference:'high-performance'}); }catch(e){ return null; }
  renderer.setPixelRatio(Math.min(1.5, root.devicePixelRatio || 1));   // 1.5× is sharp enough and far cheaper than 2× on retina screens
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = T3.PCFSoftShadowMap;
  renderer.shadowMap.autoUpdate = false;   // shadows are only recomputed when the balls or the table change, not every frame
  const scene = new T3.Scene();
  scene.background = new T3.Color(COL.room);
  // the game draws the table mirrored (its screen-right is z × forward): mirror the world, and the camera with it, to match
  const world = new T3.Group(); world.scale.x = -1; scene.add(world);
  const camera = new T3.PerspectiveCamera(50, 1.5, 0.5, 2000);
  camera.up.set(0, 0, 1);
  let tableGroup = null, tableKey = '', W = 100, H = 50;
  const lights = new T3.Group(); world.add(lights);
  const sun = new T3.DirectionalLight(0xffffff, 0.75);
  sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048); sun.shadow.radius = 4; sun.shadow.bias = -0.0005;
  lights.add(sun, sun.target, new T3.HemisphereLight(0xfff6e8, 0x20160f, 0.75));
  const balls = {};          // id -> mesh
  const texCache = {};

  // ---------- the table ----------
  function build(tbl){
    const key = [tbl.W, tbl.H, tbl.mouth.join()].join('|');
    if(key === tableKey) return;
    tableKey = key; W = tbl.W; H = tbl.H; renderer.shadowMap.needsUpdate = true;
    if(tableGroup){ world.remove(tableGroup); tableGroup.traverse(o=>{ if(o.geometry) o.geometry.dispose(); }); }
    const g = tableGroup = new T3.Group(); world.add(g);
    const C = tbl.C, out = C.cushionWidth + C.railWidth, top = 1.6;
    const mat = c => new T3.MeshStandardMaterial({color:c, roughness:.9, metalness:0});
    // the light: from above, a little off to the side, covering the table for shadows
    sun.position.set(W*0.35, H*0.4, 160); sun.target.position.set(W/2, H/2, 0);
    const sc = sun.shadow.camera; sc.left = -W*0.8; sc.right = W*0.8; sc.top = H*0.8; sc.bottom = -H*0.8; sc.near = 50; sc.far = 260; sc.updateProjectionMatrix();

    // cloth: one sheet under everything, with the holes cut out
    const cloth = new T3.Shape([new T3.Vector2(-out, -out), new T3.Vector2(W+out, -out), new T3.Vector2(W+out, H+out), new T3.Vector2(-out, H+out)]);
    for(const P of tbl.pockets){ const h = new T3.Path(); h.absarc(P.hole[0], P.hole[1], P.holeR, 0, Math.PI*2, true); cloth.holes.push(h); }
    const clothMesh = new T3.Mesh(new T3.ShapeGeometry(cloth, 48), mat(COL.cloth));
    clothMesh.receiveShadow = true; g.add(clothMesh);

    // the holes: a dark well under each, with a floor
    for(const P of tbl.pockets){
      // the well's wall runs up to the rail top: only its inside is drawn, so the near side never hides the shelf
      const well = new T3.Mesh(new T3.CylinderGeometry(P.holeR, P.holeR*0.9, 8.6, 48, 1, true), new T3.MeshStandardMaterial({color:COL.hole, roughness:1, side:T3.BackSide}));
      well.rotation.x = Math.PI/2; well.position.set(P.hole[0], P.hole[1], -2.7); g.add(well);
      const floor = new T3.Mesh(new T3.CircleGeometry(P.holeR, 32), mat(COL.hole)); floor.position.set(P.hole[0], P.hole[1], -7); g.add(floor);
    }

    // the top surface (cushion tops and rails) at z = top: everything out to the rail's edge, less the playing area,
    // the pocket throats between the jaws, and the holes. Traced as one outline round the inside.
    const inner = [];
    const arcPts = (c, r, a0, a1, n) => { const pts = []; for(let i=0;i<=n;i++){ const a = a0 + (a1 - a0)*i/n; pts.push([c[0] + r*Math.cos(a), c[1] + r*Math.sin(a)]); } return pts; };
    const jawsAt = pt => tbl.segs.filter(s=>s.jaw && Math.abs(s.a[0]-pt[0]) < 1e-6 && Math.abs(s.a[1]-pt[1]) < 1e-6);
    // walk the noses in order round the table: each pocket sits between one nose's end and the next nose's start
    const order = orderNoses(tbl);
    for(let k=0; k<order.length; k++){
      const s = order[k], nx = order[(k+1) % order.length];
      inner.push(s.a, s.b);
      // the pocket between s.b and nx.a: down one jaw, round the hole (the long way, outside the table), up the other jaw
      const P = tbl.pockets.find(P=>P.points.some(p=>near(p, s.b)) && P.points.some(p=>near(p, nx.a)));
      if(!P) continue;
      const ja = jawsAt(s.b)[0], jb = jawsAt(nx.a)[0];
      const ea = ja ? ja.b : s.b, eb = jb ? jb.b : nx.a;
      let a0 = Math.atan2(ea[1]-P.hole[1], ea[0]-P.hole[0]), a1 = Math.atan2(eb[1]-P.hole[1], eb[0]-P.hole[0]);
      // go round the side away from the table (through the corner, or outward for a side pocket)
      const mid = Math.atan2(-P.into[1], -P.into[0]);
      const ccw = (x, y) => { let d = (y - x) % (Math.PI*2); if(d < 0) d += Math.PI*2; return d; };
      const sweep = ccw(a0, a1);
      a1 = ccw(a0, mid) < sweep ? a0 + sweep : a0 - (Math.PI*2 - sweep);
      inner.push(ea, ...arcPts(P.hole, P.holeR, a0, a1, 28), eb);
    }
    const topShape = new T3.Shape([new T3.Vector2(-out, -out), new T3.Vector2(W+out, -out), new T3.Vector2(W+out, H+out), new T3.Vector2(-out, H+out)]);
    const hole = new T3.Path(inner.map(p=>new T3.Vector2(p[0], p[1])));
    topShape.holes.push(hole);
    // the rail: wood over all of it, then the cushion tops in cushion blue along each nose, up to the jaws
    const wood = new T3.Mesh(new T3.ShapeGeometry(topShape, 8), new T3.MeshStandardMaterial({color:COL.rail, roughness:.6, metalness:0}));
    wood.position.z = top; wood.receiveShadow = true; g.add(wood);
    const cw = C.cushionWidth;
    for(const s of tbl.noses){
      const ja = jawsAt(s.a)[0], jb = jawsAt(s.b)[0], o = [-s.n[0]*cw, -s.n[1]*cw];
      const poly = [s.a, s.b, ...(jb ? [jb.b] : []), [s.b[0]+o[0], s.b[1]+o[1]], [s.a[0]+o[0], s.a[1]+o[1]], ...(ja ? [ja.b] : [])];
      const m = new T3.Mesh(new T3.ShapeGeometry(new T3.Shape(poly.map(p=>new T3.Vector2(p[0], p[1])))), mat(COL.cushion));
      m.position.z = top + 0.01; m.receiveShadow = true; g.add(m);
    }
    // cushion noses and jaw faces: a sloped face from the cloth up to the nose, then up to the top
    const profile = [[0.35, 0], [0, 1.25], [0.08, top]];
    const strip = (a, b, n, color) => {   // n: the face's outward normal (into the playing area / throat)
      const pos = [];
      for(let i=0;i<profile.length-1;i++){
        const [d0, z0] = profile[i], [d1, z1] = profile[i+1];
        const A0 = [a[0] - n[0]*d0, a[1] - n[1]*d0, z0], B0 = [b[0] - n[0]*d0, b[1] - n[1]*d0, z0];
        const A1 = [a[0] - n[0]*d1, a[1] - n[1]*d1, z1], B1 = [b[0] - n[0]*d1, b[1] - n[1]*d1, z1];
        pos.push(...A0, ...B0, ...B1, ...A0, ...B1, ...A1);
      }
      const geo = new T3.BufferGeometry(); geo.setAttribute('position', new T3.Float32BufferAttribute(pos, 3)); geo.computeVertexNormals();
      const m = new T3.Mesh(geo, new T3.MeshStandardMaterial({color, roughness:.9, side:T3.DoubleSide})); m.receiveShadow = true; g.add(m);
    };
    for(const s of tbl.segs){
      if(!s.jaw){ strip(s.a, s.b, s.n, COL.nose); continue; }
      const f = [s.b[0]-s.a[0], s.b[1]-s.a[1]], fl = Math.hypot(f[0], f[1]), fn = [-f[1]/fl, f[0]/fl];
      const face = (fn[0]*s.away[0] + fn[1]*s.away[1]) < 0 ? fn : [-fn[0], -fn[1]];   // the jaw faces into the throat
      strip(s.a, s.b, face, COL.nose);
    }
    // the rail's outer side, down to the floor
    const apron = [[-out,-out],[W+out,-out],[W+out,H+out],[-out,H+out]];
    for(let i=0;i<4;i++){
      const a = apron[i], b = apron[(i+1)%4];
      const geo = new T3.BufferGeometry(); geo.setAttribute('position', new T3.Float32BufferAttribute([a[0],a[1],top, b[0],b[1],top, b[0],b[1],-16, a[0],a[1],top, b[0],b[1],-16, a[0],a[1],-16], 3)); geo.computeVertexNormals();
      g.add(new T3.Mesh(geo, new T3.MeshStandardMaterial({color:COL.railEdge, roughness:.7, side:T3.DoubleSide})));
    }
    // diamonds
    const dm = new T3.MeshStandardMaterial({color:COL.diamond, roughness:.4}), dg = new T3.CircleGeometry(.4, 12);
    const dpos = [];
    for(const x of [1,2,3].map(i=>i*W/4)) for(const y of [-(cw + 1.6), H + cw + 1.6]) dpos.push([x, y]);
    for(const y of [1,2,3,5,6,7].map(i=>i*H/8)) for(const x of [-(cw + 1.6), W + cw + 1.6]) dpos.push([x, y]);
    for(const [x, y] of dpos){ const d = new T3.Mesh(dg, dm); d.position.set(x, y, top + 0.03); g.add(d); }
    // the head string, faint
    const hs = new T3.Mesh(new T3.PlaneGeometry(W, .12), new T3.MeshBasicMaterial({color:0xffffff, transparent:true, opacity:.1}));
    hs.position.set(W/2, H*0.75, 0.01); g.add(hs);
  }
  const near = (p, q) => Math.abs(p[0]-q[0]) < 1e-6 && Math.abs(p[1]-q[1]) < 1e-6;
  function orderNoses(tbl){   // the six noses in order round the table, each one's end at a pocket, the next one's start at the same pocket
    const L = tbl.noses.slice(), out = [L.shift()];
    while(L.length){
      const end = out[out.length-1].b, P = tbl.pockets.find(P=>P.points.some(p=>near(p, end)));
      const other = P.points.find(p=>!near(p, end)) || end;
      const i = L.findIndex(s=>near(s.a, other)); if(i < 0) break;
      out.push(L.splice(i, 1)[0]);
    }
    return out;
  }


  // ---------- balls ----------
  function ballTexture(kind, color, number, dots){
    const key = kind + color + number;
    if(texCache[key]) return texCache[key];
    const w = 512, h = 256, cv = document.createElement('canvas'); cv.width = w; cv.height = h;
    const x = cv.getContext('2d');
    if(kind === 'cb'){
      x.fillStyle = '#f4efe0'; x.fillRect(0, 0, w, h);
      const img = x.getImageData(0, 0, w, h), d = img.data;
      for(let j=0;j<h;j++) for(let i=0;i<w;i++){
        const phi = (i + .5)/w*Math.PI*2, th = (1 - (j + .5)/h)*Math.PI;   // three's sphere mapping
        const v = [-Math.cos(phi)*Math.sin(th), Math.cos(th), Math.sin(phi)*Math.sin(th)];
        for(const q of dots){ if(v[0]*q[0] + v[1]*q[1] + v[2]*q[2] > 0.985){ const k = (j*w + i)*4; d[k] = 200; d[k+1] = 16; d[k+2] = 46; } }
      }
      x.putImageData(img, 0, 0);
    } else {
      if(+number >= 9){   // a stripe: white, with a coloured band round the middle that the number sits on
        x.fillStyle = '#f4efe0'; x.fillRect(0, 0, w, h);
        x.fillStyle = color; x.fillRect(0, h*0.31, w, h*0.38);
      } else { x.fillStyle = color; x.fillRect(0, 0, w, h); }
      // the number spot sits at the texture's centre: local +x
      x.fillStyle = '#ffffff'; x.beginPath(); x.ellipse(w/2, h/2, w*0.072, h*0.145, 0, 0, Math.PI*2); x.fill();
      x.fillStyle = '#111'; x.font = `700 ${Math.round(h*0.17)}px Barlow Condensed, Arial Narrow, sans-serif`; x.textAlign = 'center'; x.textBaseline = 'middle';
      x.save(); x.translate(w/2, h/2); x.scale(0.5, 1); x.fillText(String(number), 0, h*0.01); x.restore();
    }
    const t = new T3.CanvasTexture(cv); t.anisotropy = 4;
    return texCache[key] = t;
  }
  const sphere = new T3.SphereGeometry(1, 48, 32);
  function ball(id, R){
    if(balls[id]) return balls[id];
    const m = new T3.Mesh(sphere, new T3.MeshStandardMaterial({roughness:.18, metalness:0}));
    m.scale.setScalar(R); m.castShadow = true; m.matrixAutoUpdate = false;
    world.add(m); return balls[id] = m;
  }
  // list: [{id, kind:'cb'|'ob', p, z, M (3x3, ball-local to world), base (3x3, texture frame to ball-local), color, number, dots, opacity}]
  let shadowKey = '';
  function setBalls(list, R){
    const seen = {}, sk = list.map(b=>b.id + (b.opacity ?? 1) + b.p[0].toFixed(2) + b.p[1].toFixed(2) + (b.z ?? 0).toFixed(2)).join('|');
    if(sk !== shadowKey){ shadowKey = sk; renderer.shadowMap.needsUpdate = true; }
    for(const b of list){
      const m = ball(b.id, R); seen[b.id] = 1;
      const tex = ballTexture(b.kind, b.color, b.number, b.dots);
      if(m.material.map !== tex){ m.material.map = tex; m.material.needsUpdate = true; }
      const op = b.opacity ?? 1;
      m.material.transparent = op < 1; m.material.opacity = op; m.material.depthWrite = op >= 1; m.castShadow = op >= 1;
      const M = mul3(b.M || ID, b.base || ID);
      m.matrix.set(M[0][0]*R, M[0][1]*R, M[0][2]*R, b.p[0], M[1][0]*R, M[1][1]*R, M[1][2]*R, b.p[1], M[2][0]*R, M[2][1]*R, M[2][2]*R, b.z, 0, 0, 0, 1);
      m.matrixWorldNeedsUpdate = true; m.visible = true;
    }
    for(const id in balls) if(!seen[id]) balls[id].visible = false;
  }
  const ID = [[1,0,0],[0,1,0],[0,0,1]];
  const mul3 = (A, B) => A.map(r=>[0,1,2].map(j=>r[0]*B[0][j] + r[1]*B[1][j] + r[2]*B[2][j]));

  // ---------- the target pocket: a yellow arrow floating over it, pointing down ----------
  function makeArrow(color){
    const g = new T3.Group(), mat = new T3.MeshStandardMaterial({color, emissive: new T3.Color(color).multiplyScalar(.35), roughness:.45, metalness:0});
    const head = new T3.Mesh(new T3.ConeGeometry(1.1, 1.8, 24), mat); head.rotation.x = -Math.PI/2; head.position.z = 0.9;   // tip at z = 0, pointing down
    const shaft = new T3.Mesh(new T3.CylinderGeometry(.42, .42, 2.2, 20), mat); shaft.rotation.x = Math.PI/2; shaft.position.z = 2.9;
    g.add(head, shaft); g.visible = false; world.add(g); return g;
  }
  const DOWN = new T3.Vector3(0, 0, -1);
  const arrows = {pocket: makeArrow(0xffd34d), zone: makeArrow(0x5be0c8)};
  function setArrow(a, which = 'pocket'){   // a: {p:[x, y], z} (the tip), or null
    const g = arrows[which]; g.visible = !!a;
    if(a){
      g.position.set(a.p[0], a.p[1], a.z);
      const d = a.dir || [0, 0, -1];   // the way the tip points (straight down when it floats over its target)
      g.quaternion.setFromUnitVectors(DOWN, new T3.Vector3(d[0], d[1], d[2]).normalize());
      g.rotateZ(a.spin || 0);
    }
  }

  // ---------- the cue ball's target zone, on the cloth (under the balls, so a ball sitting in it hides it) ----------
  const zone = new T3.Group(); world.add(zone); let zoneKey = '';
  function setZone(z){   // z: {c:[x, y], r} or null
    zone.visible = !!z; if(!z) return;
    const key = z.r.toFixed(2);
    if(key !== zoneKey){
      zoneKey = key; zone.children.slice().forEach(m=>{ zone.remove(m); m.geometry.dispose(); });
      const col = 0x5be0c8;
      const fill = new T3.Mesh(new T3.CircleGeometry(z.r, 64), new T3.MeshBasicMaterial({color: col, transparent: true, opacity: .16, depthWrite: false, side: T3.DoubleSide}));
      zone.add(fill);
      const dashMat = new T3.MeshBasicMaterial({color: col, transparent: true, opacity: .9, depthWrite: false, side: T3.DoubleSide});
      const n = Math.max(12, Math.round(2*Math.PI*z.r/1.6));   // dashes about 1" long with 0.6" gaps
      for(let i = 0; i < n; i++){ const a0 = i/n*2*Math.PI; zone.add(new T3.Mesh(new T3.RingGeometry(z.r - .22, z.r + .22, 6, 1, a0, 2*Math.PI/n*.62), dashMat)); }
    }
    zone.position.set(z.c[0], z.c[1], .03);
  }

  // ---------- frame ----------
  // cam: {E, f, focal}; vw, vh: the SVG viewBox size the camera's focal length is in
  function render(cam, vw, vh, pxW, pxH){
    if(canvas.width !== Math.round(pxW*renderer.getPixelRatio()) || canvas.height !== Math.round(pxH*renderer.getPixelRatio())) renderer.setSize(pxW, pxH, false);
    camera.aspect = vw/vh;
    camera.fov = 2*Math.atan((vh/2)/cam.focal)*180/Math.PI;
    camera.position.set(-cam.E[0], cam.E[1], cam.E[2]);
    camera.lookAt(-(cam.E[0] + cam.f[0]), cam.E[1] + cam.f[1], cam.E[2] + cam.f[2]);
    camera.updateProjectionMatrix();
    renderer.render(scene, camera);
  }
  // graphics settings: resolution (pixel ratio cap) and shadows ('soft', 'hard' or 'off')
  function setQuality(q){
    if(q.ratio) renderer.setPixelRatio(Math.min(q.ratio, root.devicePixelRatio || 1));
    if(q.shadows){
      renderer.shadowMap.enabled = q.shadows !== 'off';
      renderer.shadowMap.type = q.shadows === 'hard' ? T3.BasicShadowMap : T3.PCFSoftShadowMap;
      sun.castShadow = q.shadows !== 'off';
      scene.traverse(o=>{ if(o.material){ (Array.isArray(o.material) ? o.material : [o.material]).forEach(m=>m.needsUpdate = true); } });
      renderer.shadowMap.needsUpdate = true;
    }
  }
  return {build, setBalls, setArrow, setZone, setQuality, render, renderer};
}
root.Table3D = {make};
})(typeof window !== 'undefined' ? window : this);
