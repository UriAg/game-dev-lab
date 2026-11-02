import { useEffect, useRef, useState } from 'preact/hooks';
import { Game } from '../game/Game.js';
import * as S from '../game/state.js';
import { LESSONS, LESSON_ORDER, LESSON_INDEX } from '../lessons/index.js';
import { COLS, ROWS, ROOM } from '../game/world.js';

let game;

function applyParam(lesson, ctl, p) {
  if (ctl.apply === 'tsl') game.world.exhibits.webgpu.u[ctl.key].value = p[ctl.key];
  if (ctl.apply === 'quant') game.world.exhibits.compression.setBits(p.bitsDemo);
  if (ctl.apply === 'fx') { game.fx[ctl.key] = p[ctl.key]; game.applyFx(); }
  if (ctl.apply === 'dofLevel') game.setDof(p.dofLevel);
  if (ctl.apply === 'feel') game.feel[ctl.key] = p[ctl.key];
  if (ctl.apply === 'walkK') game.feel.k = p.walkK;
  if (ctl.apply === 'audio') {
    if (ctl.key === 'sound') game.sound.speakerOn = p.sound;
    if (ctl.key === 'hrtf') game.sound.setPanning(p.hrtf ? 'HRTF' : 'equalpower');
    if (ctl.key === 'reverb') game.sound.setReverb(p.reverb);
    if (ctl.key === 'orbit') game.world.exhibits.audio.orbit = p.orbit;
  }
  ctl.onChange?.(p, game);
}

function Control({ ctl, lesson }) {
  S.paramsRev.value;
  const p = lesson.params;
  const set = (v) => { p[ctl.key] = v; applyParam(lesson, ctl, p); S.paramsRev.value++; };
  if (ctl.type === 'button') return <button class="btn" onClick={() => { ctl.action(p, game); S.paramsRev.value++; }}>{ctl.label}</button>;
  if (ctl.type === 'toggle') return <label class="tog"><input id={`c-${lesson.id}-${ctl.key}`} type="checkbox" checked={p[ctl.key]} onChange={(e) => set(e.currentTarget.checked)} /><span>{ctl.label}</span></label>;
  if (ctl.type === 'select') return <label class="ctl"><span>{ctl.label}</span><select id={`c-${lesson.id}-${ctl.key}`} value={p[ctl.key]} onChange={(e) => set(ctl.num ? Number(e.currentTarget.value) : e.currentTarget.value)}>{ctl.options.map(([v, l]) => <option value={v}>{l}</option>)}</select></label>;
  return <label class="ctl"><span>{ctl.label} <b>{ctl.fmt ? ctl.fmt(p[ctl.key]) : p[ctl.key]}</b></span><input id={`c-${lesson.id}-${ctl.key}`} type="range" min={ctl.min} max={ctl.max} step={ctl.step} value={p[ctl.key]} onInput={(e) => set(Number(e.currentTarget.value))} />{ctl.mark && <small class={`mark ${p[ctl.key] >= ctl.mark.at ? 'hit' : ''}`}>{ctl.mark.text}</small>}</label>;
}

function DemoCanvas({ lesson }) {
  const ref = useRef(null);
  useEffect(() => {
    const c = ref.current, g = c.getContext('2d');
    const mouse = { x: 0, y: 0, down: false, pressed: false, has: false, button: 0, dx: 0 };
    const pos = (e) => { const r = c.getBoundingClientRect(); mouse.x = (e.clientX - r.left) * 960 / r.width; mouse.y = (e.clientY - r.top) * 600 / r.height; mouse.has = true; };
    const mv = (e) => { pos(e); mouse.dx += e.movementX || 0; }, dn = (e) => { pos(e); mouse.down = true; mouse.pressed = true; mouse.button = e.button; c.setPointerCapture?.(e.pointerId); }, up = () => { mouse.down = false; };
    c.addEventListener('pointermove', mv); c.addEventListener('pointerdown', dn); c.addEventListener('pointerup', up);
    let t = 0;
    game.setMirror(c); game.demoCanvas = c;
    const lockChange = () => { if (lesson.id === 'input' && document.pointerLockElement !== c && lesson.params.lock) { lesson.params.lock = false; S.paramsRev.value++; } };
    document.addEventListener('pointerlockchange', lockChange);
    game.onFrame = (dt) => {
      t += dt;
      lesson.demo(g, 960, 600, { t, dt, p: lesson.params, step: S.stepIndex.value, game, mouse, mode: S.mode.value });
      mouse.pressed = false;
    };
    return () => { document.removeEventListener('pointerlockchange', lockChange); game.onFrame = null; game.demoYaw = null; c.removeEventListener('pointermove', mv); c.removeEventListener('pointerdown', dn); c.removeEventListener('pointerup', up); };
  }, [lesson]);
  return <canvas ref={ref} width={960} height={600} class="demo" aria-label={`Gráfico interactivo: ${lesson.title}`} />;
}

function Lesson() {
  const lesson = LESSONS[S.lessonId.value]; if (!lesson) return null;
  const i = S.stepIndex.value, step = lesson.steps[i], last = i === lesson.steps.length - 1, trying = S.mode.value === 'try';
  S.paramsRev.value;
  const controls = step.controlsFn ? step.controlsFn(game) : step.controls;
  const [copied, setCopied] = useState(false);
  const copy = (txt) => navigator.clipboard.writeText(txt).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); });
  useEffect(() => {
    const k = (e) => { if (S.mode.value !== 'lesson' || e.target?.tagName === 'INPUT' || e.target?.tagName === 'TEXTAREA' || e.target?.tagName === 'SELECT') return; if (e.code === 'ArrowRight') S.stepIndex.value = Math.min(i + 1, lesson.steps.length - 1); if (e.code === 'ArrowLeft') S.stepIndex.value = Math.max(i - 1, 0); };
    addEventListener('keydown', k); return () => removeEventListener('keydown', k);
  }, [i, lesson]);
  return (
    <div class={`lesson ${trying ? 'trying' : ''}`} style={{ '--room': lesson.color }}>
      <div class="stage"><DemoCanvas lesson={lesson} />{trying && <div class="tryhint">Caminá con WASD. <kbd>Tab</kbd> vuelve a la lección.{lesson.id === 'audio' && <> <kbd>M</kbd> silencia el parlante.</>}</div>}</div>
      {!trying && <aside class="panel">
        <header><span class="eyebrow">Sala {String(LESSON_INDEX[lesson.id] + 1).padStart(2, '0')}: {lesson.title}</span>
          <div class="dots">{lesson.steps.map((_, k) => <button aria-label={`Paso ${k + 1}`} class={k === i ? 'on' : ''} onClick={() => { S.stepIndex.value = k; }} />)}</div><button class="close" aria-label="Cerrar pizarrón" title="Cerrar (Esc)" onClick={() => game.closeLesson()}>×</button></header>
        <div class="scroll">
          <h2>{step.h}</h2>
          <div class="prose" dangerouslySetInnerHTML={{ __html: step.body }} />
          {step.code && <pre><code>{step.code}</code></pre>}
          {controls && <div class="controls">{controls.map((c) => <Control ctl={c} lesson={lesson} />)}</div>}
          {lesson.output && i === 1 && <div class="out"><textarea id="prompt-output" readOnly value={lesson.output(lesson.params)} /><button class="btn" onClick={() => copy(lesson.output(lesson.params))}>{copied ? 'Copiado' : 'Copiar prompt'}</button></div>}
          {last && <section class="recap"><h3>Vocabulario</h3><div class="chips">{lesson.vocab.map((v) => <span>{v}</span>)}</div>
            <h3>Cómo pedírselo a una IA</h3><blockquote>{lesson.prompt}</blockquote><button class="btn ghost" onClick={() => copy(lesson.prompt)}>{copied ? 'Copiado' : 'Copiar'}</button></section>}
        </div>
        <footer>
          {i === 0 ? <button class="btn ghost" onClick={() => game.closeLesson()}>Cerrar</button> : <button class="btn ghost" onClick={() => { S.stepIndex.value = i - 1; }}>Anterior</button>}
          <button class="btn try" onClick={() => game.tryWalking()}>Probar caminando <kbd>Tab</kbd></button>
          {last ? <button class="btn" onClick={() => game.closeLesson()}>Volver a la sala</button> : <button class="btn" onClick={() => { S.stepIndex.value = i + 1; }}>Siguiente</button>}
        </footer>
      </aside>}
    </div>
  );
}

function Minimap() {
  const ref = useRef(null);
  useEffect(() => {
    const id = setInterval(() => {
      const c = ref.current; if (!c || !game?.world) return; const g = c.getContext('2d'), k = 4.2;
      g.clearRect(0, 0, c.width, c.height);
      for (const l of LESSON_ORDER) { g.fillStyle = S.visited.value.has(l.id) ? `${l.color}66` : '#ffffff14'; g.fillRect(l.col * ROOM * k + 1, l.row * ROOM * k + 1, ROOM * k - 2, ROOM * k - 2); }
      const px = game.pos.x * k, pz = game.pos.z * k; g.fillStyle = '#fff'; g.beginPath(); g.moveTo(px - Math.sin(game.yaw) * 9, pz - Math.cos(game.yaw) * 9); g.lineTo(px + Math.cos(game.yaw) * 5, pz - Math.sin(game.yaw) * 5); g.lineTo(px - Math.cos(game.yaw) * 5, pz + Math.sin(game.yaw) * 5); g.fill();
    }, 100);
    return () => clearInterval(id);
  }, []);
  return <canvas ref={ref} class="mini" width={COLS * ROOM * 4.2} height={ROWS * ROOM * 4.2} aria-hidden="true" />;
}

function FullscreenButton() {
  return <button class="fs" title="Pantalla completa (F)" onClick={() => game.toggleFullscreen()}>{S.fullscreen.value ? 'Salir de pantalla completa' : 'Pantalla completa'} <kbd>F</kbd></button>;
}

function Hud() {
  return <div class="hud">
    <div class="tl"><Minimap /><div class="room">{S.roomName}</div></div>
    <div class="tr"><span><span>{S.fps}</span> FPS · {S.backendName} · <span>{S.visited.value.size}</span>/12</span><FullscreenButton /></div>
    {(S.mode.value === 'walk' || S.mode.value === 'try') && <i class={S.promptText.value ? 'cross on' : 'cross'} />}
    {S.promptText.value && (S.mode.value === 'walk' || S.mode.value === 'try') && <div class="promptbar"><kbd>E</kbd> <b>{S.promptText}</b></div>}
    {S.notice.value && <div class="notice">{S.notice}</div>}
    {S.mode.value === 'walk' && <div class="keys"><kbd>WASD</kbd> caminar <kbd>Shift</kbd> correr <kbd>Click der.</kbd> ir a un punto <kbd>F</kbd> pantalla completa <kbd>Esc</kbd> menú</div>}
  </div>;
}

function Menu() {
  const start = S.mode.value === 'start', ready = !S.loadStatus.value;
  return <div class="menu">
    <div class="menucard">
      <p class="eyebrow">Laboratorio jugable</p>
      <h1>{start ? 'Laboratorio de juegos web' : 'Pausa'}</h1>
      <p class="lead">Doce salas, doce pizarrones. Cada uno explica una técnica de cómo se hace un juego 3D en el navegador, y este juego está hecho con esas mismas técnicas.</p>
      <button class="btn big" disabled={!ready} onClick={() => game.begin()}>{ready ? (start ? 'Entrar' : 'Seguir caminando') : S.loadStatus}</button>
      {ready && <><h3>Ir directo a una sala</h3><div class="rooms">{LESSON_ORDER.map((l, i) => <button style={{ '--room': l.color }} class={S.visited.value.has(l.id) ? 'seen' : ''} onClick={() => game.teleport(l.id)}><i>{String(i + 1).padStart(2, '0')}</i>{l.title}</button>)}</div></>}
      <div class="menufoot"><p class="hint">Para el audio espacial, usá auriculares.</p><FullscreenButton /></div>
      <p class="credit">Este sitio se basó en <a href="https://halloween.dev" target="_blank" rel="noopener noreferrer"><b>The Last Deploy</b></a>, el juego de <b>midudev</b>, para aprender cómo funciona. Todo el crédito de la idea original es suyo. Este es un proyecto de estudio independiente, sin relación oficial con el juego ni con su autor.</p>
      <p class="credit">Modelos 3D con licencia CC BY 4.0: Office Chair (j.a.m), Industrial Table (Elasta Kristya), Cpu (Lutvi Angreani), Gaming keyboard (ZxTulz), Ultrawide Monitor (dylanheyes), Stage Speaker (Sousinho), Server Racking System (wpanayides), Caja_1 (roberto_herreratec) y Rusty metal floor texture (patspet). Con licencia CC BY-NC: TV Screen (Théo Richard) y Mannequin Head #3 (Switch &amp; Lever). Con licencia CC BY-NC-SA: Mouse - Razer DeathAdder (gimora). Lista completa en CREDITOS.md.</p>
    </div>
  </div>;
}

export default function App() {
  const ref = useRef(null);
  S.uiStats.appRenders++;
  const [error, setError] = useState(null);
  useEffect(() => { S.loadVisited(); game = new Game(ref.current); game.start().catch((e) => { console.error(e); setError(e.message); }); }, []);
  const m = S.mode.value;
  return <>
    <canvas ref={ref} class="world" />
    {error ? <div class="menu"><div class="menucard"><h1>No pude iniciar el juego</h1><p class="lead">{error}</p></div></div> : <>
      {m !== 'start' && <Hud />}
      {(m === 'start' || m === 'paused') && <Menu />}
      {(m === 'lesson' || m === 'try') && <Lesson />}
    </>}
  </>;
}
