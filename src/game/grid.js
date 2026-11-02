// Grilla 2D de ocupación, en vez de un motor de físicas.
export class OccupancyGrid {
  constructor(width, depth, cell, radius) {
    this.width = width; this.depth = depth; this.cell = cell; this.radius = radius;
    this.w = Math.ceil(width / cell); this.h = Math.ceil(depth / cell);
    this.cells = new Uint8Array(this.w * this.h);
    this.boxes = [];
  }
  addBox(minX, maxX, minZ, maxZ, id) {
    const box = { minX, maxX, minZ, maxZ, id, enabled: true };
    this.boxes.push(box);
    return box;
  }
  // "Inflamos" cada caja con el radio del jugador: así el jugador se trata como un punto.
  rebuild() {
    this.cells.fill(0);
    const r = this.radius;
    for (const b of this.boxes) {
      if (!b.enabled) continue;
      const x0 = Math.max(0, Math.floor((b.minX - r) / this.cell));
      const x1 = Math.min(this.w - 1, Math.floor((b.maxX + r) / this.cell));
      const z0 = Math.max(0, Math.floor((b.minZ - r) / this.cell));
      const z1 = Math.min(this.h - 1, Math.floor((b.maxZ + r) / this.cell));
      for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) this.cells[z * this.w + x] = 1;
    }
  }
  blockedCell(cx, cz) {
    if (cx < 0 || cz < 0 || cx >= this.w || cz >= this.h) return true;
    return this.cells[cz * this.w + cx] === 1;
  }
  blocked(x, z) { return this.blockedCell(Math.floor(x / this.cell), Math.floor(z / this.cell)); }

  // Resolución por ejes separados: diagonal → solo X → solo Z.
  move(pos, dx, dz, slide = true) {
    if (!this.blocked(pos.x + dx, pos.z + dz)) { pos.x += dx; pos.z += dz; return 'free'; }
    if (!slide) return 'stuck';
    if (!this.blocked(pos.x + dx, pos.z)) { pos.x += dx; return 'slide-x'; }
    if (!this.blocked(pos.x, pos.z + dz)) { pos.z += dz; return 'slide-z'; }
    return 'stuck';
  }

  path(from, to) {
    const c = this.cell;
    const start = [Math.floor(from.x / c), Math.floor(from.z / c)];
    const goal = [Math.floor(to.x / c), Math.floor(to.z / c)];
    if (this.blockedCell(goal[0], goal[1])) return null;
    let result = null;
    for (const s of astar(this.w, this.h, (x, z) => this.blockedCell(x, z), start, goal)) result = s;
    this.lastSearch = result;
    if (!result?.path) return null;
    return result.path.map(([x, z]) => ({ x: (x + .5) * c, z: (z + .5) * c }));
  }
}

// A* como generador: el juego lo corre hasta el final y el pizarrón lo avanza paso a paso.
// weight = 0 equivale a Dijkstra; weight = 1 es A*; weight > 1 es A* "goloso".
export function* astar(w, h, isBlocked, start, goal, weight = 1) {
  const key = (x, z) => z * w + x;
  const octile = (x, z) => {
    const dx = Math.abs(x - goal[0]), dz = Math.abs(z - goal[1]);
    return (dx + dz + (Math.SQRT2 - 2) * Math.min(dx, dz)) * weight;
  };
  const g = new Map([[key(...start), 0]]);
  const parent = new Map();
  const closed = new Set();
  const open = new Map([[key(...start), { x: start[0], z: start[1], f: octile(...start) }]]);
  while (open.size) {
    let best = null, bestKey = null;
    for (const [k, n] of open) if (!best || n.f < best.f) { best = n; bestKey = k; }
    open.delete(bestKey); closed.add(bestKey);
    if (best.x === goal[0] && best.z === goal[1]) {
      const path = [[best.x, best.z]];
      let k = bestKey;
      while (parent.has(k)) { k = parent.get(k); path.unshift([k % w, Math.floor(k / w)]); }
      yield { open, closed, current: best, g, path, cost: g.get(bestKey) };
      return;
    }
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dz) continue;
      const nx = best.x + dx, nz = best.z + dz;
      if (nx < 0 || nz < 0 || nx >= w || nz >= h || isBlocked(nx, nz)) continue;
      if (dx && dz && (isBlocked(best.x + dx, best.z) || isBlocked(best.x, best.z + dz))) continue; // no cortar esquinas
      const nk = key(nx, nz);
      if (closed.has(nk)) continue;
      const tentative = g.get(bestKey) + (dx && dz ? Math.SQRT2 : 1);
      if (tentative < (g.get(nk) ?? Infinity)) {
        g.set(nk, tentative); parent.set(nk, bestKey);
        open.set(nk, { x: nx, z: nz, f: tentative + octile(nx, nz) });
      }
    }
    yield { open, closed, current: best, g, path: null };
  }
  yield { open, closed, current: null, g, path: null, failed: true };
}
