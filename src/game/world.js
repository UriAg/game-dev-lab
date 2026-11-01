import * as THREE from 'three/webgpu';
import { uniform, positionLocal, normalLocal, uv, time, sin, floor, mix, color, vec3, vertexColor, texture, positionWorld } from 'three/tsl';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { OccupancyGrid } from './grid.js';
import { LESSON_ORDER, LESSON_INDEX } from '../lessons/index.js';

export const ROOM = 10, COLS = 4, ROWS = 3, HEIGHT = 3.2, WALL = .3, CELL = .2, PLAYER_RADIUS = .3;
export const roomCenter = (col, row) => new THREE.Vector3(col * ROOM + ROOM / 2, 0, row * ROOM + ROOM / 2);

export function roomAt(x, z) {
  const col = Math.floor(x / ROOM), row = Math.floor(z / ROOM);
  return LESSON_ORDER.find((l) => l.col === col && l.row === row) ?? null;
}

function label(text, w = 2, sub = '') {
  const c = document.createElement('canvas'); c.width = 512; c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#0b111c'; g.fillRect(0, 0, 512, 128);
  g.fillStyle = '#ff9a3c'; g.font = '700 46px "Chakra Petch", sans-serif'; g.textAlign = 'center'; g.fillText(text, 256, sub ? 58 : 80);
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

export function buildWorld(scene, floorTexture, robotOpt, robotRaw, horror) {
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
    for (let i = 0; i < 3; i++) {
      const x = c.x - 3.9 + i * 1.5, z = c.z + 4.35;
      box(x, 1, z, 1.1, 2, .9, base.set('#161e2e'), true);
      for (let k = 0; k < 7; k++) {
        const g = new THREE.PlaneGeometry(.75, .05).translate(x, .35 + k * .24, z - .452).rotateY(0);
        const tmp = new THREE.BoxGeometry(.8, .045, .01).translate(x, .35 + k * .24, z - .455);
        ledGeos.push(tmp); g.dispose();
      }
    }
    // Zócalo con el color de cada sala
    box(c.x, .07, c.z - 4.8, 9.6, .14, .06, accent);
    box(c.x, .07, c.z + 4.8, 9.6, .14, .06, accent);
    // Marco del pizarrón
    box(c.x - 1, 1.75, c.z - 4.8, 4.3, 2.7, .08, trim);
    // Pedestal de la sala
    box(c.x + 2.6, .25, c.z - 1, 1.5, .5, 1.5, base.set('#1c2740'), true);
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
  scene.add(new THREE.Mesh(mergeGeometries(ledGeos), ledMat));

  // Piso y techo. El piso usa la textura KTX2 real del pipeline.
  floorTexture.wrapS = floorTexture.wrapT = THREE.RepeatWrapping;
  floorTexture.repeat.set(COLS * 2, ROWS * 2);
  floorTexture.anisotropy = 8;
  const floorMat = new THREE.MeshStandardNodeMaterial({ map: floorTexture, roughness: .55, metalness: .25, color: '#7c8aa5' });
  const floorMesh = new THREE.Mesh(new THREE.PlaneGeometry(W, D).rotateX(-Math.PI / 2).translate(W / 2, 0, D / 2), floorMat);
  scene.add(floorMesh);
  const ceil = new THREE.Mesh(new THREE.PlaneGeometry(W, D).rotateX(Math.PI / 2).translate(W / 2, HEIGHT, D / 2),
    new THREE.MeshStandardNodeMaterial({ color: '#10151f', roughness: 1 }));
  scene.add(ceil);
  for (const l of LESSON_ORDER) {
    const c = roomCenter(l.col, l.row);
    const m = new THREE.Mesh(new THREE.PlaneGeometry(5, .35).rotateX(Math.PI / 2).translate(c.x, HEIGHT - .01, c.z),
      new THREE.MeshBasicNodeMaterial({ color: new THREE.Color(l.color).multiplyScalar(1.6) }));
    scene.add(m);
  }

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

  const exhibits = buildExhibits(scene, grid, robotOpt, robotRaw, doorBox, doorMesh, doorZ, DOOR, horror);
  return { grid, boards, exhibits, floorMesh, shellMesh };
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
  g.fillStyle = l.color; g.font = '700 30px "JetBrains Mono", monospace'; g.fillText('CLICK O [E] PARA ABRIR', 60, 545);
}
function wrap(g, text, x, y, max, lh) {
  let line = '', yy = y;
  for (const w of text.split(' ')) {
    if (g.measureText(line + w).width > max) { g.fillText(line, x, yy); line = ''; yy += lh; }
    line += w + ' ';
  }
  g.fillText(line, x, yy);
}

function buildExhibits(scene, grid, robotOpt, robotRaw, doorBox, doorMesh, doorZ, DOOR, horror) {
  const pedestal = (id) => { const l = LESSON_ORDER[LESSON_INDEX[id]]; return roomCenter(l.col, l.row).add(new THREE.Vector3(2.6, .5, -1)); };
  const robot = (src = robotOpt) => { const m = src.clone(); m.traverse((o) => { o.frustumCulled = true; }); return m; };
  const ex = {};

  // Lobby: capas del stack
  { const p = pedestal('stack'); const group = new THREE.Group(); group.position.copy(p);
    const layers = [['Astro', 'HTML estático + islas', '#ff9a3c'], ['Preact + signals', 'interfaz reactiva', '#45d6c4'], ['Three.js WebGPU', 'el mundo 3D', '#8f7bff']];
    layers.forEach(([a, b, col], i) => {
      const s = new THREE.Mesh(new THREE.BoxGeometry(1.2 - i * .12, .22, 1.2 - i * .12), new THREE.MeshStandardNodeMaterial({ color: col, roughness: .4 }));
      s.position.y = .25 + i * .4; group.add(s);
      const lb = label(a, 1.6, b); lb.position.set(-1.5, .4 + i * .45, 0); lb.rotation.y = Math.PI / 5; group.add(lb);
    });
    scene.add(group);
    ex.stack = { update(dt, t) { group.children.forEach((c, i) => { if (i < 3 * 2 && c.geometry.type === 'BoxGeometry') c.rotation.y = t * .3; }); } };
  }

  // Teclas WASD que se hunden de verdad
  { const p = pedestal('input'); const keys = {};
    [['KeyW', 0, -.42], ['KeyA', -.42, 0], ['KeyS', 0, 0], ['KeyD', .42, 0]].forEach(([code, x, z]) => {
      const k = new THREE.Mesh(new THREE.BoxGeometry(.36, .2, .36), new THREE.MeshStandardNodeMaterial({ color: '#3a4a68', roughness: .4 }));
      k.position.set(p.x + x, p.y + .12, p.z + z + .2); scene.add(k);
      const lb = label(code.slice(3), .28); lb.rotation.x = -Math.PI / 2; lb.scale.y = 4; lb.position.y = .101; k.add(lb);
      keys[code] = k;
    });
    ex.input = { update(dt, t, game) { for (const c in keys) { const on = game.input.keys.has(c); keys[c].position.y = p.y + (on ? .06 : .12); keys[c].material.color.set(on ? '#ff9a3c' : '#3a4a68'); } } };
  }

  // Yaw: robot que copia tu cámara, con las flechas sin/cos sobre el piso
  { const p = pedestal('yaw'); const r = robot(); r.scale.setScalar(.55); r.position.copy(p); scene.add(r);
    const f = makeArrow('#ff9a3c'), sx = makeArrow('#45d6c4'), cz = makeArrow('#ff5d73');
    for (const a of [f, sx, cz]) { a.position.set(p.x, p.y + .02, p.z); scene.add(a); }
    ex.yaw = { update(dt, t, game) { const y = game.demoYaw ?? game.yaw, L = 1.25; r.rotation.y = y + Math.PI;
      const fx = -Math.sin(y) * L, fz = -Math.cos(y) * L;
      f.set(fx, fz); sx.set(fx, 0); cz.set(0, fz); } };
  }

  // Suavizado: tres cubos persiguen el mismo objetivo
  { const p = pedestal('smoothing'); const names = [['#ff5d73', 'sin suavizado'], ['#8f7bff', 'lerp fijo a 15 fps'], ['#45d6c4', 'exponencial']];
    const cubes = names.map(([col, n], i) => { const m = new THREE.Mesh(new THREE.BoxGeometry(.26, .26, .26), new THREE.MeshStandardNodeMaterial({ color: col })); m.position.set(p.x - .55, p.y + .13, p.z - .45 + i * .45); scene.add(m); return { m, x: -.55, acc: 0 }; });
    let target = .55, clock = 0;
    ex.smoothing = { update(dt) { clock += dt; if (clock > 1.8) { clock = 0; target = -target; }
      cubes[0].x = target;
      cubes[1].acc += dt; if (cubes[1].acc > 1 / 15) { cubes[1].acc = 0; cubes[1].x += (target - cubes[1].x) * .2; }
      cubes[2].x += (target - cubes[2].x) * (1 - Math.exp(-dt * 5));
      for (const c of cubes) c.m.position.x = p.x + c.x; } };
  }

  // Colisión: la grilla real proyectada sobre el piso
  { const l = LESSON_ORDER[LESSON_INDEX.collision]; const c0 = roomCenter(l.col, l.row);
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
    const mixer = new THREE.AnimationMixer(r), run = mixer.clipAction(horror.animations[0]).play(); let runW = 0;
    const dotGeo = new THREE.SphereGeometry(.06, 8, 8), dots = new THREE.InstancedMesh(dotGeo, new THREE.MeshBasicNodeMaterial({ color: '#ffd34d' }), 120);
    dots.count = 0; dots.frustumCulled = false; scene.add(dots);
    const dummy = new THREE.Object3D(); let path = [], timer = 0, i = 0;
    ex.astar = { lastCount: 0, always: false, update(dt, t, game) {
      timer -= dt;
      if (timer <= 0) { timer = .6; const started = performance.now(); path = grid.path(r.position, game.pos) ?? []; ex.astar.lastMs = performance.now() - started; ex.astar.lastCount = path.length; i = 1;
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
    const wave = sin(positionLocal.y.mul(u.freq).add(time.mul(u.speed)));
    mat.positionNode = positionLocal.add(normalLocal.mul(wave.mul(u.amp)));
    mat.colorNode = mix(color('#ff9a3c'), color('#45d6c4'), wave.mul(.5).add(.5).mul(u.mixA.mul(2)).clamp());
    const s = new THREE.Mesh(new THREE.SphereGeometry(.55, 96, 64), mat); s.position.set(p.x, p.y + .75, p.z); scene.add(s);
    ex.webgpu = { u, update(dt, t) { s.rotation.y = t * .25; } };
  }

  // Compresión: original contra comprimido, con cuantización en vivo por shader
  { const p = pedestal('compression'); const bits = uniform(14);
    const a = robot(robotRaw); a.scale.setScalar(.62); a.position.set(p.x - .42, p.y, p.z); a.rotation.y = Math.PI; scene.add(a);
    const b = robot(); b.scale.setScalar(.62); b.position.set(p.x + .42, p.y, p.z); b.rotation.y = Math.PI; scene.add(b);
    const steps = uniform(16384);
    b.traverse((o) => { if (o.isMesh) { const src = o.material; const m = new THREE.MeshStandardNodeMaterial({ map: src.map, roughness: .45, metalness: .6 }); m.positionNode = floor(positionLocal.div(2).add(.5).mul(steps)).div(steps).sub(.5).mul(2); o.material = m; } });
    const la = label('RAW 4,13 MB', .9), lb = label('OPT 1,11 MB', .9);
    la.position.set(a.position.x, p.y + 1.45, p.z + .3); lb.position.set(b.position.x, p.y + 1.45, p.z + .3); la.rotation.y = lb.rotation.y = Math.PI / 6 - .5; scene.add(la, lb);
    ex.compression = { bits, setBits(n) { steps.value = 2 ** n; } , update() {} };
  }

  // Workers: este cubo gira en el hilo principal, así que se congela si lo bloqueás.
  { const p = pedestal('workers'); const m = new THREE.Mesh(new THREE.BoxGeometry(.7, .7, .7), new THREE.MeshStandardNodeMaterial({ color: '#8f7bff', roughness: .3 }));
    m.position.set(p.x, p.y + .75, p.z); scene.add(m);
    ex.workers = { update(dt, t) { m.rotation.x = t * 1.2; m.rotation.y = t * 1.8; } };
  }

  // Parlante orbitando la sala de audio
  { const l = LESSON_ORDER[LESSON_INDEX.audio]; const c = roomCenter(l.col, l.row); const m = new THREE.Mesh(new THREE.IcosahedronGeometry(.28, 2), new THREE.MeshBasicNodeMaterial({ color: '#ffd34d' }));
    m.position.set(c.x + 2.5, 1.5, c.z); scene.add(m);
    const pos = m.position; // Órbita corrida al sudeste para no pasar por donde uno se para a leer el pizarrón.
    const OX = 1.5, OZ = 1.8, OR = 2; const ring = new THREE.Mesh(new THREE.RingGeometry(OR, OR + .05, 64).rotateX(-Math.PI / 2), new THREE.MeshBasicNodeMaterial({ color: '#ffd34d', transparent: true, opacity: .35 })); ring.position.set(c.x + OX, .03, c.z + OZ); scene.add(ring);
    ex.audio = { pos, center: c, orbit: true, offset: new THREE.Vector2(3, 0), update(dt, t) { if (ex.audio.orbit) { ex.audio.offset.set(OX + Math.cos(t * .5) * OR, OZ + Math.sin(t * .5) * OR); } pos.set(c.x + ex.audio.offset.x, 1.5 + Math.sin(t * 2) * .08, c.z + ex.audio.offset.y); } };
  }

  { const p = pedestal('gamefeel'); const r = robot(); r.scale.setScalar(.55); r.position.copy(p); scene.add(r);
    ex.gamefeel = { update(dt, t) { r.position.y = p.y + Math.abs(Math.sin(t * 5)) * .06; r.rotation.z = Math.sin(t * 2.5) * .06; r.rotation.y = Math.PI + Math.sin(t * .5) * .5; } };
  }
  { const p = pedestal('prompts'); const r = robot(); r.scale.setScalar(.7); r.position.copy(p); r.rotation.y = Math.PI * .85; scene.add(r); ex.prompts = { update(dt, t) { r.rotation.y = Math.PI * .85 + Math.sin(t) * .15; } }; }
  return ex;
}
