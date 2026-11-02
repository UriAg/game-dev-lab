import * as THREE from 'three/webgpu';
import { uniform, positionLocal, normalLocal, uv, time, sin, floor, mix, color, vec3, vertexColor, texture, positionWorld } from 'three/tsl';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { OccupancyGrid } from './grid.js';
import { uiStats } from './state.js';
import { LESSON_ORDER, LESSON_INDEX } from '../lessons/index.js';

export const ROOM = 10, COLS = 4, ROWS = 3, HEIGHT = 3.2, WALL = .3, CELL = .2, PLAYER_RADIUS = .3;
export const roomCenter = (col, row) => new THREE.Vector3(col * ROOM + ROOM / 2, 0, row * ROOM + ROOM / 2);

export function roomAt(x, z) {
  const col = Math.floor(x / ROOM), row = Math.floor(z / ROOM);
  return LESSON_ORDER.find((l) => l.col === col && l.row === row) ?? null;
}

function label(text, w = 2, sub = '', col = '#ff9a3c') {
  const c = document.createElement('canvas'); c.width = 512; c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#0b111c'; g.fillRect(0, 0, 512, 128);
  g.fillStyle = col; g.font = '700 46px "Chakra Petch", sans-serif'; g.textAlign = 'center'; g.fillText(text, 256, sub ? 58 : 80);
  if (sub) { g.fillStyle = '#9fb2c9'; g.font = '30px "IBM Plex Sans", sans-serif'; g.fillText(sub, 256, 104); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, w / 4), new THREE.MeshBasicNodeMaterial({ map: t, side: THREE.DoubleSide }));
  return m;
}

function makeArrow(col) {
  const g = new THREE.Group();
  const m = new THREE.MeshBasicNodeMaterial({ color: col });
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(.03, .03, 1, 12).translate(0, .5, 0), m);
  const head = new THREE.Mesh(new THREE.ConeGeometry(.09, .22, 16).translate(0, .11, 0), m);
  g.add(shaft, head);
  const up = new THREE.Vector3(0, 1, 0), dir = new THREE.Vector3();
  g.set = (x, z, len) => {
    const l = len ?? Math.hypot(x, z);
    g.visible = l > .02; if (!g.visible) return;
    shaft.scale.y = Math.max(.01, l - .2); head.position.y = Math.max(.01, l - .2);
    dir.set(x, 0, z).normalize(); g.quaternion.setFromUnitVectors(up, dir);
  };
  return g;
}

export function buildWorld(scene, floorMaps, robotOpt, robotRaw, horror, models) {
  const grid = new OccupancyGrid(COLS * ROOM, ROWS * ROOM, CELL, PLAYER_RADIUS);
  const pieces = [];
  const accent = new THREE.Color(), base = new THREE.Color();

  const box = (x, y, z, sx, sy, sz, col, solid = false) => {
    const g = new THREE.BoxGeometry(sx, sy, sz).translate(x, y, z).toNonIndexed();
    const n = g.attributes.position.count, cols = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) cols.set([col.r, col.g, col.b], i * 3);
    g.setAttribute('color', new THREE.BufferAttribute(cols, 3));
    pieces.push(g);
    if (solid) return grid.addBox(x - sx / 2, x + sx / 2, z - sz / 2, z + sz / 2);
  };

  const W = COLS * ROOM, D = ROWS * ROOM, wallCol = new THREE.Color('#2a3650'), trim = new THREE.Color('#ff9a3c');
  // Perímetro
  box(W / 2, HEIGHT / 2, 0, W + WALL, HEIGHT, WALL, wallCol, true);
  box(W / 2, HEIGHT / 2, D, W + WALL, HEIGHT, WALL, wallCol, true);
  box(0, HEIGHT / 2, D / 2, WALL, HEIGHT, D, wallCol, true);
  box(W, HEIGHT / 2, D / 2, WALL, HEIGHT, D, wallCol, true);

  const DOOR = 1.8, DOOR_H = 2.3, H_OFF = 3.7;
  // Paredes internas verticales: puerta en el centro de cada sala.
  for (let c = 1; c < COLS; c++) for (let r = 0; r < ROWS; r++) {
    const x = c * ROOM, z0 = r * ROOM, cz = z0 + ROOM / 2, seg = (ROOM - DOOR) / 2;
    box(x, HEIGHT / 2, z0 + seg / 2, WALL, HEIGHT, seg, wallCol, true);
    box(x, HEIGHT / 2, z0 + ROOM - seg / 2, WALL, HEIGHT, seg, wallCol, true);
    box(x, (DOOR_H + HEIGHT) / 2, cz, WALL, HEIGHT - DOOR_H, DOOR, wallCol);
  }
  // Paredes internas horizontales: puerta corrida hacia el este para dejarle lugar al pizarrón.
  for (let r = 1; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
    const z = r * ROOM, x0 = c * ROOM, cx = x0 + ROOM / 2 + H_OFF;
    const left = cx - DOOR / 2 - x0, right = x0 + ROOM - (cx + DOOR / 2);
    box(x0 + left / 2, HEIGHT / 2, z, left, HEIGHT, WALL, wallCol, true);
    box(x0 + ROOM - right / 2, HEIGHT / 2, z, right, HEIGHT, WALL, wallCol, true);
    box(cx, (DOOR_H + HEIGHT) / 2, z, DOOR, HEIGHT - DOOR_H, WALL, wallCol);
  }

  // Racks de servidores contra la pared sur: obstáculos reales para colisión y A*.
  const ledGeos = [];
  for (const l of LESSON_ORDER) {
    const c = roomCenter(l.col, l.row);
    accent.set(l.color);
    for (let i = 0; i < 0; i++) {
      const x = c.x - 3.9 + i * 1.5, z = c.z + 4.35;
      box(x, 1, z, 1.1, 2, .9, base.set('#161e2e'), true);
      for (let k = 0; k < 7; k++) {
        const g = new THREE.PlaneGeometry(.75, .05).translate(x, .35 + k * .24, z - .452).rotateY(0);
        const tmp = new THREE.BoxGeometry(.8, .045, .01).translate(x, .35 + k * .24, z - .455);
        ledGeos.push(tmp); g.dispose();
      }
    }
    // Marco del pizarrón
    box(c.x - 1, 1.75, c.z - 4.8, 4.3, 2.7, .08, trim);
    // Pedestal de la sala
    if (['stack', 'webgpu', 'compression', 'workers'].includes(l.id)) box(c.x + 2.6, .25, c.z - 1, 1.5, .5, 1.5, base.set('#46587e'), true);
  }

  const shell = mergeGeometries(pieces);
  shell.computeVertexNormals();
  const shellMat = new THREE.MeshStandardNodeMaterial({ roughness: .8, metalness: .05 });
  shellMat.colorNode = vertexColor();
  const shellMesh = new THREE.Mesh(shell, shellMat);
  scene.add(shellMesh);

  const ledMat = new THREE.MeshBasicNodeMaterial();
  const blink = sin(time.mul(2.4).add(positionWorld.x.mul(7)).add(positionWorld.y.mul(23))).mul(.5).add(.5);
  ledMat.colorNode = mix(color('#123a44'), color('#45d6c4'), blink);
  if (ledGeos.length) scene.add(new THREE.Mesh(mergeGeometries(ledGeos), ledMat));

  // Piso y techo. El piso usa la textura KTX2 real del pipeline.
  for (const t of Object.values(floorMaps)) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(COLS * 6, ROWS * 6); t.anisotropy = 8; }
  const floorMat = new THREE.MeshStandardNodeMaterial({ ...floorMaps, roughness: 1, metalness: 0, color: '#a8a39b' });
  const floorMesh = new THREE.Mesh(new THREE.PlaneGeometry(W, D).rotateX(-Math.PI / 2).translate(W / 2, 0, D / 2), floorMat);
  scene.add(floorMesh);
  const ceil = new THREE.Mesh(new THREE.PlaneGeometry(W, D).rotateX(Math.PI / 2).translate(W / 2, HEIGHT, D / 2),
    new THREE.MeshStandardNodeMaterial({ color: '#10151f', roughness: 1 }));
  scene.add(ceil);
  for (const l of LESSON_ORDER) { const c = roomCenter(l.col, l.row); fixture(scene, c.x - 1, c.z - 3.6, l.color); fixture(scene, c.x, c.z, l.color, .5); }

  // Carteles de puerta: sobre la puerta que lleva a la sala siguiente del recorrido.
  LESSON_ORDER.forEach((l, i) => {
    const next = LESSON_ORDER[i + 1]; if (!next) return;
    const c = roomCenter(l.col, l.row), sign = label(`Sigue: sala ${String(i + 2).padStart(2, '0')}`, 1.8, next.title, next.color), off = ROOM / 2 - WALL / 2 - .02;
    if (next.row > l.row) { sign.position.set(c.x + H_OFF, 2.75, c.z + off); sign.rotation.y = Math.PI; }
    else { const dir = Math.sign(next.col - l.col); sign.position.set(c.x + dir * off, 2.75, c.z); sign.rotation.y = -dir * Math.PI / 2; }
    scene.add(sign);
  });

  // Pizarrones: cada uno tiene su textura propia con portada y espeja la demo al abrir la lección.
  const boards = {};
  for (const l of LESSON_ORDER) {
    const c = roomCenter(l.col, l.row);
    const cv = document.createElement('canvas'); cv.width = 960; cv.height = 600;
    drawCover(cv, l);
    const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
    const mat = new THREE.MeshBasicNodeMaterial({ map: tex });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(4, 2.5), mat);
    mesh.scale.y = 1;
    mesh.position.set(c.x - 1, 1.75, c.z - 4.75);
    scene.add(mesh);
    const ring = new THREE.Mesh(new THREE.RingGeometry(.9, 1, 48).rotateX(-Math.PI / 2),
      new THREE.MeshBasicNodeMaterial({ color: l.color, transparent: true, opacity: .75 }));
    ring.position.set(c.x - 1, .02, c.z - 2.6);
    scene.add(ring);
    boards[l.id] = { mesh, mat, tex, cover: cv, center: mesh.position.clone(), standAt: new THREE.Vector3(c.x - 1, 0, c.z - 1.6) };
  }

  // Puerta dinámica entre Colisiones y A*: abre y cierra celdas de la grilla en vivo.
  const doorX = 3 * ROOM, doorZ = 1 * ROOM + ROOM / 2;
  const doorBox = grid.addBox(doorX - WALL / 2, doorX + WALL / 2, doorZ - DOOR / 2, doorZ + DOOR / 2, 'door');
  doorBox.enabled = false;
  const doorMesh = new THREE.Mesh(new THREE.BoxGeometry(.12, DOOR_H, DOOR), new THREE.MeshStandardNodeMaterial({ color: '#c04a5b', roughness: .5 }));
  doorMesh.position.set(doorX, DOOR_H / 2, doorZ - DOOR);
  scene.add(doorMesh);
  grid.rebuild();

  const pedestals = new Set();
  const exhibits = buildExhibits(scene, grid, robotOpt, robotRaw, doorBox, doorMesh, doorZ, DOOR, horror, pedestals, models);
  grid.rebuild();
  return { grid, boards, exhibits, floorMesh, shellMesh, pedestals };
}

// Normaliza un modelo: el grupo devuelto tiene su origen abajo y al centro, y la medida pedida en metros.
function prop(gltf, { w, h }) {
  const o = gltf.scene.clone(true); o.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(o), size = box.getSize(new THREE.Vector3()), mid = box.getCenter(new THREE.Vector3()), k = h ? h / size.y : w / size.x;
  o.scale.multiplyScalar(k); o.position.set(-mid.x * k, -box.min.y * k, -mid.z * k);
  const g = new THREE.Group(); g.add(o); return g;
}

// Foco del techo: el círculo que se ve encima de cada luz.
function fixture(scene, x, z, col, radius = .22) {
  const m = new THREE.Mesh(new THREE.CircleGeometry(radius, 24).rotateX(Math.PI / 2), new THREE.MeshBasicNodeMaterial({ color: new THREE.Color(col).lerp(new THREE.Color('#fff'), .65).multiplyScalar(1.6) }));
  m.position.set(x, HEIGHT - .01, z); scene.add(m);
}

export function drawCover(cv, l) {
  const g = cv.getContext('2d');
  g.fillStyle = '#0d1420'; g.fillRect(0, 0, 960, 600);
  g.strokeStyle = '#1b2638'; g.lineWidth = 1;
  for (let x = 0; x <= 960; x += 40) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, 600); g.stroke(); }
  for (let y = 0; y <= 600; y += 40) { g.beginPath(); g.moveTo(0, y); g.lineTo(960, y); g.stroke(); }
  g.fillStyle = l.color; g.font = '700 30px "JetBrains Mono", monospace'; g.fillText(`SALA ${String(LESSON_INDEX[l.id] + 1).padStart(2, '0')}`, 60, 110);
  g.fillStyle = '#eef3fa'; g.font = '700 74px "Chakra Petch", sans-serif';
  wrap(g, l.title, 60, 210, 840, 84);
  g.fillStyle = '#9fb2c9'; g.font = '32px "IBM Plex Sans", sans-serif'; wrap(g, l.tagline, 60, 420, 840, 44);
}
function wrap(g, text, x, y, max, lh) {
  let line = '', yy = y;
  for (const w of text.split(' ')) {
    if (g.measureText(line + w).width > max) { g.fillText(line, x, yy); line = ''; yy += lh; }
    line += w + ' ';
  }
  g.fillText(line, x, yy);
}

function buildExhibits(scene, grid, robotOpt, robotRaw, doorBox, doorMesh, doorZ, DOOR, horror, pedestals, models) {
  // Pantalla de pared con imagen en vivo sobre el modelo de TV.
  const screen = (x, y, z, ry, w) => { const tv = prop(models.tv, { w }), cv = document.createElement('canvas'); cv.width = 512; cv.height = 298; tv.position.set(x, y, z); tv.rotation.y = ry; scene.add(tv);
    const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; const m = new THREE.Mesh(new THREE.PlaneGeometry(w * .93, w * .54), new THREE.MeshBasicNodeMaterial({ map: tex })); m.position.set(0, w * .3, .05); tv.add(m);
    const g = cv.getContext('2d'); return { draw(fn) { g.fillStyle = '#07101c'; g.fillRect(0, 0, cv.width, cv.height); fn(g, cv.width, cv.height); tex.needsUpdate = true; } }; };
  const pedestal = (id) => { const l = LESSON_ORDER[LESSON_INDEX[id]], p = roomCenter(l.col, l.row).add(new THREE.Vector3(2.6, .5, -1)); if (!pedestals.has(id)) { pedestals.add(id); fixture(scene, p.x, p.z, l.color); } return p; };
  const robot = (src = robotOpt) => { const m = src.clone(); m.traverse((o) => { o.frustumCulled = true; }); return m; };
  const ex = {};

  // Obstáculo real: se dibuja y entra en la grilla de colisión.
  const solid = (x0, x1, z0, z1, h, col) => { const m = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0, h, z1 - z0), new THREE.MeshStandardNodeMaterial({ color: col, roughness: .7 })); m.position.set((x0 + x1) / 2, h / 2, (z0 + z1) / 2); scene.add(m); grid.addBox(x0, x1, z0, z1, 'prop'); return m; };

  // Lobby: capas del stack
  { const p = pedestal('stack'); const group = new THREE.Group(); group.position.copy(p);
    const layers = [['Astro', 'HTML estático + islas', '#ff9a3c'], ['Preact + signals', 'interfaz reactiva', '#45d6c4'], ['Three.js WebGPU', 'el mundo 3D', '#8f7bff']];
    const parts = [];
    layers.forEach(([a, b, col], i) => {
      const s = new THREE.Mesh(new THREE.BoxGeometry(1.2 - i * .12, .22, 1.2 - i * .12), new THREE.MeshStandardNodeMaterial({ color: col, roughness: .4 }));
      s.position.y = .25 + i * .4; group.add(s);
      const lb = label(a, 1.6, b); lb.position.set(-1.5, .4 + i * .45, 0); lb.rotation.y = -Math.PI / 3; group.add(lb); parts.push([s, lb, i]);
    });
    scene.add(group);
    const stats = screen(p.x, 1.25, p.z - 3.8, 0, 1.3); let spread = 0, tick = 0;
    ex.stack = { update(dt, t, game) { group.children.forEach((c, i) => { if (i < 3 * 2 && c.geometry.type === 'BoxGeometry') c.rotation.y = t * .3; });
      const near = Math.hypot(game.pos.x - p.x, game.pos.z - p.z) < 3 ? 1 : 0; spread += (near - spread) * (1 - Math.exp(-dt * 5));
      for (const [s, lb, i] of parts) { s.position.y = .25 + i * .4 + spread * i * .45; lb.position.y = .4 + i * .45 + spread * i * .45; }
      if (tick++ % 20 === 0) stats.draw((g, w, h) => { g.fillStyle = '#9fb2c9'; g.font = '26px "IBM Plex Sans", sans-serif'; g.fillText('Escrituras al signal', 30, 60); g.fillText('Renders de la interfaz', 30, 190); g.font = '700 70px "JetBrains Mono", monospace'; g.fillStyle = '#45d6c4'; g.fillText(String(uiStats.signalUpdates), 30, 135); g.fillStyle = '#ff9a3c'; g.fillText(String(uiStats.appRenders), 30, 265); }); } };
  }

  // Teclas WASD que se hunden de verdad
  { const p = pedestal('input'), keys = {}, offKey = '#1f2a42';
    solid(p.x - .9, p.x + .9, p.z - .6, p.z + .6, .9, '#2b3a5c');
    const panel = new THREE.Group(); panel.position.set(p.x, 1.02, p.z); panel.rotation.x = .35; scene.add(panel);
    const top = new THREE.Mesh(new THREE.BoxGeometry(1.7, .08, 1.15), new THREE.MeshStandardNodeMaterial({ color: '#1c2740', roughness: .5 })); panel.add(top);
    [['KeyW', 0, -.28], ['KeyA', -.5, .26], ['KeyS', 0, .26], ['KeyD', .5, .26]].forEach(([code, x, z]) => {
      const k = new THREE.Mesh(new THREE.BoxGeometry(.44, .14, .44), new THREE.MeshStandardNodeMaterial({ color: offKey, roughness: .4 }));
      k.position.set(x, .1, z); panel.add(k);
      const cv = document.createElement('canvas'); cv.width = cv.height = 256; const g = cv.getContext('2d'); g.fillStyle = '#ffffff'; g.font = '700 190px "Chakra Petch", sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(code.slice(3), 128, 138);
      const letter = new THREE.CanvasTexture(cv); letter.colorSpace = THREE.SRGBColorSpace;
      const lb = new THREE.Mesh(new THREE.PlaneGeometry(.38, .38).rotateX(-Math.PI / 2), new THREE.MeshBasicNodeMaterial({ map: letter, transparent: true })); lb.position.y = .072; k.add(lb);
      keys[code] = k;
    });
    const tint = new THREE.Color(), bars = [], moves = screen(p.x, 1.25, p.z - 3.8, 0, 1.3);
    ex.input = { update(dt, t, game) { bars.push(game.input.screenX); game.input.screenX = 0; if (bars.length > 90) bars.shift(); moves.draw((g, w, h) => { g.fillStyle = '#9fb2c9'; g.font = '24px "JetBrains Mono", monospace'; g.fillText('movementX', 20, 34); g.fillStyle = '#45d6c4'; bars.forEach((v, i) => { const b = Math.max(-120, Math.min(120, v * 1.5)); g.fillRect(i * 5.6, b > 0 ? 170 - b : 170, 4, Math.abs(b)); }); });
      const k = 1 - Math.exp(-dt * 25); for (const c in keys) { const on = game.input.keys.has(c); keys[c].position.y += ((on ? .05 : .1) - keys[c].position.y) * k; keys[c].material.color.lerp(tint.set(on ? '#ff9a3c' : offKey), k); } } };
  }

  // Yaw: robot que copia tu cámara, con las flechas sin/cos sobre el piso
  { const p = pedestal('yaw'); p.y = 0; const r = robot(); r.position.copy(p); scene.add(r);
    const cv = document.createElement('canvas'); cv.width = cv.height = 1024; const g = cv.getContext('2d'), mid = 512, col = '#ff5d73';
    g.strokeStyle = col; g.fillStyle = col; g.lineWidth = 8; for (const R of [490, 360]) { g.beginPath(); g.arc(mid, mid, R, 0, 7); g.stroke(); }
    for (let i = 0; i < 36; i++) { const a = i / 36 * Math.PI * 2, r0 = i % 9 === 0 ? 330 : 440; g.beginPath(); g.moveTo(mid + Math.sin(a) * r0, mid - Math.cos(a) * r0); g.lineTo(mid + Math.sin(a) * 488, mid - Math.cos(a) * 488); g.stroke(); }
    g.font = '700 84px "Chakra Petch", sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; [['N', 0, -1], ['S', 0, 1], ['+X', 1, 0], ['-X', -1, 0]].forEach(([t, dx, dz]) => g.fillText(t, mid + dx * 250, mid + dz * 250));
    const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
    const rose = new THREE.Mesh(new THREE.PlaneGeometry(3.8, 3.8).rotateX(-Math.PI / 2), new THREE.MeshBasicNodeMaterial({ map: tex, transparent: true, opacity: .8 })); rose.position.set(p.x, .021, p.z); scene.add(rose);
    const f = makeArrow('#ff9a3c'), sx = makeArrow('#45d6c4'), cz = makeArrow('#ff5d73');
    for (const a of [f, sx, cz]) { a.position.set(p.x, .04, p.z); scene.add(a); }
    let shown = 0;
    ex.yaw = { update(dt, t, game) { const goal = game.demoYaw ?? game.yaw, turn = Math.atan2(Math.sin(goal - shown), Math.cos(goal - shown)); shown += turn * (1 - Math.exp(-dt * 14)); const y = shown, L = 1.7; r.rotation.y = y + Math.PI;
      const fx = -Math.sin(y) * L, fz = -Math.cos(y) * L;
      f.set(fx, fz); sx.set(fx, 0); cz.set(0, fz); } };
  }

  // Suavizado: tres cubos persiguen el mismo objetivo
  { const p = pedestal('smoothing'), cx = p.x - 2.5, names = [['#ff5d73', 'sin suavizado'], ['#8f7bff', 'lerp fijo a 15 FPS'], ['#45d6c4', 'exponencial']];
    const track = new THREE.Mesh(new THREE.PlaneGeometry(8.6, 2).rotateX(-Math.PI / 2), new THREE.MeshStandardNodeMaterial({ color: '#23262e', roughness: .9 })); track.position.set(cx, .012, p.z + 2.75); scene.add(track);
    for (const dz of [-.33, .33]) { const m = new THREE.Mesh(new THREE.PlaneGeometry(8.6, .03).rotateX(-Math.PI / 2), new THREE.MeshBasicNodeMaterial({ color: '#d8dde6' })); m.position.set(cx, .018, p.z + 2.75 + dz); scene.add(m); }
    const flag = new THREE.Mesh(new THREE.PlaneGeometry(.12, 2).rotateX(-Math.PI / 2), new THREE.MeshBasicNodeMaterial({ color: '#ffd34d' })); flag.position.set(cx, .02, p.z + 2.75); scene.add(flag);
    const cubes = names.map(([col, n], i) => { const z = p.z + 2.09 + i * .66; const m = new THREE.Mesh(new THREE.BoxGeometry(.5, .3, .36), new THREE.MeshStandardNodeMaterial({ color: col })); m.position.set(cx - 3.9, .16, z); scene.add(m); const lb = label(n, 1.5, '', col); lb.position.set(cx - 3.4, .55, z); lb.rotation.y = Math.PI; scene.add(lb); return { m, x: -3.9, acc: 0 }; });
    let target = 3.9, clock = 0;
    ex.smoothing = { update(dt) { clock += dt; if (clock > 3.2) { clock = 0; target = -target; }
      cubes[0].x = target;
      cubes[1].acc += dt; if (cubes[1].acc > 1 / 15) { cubes[1].acc = 0; cubes[1].x += (target - cubes[1].x) * .2; }
      cubes[2].x += (target - cubes[2].x) * (1 - Math.exp(-dt * 5));
      for (const c of cubes) c.m.position.x = cx + c.x; flag.position.x = cx + target; } };
  }

  // Colisión: la grilla real proyectada sobre el piso
  { const l = LESSON_ORDER[LESSON_INDEX.collision]; const c0 = roomCenter(l.col, l.row);
    // Depósito: cajones, una columna fina y un muro para probar el deslizamiento diagonal.
    const crate = (x, z, y = 0) => { const m = prop(models.crate, { h: .6 }); m.position.set(c0.x + x, y, c0.z + z); scene.add(m); };
    [[1.7, -2.1], [2.3, -2.1], [1.7, -1.5], [2.3, -1.5]].forEach(([x, z]) => crate(x, z)); crate(2, -1.8, .6);
    [-2.1, -1.5, -.9, -.3].forEach((x) => crate(x, 1.3)); crate(-1.8, 1.3, .6); crate(-.6, 1.3, .6);
    grid.addBox(c0.x + 1.4, c0.x + 2.6, c0.z - 2.4, c0.z - 1.2, 'prop'); grid.addBox(c0.x - 2.4, c0.x, c0.z + 1, c0.z + 1.6, 'prop'); solid(c0.x + 1, c0.x + 1.4, c0.z + .4, c0.z + .8, HEIGHT, '#46587e');
    // Palanca junto a la puerta oeste: cierra la puerta sin abrir el panel.
    const leverPos = new THREE.Vector3(doorMesh.position.x + WALL / 2 + .04, 1.15, doorZ + DOOR / 2 + .55), plate = new THREE.Mesh(new THREE.BoxGeometry(.06, .5, .3), new THREE.MeshStandardNodeMaterial({ color: '#33415f' })), handle = new THREE.Group(), stick = new THREE.Mesh(new THREE.BoxGeometry(.05, .4, .05).translate(0, .2, 0), new THREE.MeshBasicNodeMaterial({ color: '#ffd34d' }));
    plate.position.copy(leverPos); handle.position.copy(leverPos); handle.add(stick); scene.add(plate, handle); ex.lever = { pos: leverPos, handle };
    grid.rebuild();
    const cv = document.createElement('canvas'); cv.width = cv.height = 50 * 8;
    const tex = new THREE.CanvasTexture(cv); tex.magFilter = THREE.NearestFilter; tex.colorSpace = THREE.SRGBColorSpace;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(ROOM, ROOM).rotateX(-Math.PI / 2), new THREE.MeshBasicNodeMaterial({ map: tex, transparent: true, opacity: .55 }));
    m.position.set(c0.x, .025, c0.z); scene.add(m);
    const paint = () => { const g = cv.getContext('2d'); g.clearRect(0, 0, 400, 400);
      const x0 = l.col * ROOM / CELL, z0 = l.row * ROOM / CELL;
      for (let z = 0; z < 50; z++) for (let x = 0; x < 50; x++) {
        g.fillStyle = grid.blockedCell(x0 + x, z0 + z) ? 'rgba(255,93,115,.85)' : 'rgba(69,214,196,.08)';
        g.fillRect(x * 8 + .5, z * 8 + .5, 7, 7);
      } tex.needsUpdate = true; };
    paint();
    let doorT = 0;
    ex.collision = { setDoor(closed) { doorBox.enabled = closed; grid.rebuild(); paint(); }, get doorClosed() { return doorBox.enabled; },
      update(dt) { doorT += ((doorBox.enabled ? 1 : 0) - doorT) * (1 - Math.exp(-dt * 8)); doorMesh.position.z = doorZ - DOOR * (1 - doorT); } };
  }

  // A*: un personaje que te persigue con el pathfinding real
  { const l = LESSON_ORDER[LESSON_INDEX.astar]; const home = roomCenter(l.col, l.row); const r = horror.scene; r.traverse((o) => { o.frustumCulled = false; if (o.material) o.material.metalness = 0; }); r.position.set(home.x + 2.6, 0, home.z + 2); scene.add(r);
    // Muros bajos: tapan el paso pero dejan verla venir.
    const lowWall = '#5d6b5f'; solid(home.x + 1, home.x + 1.4, home.z - 2, home.z + 2, 1.1, lowWall); solid(home.x - 2.4, home.x + 1, home.z + 1.6, home.z + 2, 1.1, lowWall); solid(home.x - 3.4, home.x - 3, home.z - .8, home.z + 1, 1.1, lowWall);
    grid.rebuild();
    const mixer = new THREE.AnimationMixer(r), run = mixer.clipAction(horror.animations[0]).play(); let runW = 0;
    const dotGeo = new THREE.SphereGeometry(.06, 8, 8), dots = new THREE.InstancedMesh(dotGeo, new THREE.MeshBasicNodeMaterial({ color: '#ffd34d' }), 120);
    dots.count = 0; dots.frustumCulled = false; scene.add(dots);
    const cells = document.createElement('canvas'); cells.width = cells.height = 400; const cellTex = new THREE.CanvasTexture(cells); cellTex.magFilter = THREE.NearestFilter; cellTex.colorSpace = THREE.SRGBColorSpace;
    const cellMesh = new THREE.Mesh(new THREE.PlaneGeometry(ROOM, ROOM).rotateX(-Math.PI / 2), new THREE.MeshBasicNodeMaterial({ map: cellTex, transparent: true, opacity: .55 })); cellMesh.position.set(home.x, .024, home.z); scene.add(cellMesh);
    const paintSearch = () => { const g = cells.getContext('2d'), s = grid.lastSearch; g.clearRect(0, 0, 400, 400); if (!s) return; const x0 = l.col * ROOM / CELL, z0 = l.row * ROOM / CELL, w = grid.w, dot = (k, col) => { const x = k % w - x0, z = Math.floor(k / w) - z0; if (x >= 0 && x < 50 && z >= 0 && z < 50) { g.fillStyle = col; g.fillRect(x * 8 + .5, z * 8 + .5, 7, 7); } }; for (const k of s.closed) dot(k, 'rgba(109,179,255,.9)'); for (const k of s.open.keys()) dot(k, 'rgba(92,214,120,.9)'); cellTex.needsUpdate = true; };
    const dummy = new THREE.Object3D(); let path = [], timer = 0, i = 0;
    ex.astar = { lastCount: 0, always: false, update(dt, t, game) {
      timer -= dt;
      if (timer <= 0) { timer = .6; const started = performance.now(); path = grid.path(r.position, game.pos) ?? []; ex.astar.lastMs = performance.now() - started; ex.astar.lastCount = path.length; i = 1; paintSearch();
        dots.count = Math.min(120, path.length); path.slice(0, 120).forEach((n, k) => { dummy.position.set(n.x, .05, n.z); dummy.updateMatrix(); dots.setMatrixAt(k, dummy.matrix); }); dots.instanceMatrix.needsUpdate = true; }
      const n = path[Math.min(i + 3, path.length - 1)];
      const chasing = n && path.length > 7;
      if (chasing) { const dx = n.x - r.position.x, dz = n.z - r.position.z, d = Math.hypot(dx, dz) || 1;
        r.position.x += dx / d * 2.4 * dt; r.position.z += dz / d * 2.4 * dt; r.rotation.y = Math.atan2(dx, dz);
        if (Math.hypot(path[i].x - r.position.x, path[i].z - r.position.z) < .3) i = Math.min(i + 1, path.length - 1); }
      // Al frenar, el peso de la animación baja a 0 y el mixer vuelve solo a la pose de reposo del modelo.
      runW += ((chasing ? 1 : 0) - runW) * (1 - Math.exp(-dt * 6)); run.setEffectiveWeight(runW); mixer.update(dt * .6); } };
  }

  // TSL: esfera con shader programable desde sliders
  { const p = pedestal('webgpu'); const u = { amp: uniform(.08), freq: uniform(9), speed: uniform(1.6), mixA: uniform(.5) };
    const mat = new THREE.MeshStandardNodeMaterial({ roughness: .3, metalness: .2 });
    const phase = uniform(0), wave = sin(positionLocal.y.mul(u.freq).add(phase));
    mat.positionNode = positionLocal.add(normalLocal.mul(wave.mul(u.amp)));
    mat.colorNode = mix(color('#ff9a3c'), color('#45d6c4'), wave.mul(.5).add(.5).mul(u.mixA.mul(2)).clamp());
    const s = new THREE.Mesh(new THREE.SphereGeometry(.55, 96, 64), mat); s.position.set(p.x, p.y + .75, p.z); scene.add(s);
    ex.webgpu = { u, update(dt, t) { s.rotation.y = t * .25; phase.value += dt * u.speed.value; } };
  }

  // Compresión: original contra comprimido, con cuantización en vivo por shader
  { const p = pedestal('compression'); const bits = uniform(14), tilt = .18, arm = 1.25, topY = p.y + 1.7, metalBar = new THREE.MeshStandardNodeMaterial({ color: '#b9c3d6', roughness: .35, metalness: .6 });
    const bar = (w, h, d, x, y, z, rz = 0) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), metalBar); m.position.set(x, y, z); m.rotation.z = rz; scene.add(m); };
    bar(.12, 1.7, .12, p.x, p.y + .85, p.z); bar(2.6, .07, .07, p.x, topY, p.z, tilt);
    const ends = [-1, 1].map((d) => ({ x: p.x + d * arm * Math.cos(tilt), y: topY + d * arm * Math.sin(tilt) }));
    const plates = ends.map((e) => { const y = e.y - .95; bar(.03, .95, .03, e.x, e.y - .475, p.z); const d = new THREE.Mesh(new THREE.CylinderGeometry(.42, .42, .04, 32), metalBar); d.position.set(e.x, y, p.z); scene.add(d); return { x: e.x, y: y + .02 }; });
    const b = robot(); b.scale.setScalar(.42); b.position.set(plates[1].x, plates[1].y, p.z); b.rotation.y = Math.PI; scene.add(b);
    const steps = uniform(16384);
    b.traverse((o) => { if (o.isMesh) { const src = o.material; const m = new THREE.MeshStandardNodeMaterial({ map: src.map, roughness: .45, metalness: .6 }); m.positionNode = floor(positionLocal.div(2).add(.5).mul(steps)).div(steps).sub(.5).mul(2); o.material = m; } });
    const la = label('4,13 MB', 1.5, 'original', '#ff5d73'), lb = label('1,11 MB', 1.5, 'comprimido', '#5cd678');
    la.position.set(plates[0].x - .3, 2.7, p.z); lb.position.set(plates[1].x + .3, 2.7, p.z); scene.add(la, lb);
    let asked = false;
    ex.compression = { bits, setBits(n) { steps.value = 2 ** n; }, update() { if (asked) return; asked = true; robotRaw().then((src) => { const a = robot(src); a.scale.setScalar(.42); a.position.set(plates[0].x, plates[0].y, p.z); a.rotation.y = Math.PI; scene.add(a); }); } };
  }

  // Workers: este cubo gira en el hilo principal, así que se congela si lo bloqueás.
  { const p = pedestal('workers'); const m = new THREE.Mesh(new THREE.BoxGeometry(.7, .7, .7), new THREE.MeshStandardNodeMaterial({ color: '#8f7bff', roughness: .3 }));
    m.position.set(p.x, p.y + .75, p.z); scene.add(m);
    // Sala de máquinas: el rack se enciende y los pulsos viajan mientras trabaja el worker.
    const c = roomCenter(LESSON_ORDER[LESSON_INDEX.workers].col, LESSON_ORDER[LESSON_INDEX.workers].row), rackA = prop(models.rack, { h: 2.1 }), rackB = rackA.clone(); rackA.position.set(c.x - 3.05, 0, c.z + 4.3); rackB.position.set(c.x - 2.2, 0, c.z + 4.3); rackA.rotation.y = rackB.rotation.y = Math.PI; rackA.traverse((o) => { if (o.material) o.material.metalness = 0; }); scene.add(rackA, rackB); grid.addBox(c.x - 3.6, c.x - 1.65, c.z + 3.75, c.z + 4.85, 'rack');
    const led = new THREE.MeshBasicNodeMaterial({ color: '#33415f' }), strip = new THREE.Mesh(new THREE.BoxGeometry(1.8, .08, .04), led); strip.position.set(c.x - 2.625, 2.2, c.z + 3.74); scene.add(strip);
    const pulse = new THREE.Mesh(new THREE.SphereGeometry(.08, 12, 12), new THREE.MeshBasicNodeMaterial({ color: '#ff9a3c' })), pulses = [0, 1, 2, 3, 4, 5].map(() => { const q = pulse.clone(); q.visible = false; scene.add(q); return q; }), from = new THREE.Vector3(p.x, .1, p.z + .8), to = new THREE.Vector3(c.x - 2.625, .1, c.z + 3.6);
    const duct = new THREE.Mesh(new THREE.BoxGeometry(from.distanceTo(to), .02, .22), new THREE.MeshStandardNodeMaterial({ color: '#30384a', roughness: .5, metalness: .4 })); duct.position.copy(from).lerp(to, .5).setY(.012); duct.rotation.y = -Math.atan2(to.z - from.z, to.x - from.x); scene.add(duct);
    const times = screen(c.x + 1.8, .9, c.z + 4.8, Math.PI, 2.6), params = LESSON_ORDER[LESSON_INDEX.workers].params, history = []; let tick = 0;
    ex.workers = { update(dt, t, game) { m.rotation.x = t * 1.2; m.rotation.y = t * 1.8; const busy = !!params.busy; led.color.set(busy ? '#ff9a3c' : '#33415f');
      pulses.forEach((q, i) => { q.visible = busy; q.position.lerpVectors(from, to, (t * .6 + i / 6) % 1); });
      history.push(dt * 1000); if (history.length > 100) history.shift();
      if (tick++ % 4) return; times.draw((g, w, h) => { g.fillStyle = '#9fb2c9'; g.font = '24px "JetBrains Mono", monospace'; g.fillText('Tiempo de cada frame (ms)', 20, 34); g.strokeStyle = '#ffd34d'; g.setLineDash([6, 6]); g.beginPath(); g.moveTo(0, 250); g.lineTo(w, 250); g.stroke(); g.setLineDash([]); history.forEach((v, i) => { const b = Math.min(240, v * 2); g.fillStyle = v > 16.7 ? '#ff5d73' : '#45d6c4'; g.fillRect(i * 5, 283 - b, 4, b); }); }); } };
  }

  // Sala 12: puesto de trabajo. El foco del pedestal cae sobre el escritorio.
  { const p = pedestal('prompts'), x = p.x, z = p.z, deskH = .75;
    const table = prop(models.table, { w: 1.6 }); table.position.set(x, 0, z); scene.add(table);
    const monitor = prop(models.monitor, { w: .9 }); monitor.position.set(x, deskH, z - .18); scene.add(monitor);
    // La pantalla del modelo traía una imagen ajena: se reemplaza por una que resume la sala.
    const cv = document.createElement('canvas'); cv.width = 1024; cv.height = 400;
    const gc = cv.getContext('2d'); gc.fillStyle = '#07110c'; gc.fillRect(0, 0, 1024, 400); gc.fillStyle = '#7dffb0'; gc.font = '700 48px "JetBrains Mono", monospace';
    ['> armá tu prompt', '> elegí las técnicas', '> pedí lo que necesitás_'].forEach((t, i) => gc.fillText(t, 50, 110 + i * 92));
    const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
    monitor.traverse((o) => { if (o.material?.name === 'Screen') { o.material.map = tex; o.material.emissiveMap = tex; } });
    const keyboard = prop(models.keyboard, { w: .44 }); keyboard.position.set(x, deskH, z + .2); scene.add(keyboard);
    const cpu = prop(models.cpu, { h: .42 }); cpu.position.set(x + .62, deskH, z - .1); scene.add(cpu);
    const mouse = prop(models.mouse, { w: .12 }); mouse.position.set(x + .34, deskH, z + .2); scene.add(mouse);
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(.07, .08, .05, 24), new THREE.MeshBasicNodeMaterial({ color: '#ff2f45' })), base2 = new THREE.Mesh(new THREE.CylinderGeometry(.11, .11, .03, 24), new THREE.MeshStandardNodeMaterial({ color: '#1c2740' })); base2.position.set(x - .55, deskH + .015, z + .15); cap.position.set(x - .55, deskH + .055, z + .15); scene.add(base2, cap);
    const lesson = LESSON_ORDER[LESSON_INDEX.prompts]; let shown = '', frames = 0, flash = 0;
    const paint = (text) => { gc.fillStyle = '#07110c'; gc.fillRect(0, 0, 1024, 400); gc.fillStyle = '#7dffb0'; gc.font = '24px "JetBrains Mono", monospace'; text.split('\n').flatMap((t) => t.match(/.{1,68}/g) ?? ['']).slice(0, 12).forEach((t, i) => gc.fillText(t, 30, 44 + i * 29)); tex.needsUpdate = true; };
    ex.prompts = { pc: new THREE.Vector3(x, deskH + .2, z), deploy(game) { navigator.clipboard?.writeText(lesson.output(lesson.params)).catch(() => {}); flash = 1; game.sound.blip(880); game.say('Deploy: prompt copiado'); },
      update(dt, t, game) { if (frames++ % 30 === 0) { const text = lesson.output(lesson.params); if (text !== shown) { shown = text; paint(text); } } flash *= Math.exp(-dt * 2.5); cap.position.y = deskH + .055 - flash * .025; game.pedestalSpot.intensity = 80 + flash * 220; game.pedestalSpot.color.setHSL(.38, .7 * flash, .8); } };
    const chair = prop(models.chair, { h: .95 }); chair.position.set(x, 0, z + .75); chair.rotation.y = Math.PI / 2; scene.add(chair);
    grid.addBox(x - .85, x + .85, z - .45, z + 1.1, 'desk'); }

  // Parlante orbitando la sala de audio
  { const l = LESSON_ORDER[LESSON_INDEX.audio]; const c = roomCenter(l.col, l.row); const m = prop(models.speaker, { h: .7 });
    const standX = c.x + 1.5, standZ = c.z + 1.8, stand = new THREE.Mesh(new THREE.CylinderGeometry(.05, .12, 1.2, 16), new THREE.MeshStandardNodeMaterial({ color: '#2b3a5c' })); stand.position.set(standX, .6, standZ); scene.add(stand); grid.addBox(standX - .15, standX + .15, standZ - .15, standZ + .15, 'head');
    const head = prop(models.head, { h: .34 }); head.position.set(standX, 1.2, standZ); scene.add(head);
    const hear = new THREE.Mesh(new THREE.RingGeometry(1.05, 1.1, 48).rotateX(-Math.PI / 2), new THREE.MeshBasicNodeMaterial({ color: '#ffd34d', transparent: true, opacity: .7 })); hear.position.set(standX, .03, standZ); scene.add(hear);
    const foamCv = document.createElement('canvas'); foamCv.width = foamCv.height = 256; { const g = foamCv.getContext('2d'); for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) { const a = x * 32, b = y * 32; [['#3a3440', [[a, b], [a + 32, b], [a + 16, b + 16]]], ['#26212c', [[a, b + 32], [a + 32, b + 32], [a + 16, b + 16]]], ['#2f2a36', [[a, b], [a, b + 32], [a + 16, b + 16]]], ['#2f2a36', [[a + 32, b], [a + 32, b + 32], [a + 16, b + 16]]]].forEach(([col, pts]) => { g.fillStyle = col; g.beginPath(); pts.forEach(([u, v], i) => (i ? g.lineTo(u, v) : g.moveTo(u, v))); g.fill(); }); } }
    const foam = new THREE.CanvasTexture(foamCv); foam.colorSpace = THREE.SRGBColorSpace; const foamMat = new THREE.MeshStandardNodeMaterial({ map: foam, roughness: 1 });
    for (const dz of [-3.5, -2, 2, 3.5]) { const p = new THREE.Mesh(new THREE.PlaneGeometry(1.3, 1.3), foamMat); p.position.set(c.x + 4.83, 1.6, c.z + dz); p.rotation.y = -Math.PI / 2; scene.add(p); }
    const waves = [0, 1, 2].map(() => { const r = new THREE.Mesh(new THREE.RingGeometry(.3, .33, 32), new THREE.MeshBasicNodeMaterial({ color: '#ffd34d', transparent: true, opacity: 0, side: THREE.DoubleSide })); r.position.set(0, .35, -.3); m.add(r); return r; });
    m.position.set(c.x + 2.5, 1.15, c.z); scene.add(m);
    const pos = m.position; // Órbita corrida al sudeste para no pasar por donde uno se para a leer el pizarrón.
    const OX = 1.5, OZ = 1.8, OR = 2; const ring = new THREE.Mesh(new THREE.RingGeometry(OR, OR + .05, 64).rotateX(-Math.PI / 2), new THREE.MeshBasicNodeMaterial({ color: '#ffd34d', transparent: true, opacity: .35 })); ring.position.set(c.x + OX, .03, c.z + OZ); scene.add(ring);
    ex.audio = { pos, center: c, orbit: true, offset: new THREE.Vector2(3, 0), update(dt, t, game) { if (ex.audio.orbit) { ex.audio.offset.set(OX + Math.cos(t * .5) * OR, OZ + Math.sin(t * .5) * OR); } pos.set(c.x + ex.audio.offset.x, 1.15 + Math.sin(t * 2) * .05, c.z + ex.audio.offset.y); m.rotation.y = Math.atan2(c.x + OX - pos.x, c.z + OZ - pos.z) + Math.PI; waves.forEach((r, i) => { const k = (t * .8 + i / 3) % 1; r.scale.setScalar(.8 + k * 1.2); r.position.z = -.3 - k * .7; r.material.opacity = game.sound.speakerOn ? (1 - k) * .7 : 0; }); } };
  }

  // Sala 11: pasarela con tres pisos. Cada uno tiene su sonido, y cada paso deja una huella.
  { const l = LESSON_ORDER[LESSON_INDEX.gamefeel], c = roomCenter(l.col, l.row);
    const tile = (draw) => { const cv = document.createElement('canvas'); cv.width = cv.height = 256; draw(cv.getContext('2d')); const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(3, 2.5); return t; };
    const noise = (base, cols, r) => (g) => { g.fillStyle = base; g.fillRect(0, 0, 256, 256); for (let i = 0; i < 2600; i++) { g.fillStyle = cols[i % cols.length]; g.beginPath(); g.arc(Math.random() * 256, Math.random() * 256, Math.random() * r + .6, 0, 7); g.fill(); } };
    const seg = (x, mat) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 2.2).rotateX(-Math.PI / 2), mat); m.position.set(c.x + x, .014, c.z); scene.add(m); };
    for (const t of Object.values(models.metal)) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(2, 1.7); }
    seg(-2.6, new THREE.MeshStandardNodeMaterial({ ...models.metal, roughness: .5, metalness: .5 }));
    seg(0, new THREE.MeshStandardNodeMaterial({ map: tile(noise('#6f6a62', ['#8f897f', '#4e4a44', '#a9a297'], 5)), roughness: 1 }));
    seg(2.6, new THREE.MeshStandardNodeMaterial({ map: tile(noise('#7a2f38', ['#8a3944', '#6a2630'], 1.2)), roughness: 1 }));
    for (let i = 0; i <= 5; i++) { const t = new THREE.Mesh(new THREE.PlaneGeometry(.03, .3).rotateX(-Math.PI / 2), new THREE.MeshBasicNodeMaterial({ color: '#ffd34d' })); t.position.set(c.x - 3.625 + i * 1.45, .02, c.z + 1.28); scene.add(t); }
    const ruler = label('1 paso = 1,45 m', 1.6, '', '#ffd34d'); ruler.position.set(c.x, .5, c.z + 1.7); ruler.rotation.y = Math.PI; scene.add(ruler);
    const prints = Array.from({ length: 12 }, () => { const m = new THREE.Mesh(new THREE.CircleGeometry(.08, 16).rotateX(-Math.PI / 2).scale(1, 1, 1.9), new THREE.MeshBasicNodeMaterial({ color: '#ffd34d', transparent: true, opacity: 0 })); m.position.y = .03; scene.add(m); return m; });
    let next = 0;
    ex.surfaceAt = (x, z) => { const dx = x - c.x, dz = z - c.z; if (Math.abs(dz) > 1.1 || Math.abs(dx) > 3.9) return null; return dx < -1.3 ? 'metal' : dx < 1.3 ? 'gravel' : 'carpet'; };
    ex.footprint = (pos, yaw, left) => { const dx = pos.x - c.x, dz = pos.z - c.z; if (Math.abs(dx) > 5 || Math.abs(dz) > 5) return; const m = prints[next++ % prints.length], s = left ? -.12 : .12; m.position.x = pos.x + Math.cos(yaw) * s; m.position.z = pos.z - Math.sin(yaw) * s; m.rotation.y = yaw; m.material.opacity = .85; };
    ex.gamefeel = { update(dt) { for (const m of prints) m.material.opacity *= Math.exp(-dt * .5); } };
  }

  // Interacciones con E que no abren un pizarrón.
  { const u = ex.collision.update?.bind(ex.collision); ex.collision.update = (...a) => { u?.(...a); ex.lever.handle.rotation.z = ex.collision.doorClosed ? .7 : -.7; }; }
  const doorAim = new THREE.Vector3(doorMesh.position.x, 1.1, doorZ);
  const toggleDoor = (game) => { ex.collision.setDoor(!ex.collision.doorClosed); game.say(ex.collision.doorClosed ? 'Puerta cerrada: el mapa cambió' : 'Puerta abierta: el mapa cambió'); };
  // Devuelve qué se puede accionar con la mira en este momento, o null. La palanca solo cuenta desde su lado de la pared.
  ex.target = (game) => {
    if ((game.pos.x > ex.lever.pos.x - .1 && game.aimsAt(ex.lever.pos, .4, 2.3)) || game.aimsAt(doorAim, DOOR / 2, 2.8)) return { verb: ex.collision.doorClosed ? 'Abrir' : 'Cerrar', act: () => toggleDoor(game) };
    if (game.aimsAt(ex.prompts.pc, .8, 2.8)) return { verb: 'Copiar', act: () => ex.prompts.deploy(game) };
    return null;
  };
  return ex;
}
