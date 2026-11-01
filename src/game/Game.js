import * as THREE from 'three/webgpu';
import { pass, mrt, output, normalView, vec4, vec3, uniform } from 'three/tsl';
import { ao } from 'three/addons/tsl/display/GTAONode.js';
import { dof } from 'three/addons/tsl/display/DepthOfFieldNode.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { KTX2Loader } from 'three/addons/loaders/KTX2Loader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { Input } from './input.js';
import { Sound, inverseGain } from './audio.js';
import { buildWorld, roomAt, roomCenter, HEIGHT, COLS, ROWS, ROOM } from './world.js';
import * as S from './state.js';
import { LESSON_ORDER, LESSONS } from '../lessons/index.js';

const EYE = 1.62, WALK = 3.2, SPRINT = 5.4, SENS = .0021, STRIDE = 1.45;
const expT = (k, dt) => 1 - Math.exp(-k * dt);

export class Game {
  constructor(canvas) {
    this.canvas = canvas;
    this.input = new Input(canvas);
    this.sound = new Sound();
    this.pos = new THREE.Vector3(6, EYE, 7.5);
    this.vel = new THREE.Vector3(); this.target = new THREE.Vector3();
    this.yaw = 0; this.pitch = 0; this.roll = 0; this.bob = 0; this.stride = 0; this.leftFoot = true; this.walked = 0;
    this.yawRate = 0;
    this.feel = { smooth: true, bob: true, roll: true, steps: true, slide: true, normalize: true, k: 10, sens: SENS };
    this.autoPath = null; this.current = null; this.nearBoard = null;
    this.moveResult = 'free'; this.last = { f: 0, s: 0, dirX: 0, dirZ: 0, speed: 0 };
    this.fx = { ao: true, dof: false };
    this.focusDistance = 4;
    this.mirror = null; this.frame = 0; this.minimap = null; this.time = 0;
    this.metrics = {}; this.frameTimes = [];
  }

  async start() {
    const forceWebGL = new URLSearchParams(location.search).get('backend') === 'webgl';
    const renderer = this.renderer = new THREE.WebGPURenderer({ canvas: this.canvas, antialias: true, forceWebGL });
    renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
    renderer.setSize(innerWidth, innerHeight, false);
    renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.15;
    await renderer.init();
    const webgpu = !!renderer.backend.isWebGPUBackend;
    S.backendName.value = webgpu ? 'WebGPU' : forceWebGL ? 'WebGL 2 (elegido)' : 'WebGL 2 (fallback)';

    const scene = this.scene = new THREE.Scene();
    scene.background = new THREE.Color('#05070c');
    const cam = this.camera = new THREE.PerspectiveCamera(72, innerWidth / innerHeight, .08, 80);
    cam.rotation.order = 'YXZ';
    scene.add(new THREE.HemisphereLight('#bcd4ff', '#332a26', 1.5));
    this.roomLight = new THREE.PointLight('#ffffff', 42, 15, 1.7); this.roomLight.position.set(5, 2.8, 5); scene.add(this.roomLight);
    this.hand = new THREE.PointLight('#ffd9b0', 5, 7, 1.8); scene.add(this.hand);

    S.loadStatus.value = 'Transcodificando textura KTX2';
    const ktx2 = new KTX2Loader().setTranscoderPath('/basis/').detectSupport(renderer);
    this.ktx2 = ktx2;
    const t0 = performance.now();
    const floor = await ktx2.loadAsync('/assets/panel.ktx2');
    floor.colorSpace = THREE.SRGBColorSpace;
    this.metrics.ktx2Load = performance.now() - t0;

    S.loadStatus.value = 'Decodificando modelos meshopt';
    const gltf = new GLTFLoader().setKTX2Loader(ktx2).setMeshoptDecoder(MeshoptDecoder);
    const t1 = performance.now();
    const opt = (await gltf.loadAsync('/assets/robot.opt.glb')).scene;
    this.metrics.optLoad = performance.now() - t1;
    const t2 = performance.now();
    const raw = (await gltf.loadAsync('/assets/robot.raw.glb')).scene;
    this.metrics.rawLoad = performance.now() - t2;
    const horror = await gltf.loadAsync('/assets/horror.opt.glb');
    this.stats = await (await fetch('/assets/stats.json')).json();

    S.loadStatus.value = 'Armando las salas y la grilla de colisión';
    const world = this.world = buildWorld(scene, floor, opt, raw, horror);
    this.grid = world.grid;

    this.pipeline = new THREE.RenderPipeline(renderer);
    const sp = this.scenePass = pass(scene, cam);
    sp.setMRT(mrt({ output, normal: normalView }));
    this.dofFocus = uniform(4); this.dofBlur = uniform(1.6); this.dofBokeh = uniform(.75);
    this.setDof(.35);
    this.applyFx();

    this.pathDots = [];
    addEventListener('resize', () => { cam.aspect = innerWidth / innerHeight; cam.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight, false); });
    this.input.onLockChange = (l) => this.onLock(l);
    this.input.onLockFail = () => this.say('Hacé click para capturar el mouse, o arrastrá para mirar');
    this.canvas.addEventListener('mousedown', (e) => this.onClick(e));
    // Bloquea el menú de Chrome en todo el juego. F12 sigue andando porque esto no toca el teclado.
    document.addEventListener('contextmenu', (e) => { if (e.target?.tagName !== 'TEXTAREA') e.preventDefault(); });
    document.addEventListener('fullscreenchange', () => { S.fullscreen.value = !!document.fullscreenElement; });
    addEventListener('keydown', (e) => {
      const typing = e.target?.tagName === 'TEXTAREA';
      if (e.code === 'Tab' && !typing) {
        e.preventDefault(); if (e.repeat) return;
        if (S.mode.value === 'lesson') this.tryWalking(); else if (S.mode.value === 'try') this.backToLesson();
      }
      if (e.code === 'KeyF' && !typing) this.toggleFullscreen();
      if (e.code === 'KeyM' && !typing) this.toggleSpeaker();
      if (e.code === 'Escape') {
        if (S.mode.value === 'lesson' && !document.pointerLockElement) this.closeLesson(true);
        else if (S.mode.value === 'try') this.backToLesson();
        else if (S.mode.value === 'walk' && !this.input.locked) { this.input.releaseKeys(); S.mode.value = 'paused'; }
      }
      if (e.code === 'KeyE') { if (this.otherBoard()) this.openLesson(this.nearBoard); else if (S.mode.value === 'try') this.backToLesson(); }
    });

    S.loadStatus.value = 'Compilando shaders';
    await renderer.compileAsync(scene, cam).catch(() => {});
    S.loadStatus.value = '';
    this.resume();
    S.roomName.value = roomAt(this.pos.x, this.pos.z).title;
    let prev = performance.now();
    this.loop = () => {
      const now = performance.now(), dt = Math.min((now - prev) / 1000, .1); prev = now;
      this.tick(dt, now);
    };
    renderer.setAnimationLoop(this.loop);
    window.__game = this; this.S = S;
  }

  applyFx() {
    const sp = this.scenePass, col = sp.getTextureNode('output');
    let node = col;
    if (this.fx.ao) {
      this.aoPass ??= ao(sp.getTextureNode('depth'), sp.getTextureNode('normal'), this.camera);
      this.aoPass.resolutionScale = .5;
      node = vec4(col.rgb.mul(this.aoPass.getTextureNode().r), col.a);
    }
    if (this.fx.dof) node = dof(node, sp.getViewZNode(), this.dofFocus, this.dofBlur, this.dofBokeh);
    this.pipeline.outputNode = node;
    this.pipeline.needsUpdate = true;
  }

  // ---- Flujo de estados ----
  begin() { this.sound.init(); S.mode.value = 'walk'; this.input.lock(); }
  onLock(locked) {
    const m = S.mode.value;
    if (locked) return;
    if (m === 'walk') S.mode.value = 'paused';
    else if (m === 'try') S.mode.value = 'lesson';
  }
  onClick(e) {
    const m = S.mode.value;
    if (m === 'start' || m === 'paused') { this.begin(); return; }
    if (!this.input.locked) { if (m === 'walk' || m === 'try') this.input.lock(); return; }
    if (e.button === 2) this.walkToCrosshair();
    else if (this.otherBoard()) this.openLesson(this.nearBoard);
  }
  // Pizarrón cercano que se puede abrir: caminando, cualquiera; con una lección minimizada, otro distinto.
  otherBoard() {
    const m = S.mode.value;
    return this.nearBoard && (m === 'walk' || (m === 'try' && this.nearBoard !== S.lessonId.value));
  }
  openLesson(id) {
    const prev = LESSONS[S.lessonId.value];
    if (prev && prev.id !== id) { prev.onClose?.(prev.params, this); this.setMirror(null); }
    S.lessonId.value = id; S.stepIndex.value = 0; S.markVisited(id);
    this.sound.blip(); S.mode.value = 'lesson'; this.input.unlock();
  }
  tryWalking() { document.activeElement?.blur?.(); this.sound.init(); S.mode.value = 'try'; this.input.lock(); }
  backToLesson() { S.mode.value = 'lesson'; this.input.unlock(); }
  closeLesson(fromEsc = false) {
    document.activeElement?.blur?.();
    const lesson = LESSONS[S.lessonId.value]; lesson?.onClose?.(lesson.params, this);
    this.setMirror(null); S.lessonId.value = null; S.mode.value = 'walk'; this.sound.init();
    // Esc no cuenta como gesto del usuario: el mouse se recaptura con el próximo click.
    if (fromEsc) this.say('Hacé click para volver a capturar el mouse'); else this.input.lock();
  }
  say(text) { S.notice.value = text; clearTimeout(this.noticeT); this.noticeT = setTimeout(() => { S.notice.value = ''; }, 2600); }
  toggleFullscreen() {
    if (document.fullscreenElement) document.exitFullscreen();
    else document.documentElement.requestFullscreen().catch(() => this.say('El navegador no permitió la pantalla completa'));
  }
  toggleSpeaker() {
    if (this.current?.id !== 'audio') return;
    const p = LESSONS.audio.params; p.sound = !p.sound; this.sound.speakerOn = p.sound; S.paramsRev.value++;
    this.say(p.sound ? 'Esfera de sonido activada' : 'Esfera de sonido silenciada');
  }
  // Intensidad 0 a 1,25. focalLength es el rango nítido en metros: con 0,012 queda nítido solo 1,2 cm.
  setDof(i) { this.dofBlur.value = Math.max(.012, 3 * (1 - i)); this.dofBokeh.value = .4 + i; }
  // Cambiar de backend exige crear otro renderer: se recarga y se vuelve al mismo lugar.
  switchBackend(webgl) {
    try { sessionStorage.setItem('lab:resume', JSON.stringify({ id: S.lessonId.value, step: S.stepIndex.value, x: this.pos.x, z: this.pos.z, yaw: this.yaw })); } catch { /* sin storage */ }
    location.search = webgl ? '?backend=webgl' : '';
  }
  resume() {
    let r = null; try { r = JSON.parse(sessionStorage.getItem('lab:resume')); sessionStorage.removeItem('lab:resume'); } catch { /* sin storage */ }
    if (!r?.id) return;
    this.pos.x = r.x; this.pos.z = r.z; this.yaw = r.yaw;
    S.lessonId.value = r.id; S.stepIndex.value = r.step; S.markVisited(r.id); S.mode.value = 'lesson';
  }
  // Mide cuánto tarda la CPU en preparar muchos draw calls: es donde más difieren los dos backends.
  async benchDrawCalls(count = 4000) {
    const group = new THREE.Group(), geo = new THREE.BoxGeometry(.05, .05, .05), mat = new THREE.MeshStandardNodeMaterial({ color: '#45d6c4' });
    for (let i = 0; i < count; i++) { const m = new THREE.Mesh(geo, mat); m.frustumCulled = false; m.position.set(this.pos.x + (i % 80) * .08 - 3, .4 + (i % 12) * .1, this.pos.z - 3 - Math.floor(i / 80) * .05); group.add(m); }
    this.scene.add(group);
    // Se mide dentro del loop real: fuera de él, Three no avanza el frame y saltea el render de la escena.
    const times = await new Promise((resolve) => { this.bench = { skip: 8, times: [], want: 20, resolve }; });
    this.scene.remove(group); geo.dispose(); mat.dispose();
    times.sort((a, b) => a - b);
    return times[times.length >> 1];
  }
  teleport(id) {
    const l = LESSONS[id], c = roomCenter(l.col, l.row);
    this.pos.set(c.x - 1, EYE, c.z + .5); this.yaw = 0; this.pitch = 0; this.vel.set(0, 0, 0); this.autoPath = null;
    this.begin();
  }
  setMirror(canvas) {
    const id = S.lessonId.value, b = id && this.world.boards[id];
    if (this.mirror && !canvas) { const o = this.mirror; o.tex.image = o.cover; o.tex.needsUpdate = true; this.mirror = null; return; }
    if (canvas && b) { b.tex.image = canvas; b.tex.needsUpdate = true; this.mirror = b; }
  }

  walkToCrosshair() {
    // Rayo desde la cámara contra el plano del piso.
    const d = new THREE.Vector3(); this.camera.getWorldDirection(d);
    if (d.y > -.03) return;
    const k = -this.camera.position.y / d.y, x = this.camera.position.x + d.x * k, z = this.camera.position.z + d.z * k;
    this.autoPath = this.grid.path(this.pos, { x, z });
    if (!this.autoPath) this.say('Ese punto está bloqueado en la grilla'); else { this.say(`A*: camino de ${this.autoPath.length} celdas`); this.autoIndex = 0; }
  }

  // ---- Loop ----
  tick(dt, now) {
    this.time += dt; this.frame++;
    this.frameTimes.push(dt * 1000); if (this.frameTimes.length > 240) this.frameTimes.shift();
    if (this.frame % 15 === 0) {
      S.fps.value = Math.round(1000 / (this.frameTimes.slice(-30).reduce((a, b) => a + b, 0) / Math.min(30, this.frameTimes.length)));
      S.uiStats.signalUpdates++;
    }
    const m = S.mode.value;
    this.input.pollGamepad();
    if (m === 'walk' || m === 'try') this.updateLook(dt); else this.input.consumeMouse();
    this.updateWalk(dt, m === 'walk' || m === 'try');
    this.updateRoom();
    this.applyCamera(dt);
    for (const l of LESSON_ORDER) {
      if (l.id === 'workers' || (this.current && (l.id === this.current.id))) this.world.exhibits[l.id]?.update(dt, this.time, this);
    }
    this.updateAudio();
    if (this.mirror && this.frame % 2 === 0) this.mirror.tex.needsUpdate = true;
    if (this.onFrame) this.onFrame(dt);
    const t0 = performance.now();
    this.pipeline.render();
    this.frameInfo = { drawCalls: this.renderer.info.render.drawCalls, triangles: this.renderer.info.render.triangles };
    const b = this.bench;
    if (b) { if (b.skip > 0) b.skip--; else { b.times.push(performance.now() - t0); if (b.times.length >= b.want) { this.bench = null; b.resolve(b.times); } } }
  }

  updateLook(dt) {
    const [mx, my] = this.input.consumeMouse();
    const prevYaw = this.yaw;
    this.yaw -= mx * this.feel.sens;
    this.pitch = Math.max(-1.45, Math.min(1.45, this.pitch - my * this.feel.sens));
    this.yawRate += ((this.yaw - prevYaw) / Math.max(dt, .001) - this.yawRate) * expT(14, dt);
  }

  updateWalk(dt, active) {
    const k = this.input.keys;
    let f = 0, s = 0;
    if (active) {
      f = (k.has('KeyW') || k.has('ArrowUp') ? 1 : 0) - (k.has('KeyS') || k.has('ArrowDown') ? 1 : 0);
      s = (k.has('KeyD') || k.has('ArrowRight') ? 1 : 0) - (k.has('KeyA') || k.has('ArrowLeft') ? 1 : 0);
    }
    const sprint = active && (k.has('ShiftLeft') || k.has('ShiftRight'));
    if (f || s) this.autoPath = null;
    if (this.feel.normalize) { const len = Math.hypot(f, s) || 1; f /= len; s /= len; }
    let dirX = -Math.sin(this.yaw) * f + Math.cos(this.yaw) * s;
    let dirZ = -Math.cos(this.yaw) * f - Math.sin(this.yaw) * s;
    if (this.autoPath) {
      const p = this.autoPath; let i = this.autoIndex;
      while (i < p.length - 1 && Math.hypot(p[i].x - this.pos.x, p[i].z - this.pos.z) < .55) i++;
      this.autoIndex = i; const dx = p[i].x - this.pos.x, dz = p[i].z - this.pos.z, d = Math.hypot(dx, dz);
      if (i >= p.length - 1 && d < .2) this.autoPath = null; else { dirX = dx / (d || 1); dirZ = dz / (d || 1); }
    }
    const speed = sprint ? SPRINT : WALK;
    this.target.set(dirX * speed, 0, dirZ * speed);
    if (this.feel.smooth) this.vel.lerp(this.target, expT(this.feel.k, dt)); else this.vel.copy(this.target);
    const before = { x: this.pos.x, z: this.pos.z };
    this.moveResult = this.grid.move(this.pos, this.vel.x * dt, this.vel.z * dt, this.feel.slide);
    const moved = Math.hypot(this.pos.x - before.x, this.pos.z - before.z);
    if (moved < 1e-5) this.vel.multiplyScalar(.5);
    this.last = { f, s, dirX, dirZ, speed: moved / Math.max(dt, .001) };
    this.walked += moved; this.stride += moved; this.bob += moved;
    if (this.stride >= STRIDE) { this.stride -= STRIDE; this.leftFoot = !this.leftFoot; this.stepFlash = this.time; if (this.feel.steps) this.sound.footstep(this.leftFoot, sprint); }
  }

  updateRoom() {
    const r = roomAt(this.pos.x, this.pos.z);
    if (r && r !== this.current) {
      this.current = r; S.roomName.value = r.title;
      const c = roomCenter(r.col, r.row); this.roomLight.position.set(c.x, 2.85, c.z); this.roomLight.color.set(r.color).lerp(new THREE.Color('#fff'), .65);
    }
    let near = null;
    if (r) {
      const b = this.world.boards[r.id], dx = b.center.x - this.pos.x, dz = b.center.z - this.pos.z, d = Math.hypot(dx, dz);
      const facing = (-Math.sin(this.yaw) * dx - Math.cos(this.yaw) * dz) / (d || 1);
      if (d < 6 && facing > .55) near = r.id;
    }
    if (near !== this.nearBoard) { this.nearBoard = near; S.promptText.value = near ? `${LESSONS[near].title}` : ''; }
  }

  applyCamera(dt) {
    const speedK = Math.min(this.last.speed / WALK, 1.4);
    const phase = this.bob / STRIDE * Math.PI;
    const bobY = this.feel.bob ? Math.abs(Math.sin(phase)) * .045 * speedK : 0;
    const bobX = this.feel.bob ? Math.cos(phase) * .018 * speedK : 0;
    const rollT = this.feel.roll ? Math.max(-.05, Math.min(.05, this.yawRate * .012)) : 0;
    this.roll += (rollT - this.roll) * expT(9, dt);
    this.bobNow = bobY;
    const c = this.camera;
    c.position.set(this.pos.x + Math.cos(this.yaw) * bobX, EYE + bobY, this.pos.z - Math.sin(this.yaw) * bobX);
    c.rotation.set(this.pitch, this.yaw, this.roll);
    this.hand.position.set(c.position.x, 2, c.position.z);
    if (this.fx.dof) {
      // Enfoca lo que está en la mira: marcha por la grilla hasta chocar o tocar el piso.
      const d = new THREE.Vector3(); c.getWorldDirection(d);
      let hit = 14; if (d.y < -.01) hit = Math.min(hit, -c.position.y / d.y);
      for (let t = .3; t < hit; t += .1) if (this.grid.blocked(c.position.x + d.x * t, c.position.z + d.z * t)) { hit = t; break; }
      this.focusDistance += (hit - this.focusDistance) * expT(6, dt); this.dofFocus.value = this.focusDistance;
    }
  }

  updateAudio() {
    const a = this.sound; if (!a.ctx) return;
    a.setListener(this.camera.position, this.yaw);
    const ex = this.world.exhibits.audio, d = this.camera.position.distanceTo(ex.pos);
    a.setSpeaker(ex.pos, d < 13 ? Math.min(1, (13 - d) / 3) * (S.mode.value === 'lesson' && S.lessonId.value !== 'audio' ? 0 : 1) * .5 : 0);
    this.audioGain = inverseGain(d);
  }
}

export { COLS, ROWS, ROOM, HEIGHT };
