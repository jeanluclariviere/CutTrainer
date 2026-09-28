// Cut Trainer Live: looks for balls in a camera picture, off the main thread so the camera view stays smooth.
import {findBalls} from './ar-core.js';

// expected ball radius at a picture position, from a coarse grid the page sends along
function radiusFrom(grid){
  return (x, y) => {
    const gx = Math.max(0, Math.min(grid.nx - 1.001, (x - grid.x0) / grid.dx)), gy = Math.max(0, Math.min(grid.ny - 1.001, (y - grid.y0) / grid.dy));
    const i = Math.floor(gx), j = Math.floor(gy), fx = gx - i, fy = gy - j, v = (a, b) => grid.v[b*grid.nx + a];
    const r = v(i,j)*(1-fx)*(1-fy) + v(i+1,j)*fx*(1-fy) + v(i,j+1)*(1-fx)*fy + v(i+1,j+1)*fx*fy;
    return r > 0 ? r : 0;
  };
}
self.onmessage = e => {
  const {id, buf, w, h, poly, grid} = e.data;
  let balls = [];
  try{ balls = findBalls(new Uint8Array(buf), w, h, poly, radiusFrom(grid)); }catch(err){ balls = []; }
  self.postMessage({id, balls: balls.map(b => ({x: b.x, y: b.y, label: b.label, cue: !!b.cue, wf: b.wf || 0, conf: b.conf || 0}))});
};
