import { useEffect, useRef, useState } from 'preact/hooks';
import { Game } from '../game/Game.js';
import * as S from '../game/state.js';
import { LESSONS, LESSON_ORDER, LESSON_INDEX } from '../lessons/index.js';
import { COLS, ROWS, ROOM } from '../game/world.js';
import { MODELS, MODELS_NC } from './credits.js';

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
      // Línea del recorrido, pasando por las puertas: las que cambian de fila están corridas hacia el este.
      g.strokeStyle = '#ffffff88'; g.lineWidth = 1.5; g.beginPath(); LESSON_ORDER.forEach((l, i) => { const x = (l.col + .5) * ROOM * k, y = (l.row + .5) * ROOM * k, prev = LESSON_ORDER[i - 1]; if (!prev) { g.moveTo(x, y); return; } if (prev.row !== l.row) { g.lineTo(x + 3.7 * k, (prev.row + .5) * ROOM * k); g.lineTo(x + 3.7 * k, y); } g.lineTo(x, y); }); g.stroke();
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

const nn = (i) => String(i + 1).padStart(2, '0');
const Origin = () => <p class="m-origin">Nació para entender cómo está hecho <a href="https://halloween.dev" target="_blank" rel="noopener noreferrer">The Last Deploy</a>, el juego 3D de <b>midudev</b>.</p>;
const HEADPHONES = 'Usá auriculares: el sonido cambia según dónde estés parado.';
const CONTROLS = [['W A S D', 'Caminar'], ['Shift', 'Correr'], ['Mouse', 'Mirar'], ['E o click', 'Leer o usar lo que apuntás'], ['Click derecho', 'Ir hasta ese punto'], ['Tab', 'En un pizarrón, probar caminando'], ['Esc', 'Abrir este menú']];
const touch = () => matchMedia('(hover: none) and (pointer: coarse)').matches;

// Regla de doce segmentos: durante la carga avanza, y después muestra las salas visitadas con su color.
function Ticks({ loading }) {
  return <div class="m-ticks" aria-hidden="true">{LESSON_ORDER.map((l, i) => {
    const on = loading ? i < S.loadProgress.value : S.visited.value.has(l.id);
    return <i class={on ? 'on' : ''} style={{ '--c': loading ? 'var(--a)' : l.color }} />;
  })}</div>;
}

function CreditRows({ list }) {
  return <ul>{list.map((m) => <li><a href={m.url} target="_blank" rel="noopener noreferrer">{m.name}</a><span>{m.author}</span><small>{m.license}</small></li>)}</ul>;
}

function Menu() {
  const start = S.mode.value === 'start', ready = !S.loadStatus.value;
  const [view, setView] = useState('root');
  const [hint, setHint] = useState(null);
  const root = useRef(null), back = useRef(null);
  const seen = S.visited.value.size, next = LESSON_ORDER.find((l) => !S.visited.value.has(l.id));
  const here = game?.current ? LESSON_INDEX[game.current.id] : 0;
  const main = !start
    ? { label: 'Seguir caminando', run: () => game.begin(), hint: '' }
    : seen === 0 ? { label: 'Entrar al laboratorio', run: () => game.begin(), hint: 'Doce salas para recorrer. En cada una, un pizarrón explica cómo se resuelve una parte de un juego 3D, y después lo probás caminando. Quien arma el laboratorio salió un momento y dejó notas pegadas por ahí.' }
    : next ? { label: `Seguir en la sala ${nn(LESSON_INDEX[next.id])}`, run: () => game.teleport(next.id), hint: `${next.title}. ${next.tagline}` }
    : { label: 'Volver al laboratorio', run: () => game.begin(), hint: 'Ya pasaste por las doce salas. Podés recorrerlas de nuevo cuando quieras: Estrella sigue esperando donde la dejaste.' };
  const open = (v, e) => { back.current = e.currentTarget.dataset.key; setView(v); };
  const nav = (key, text) => ({ 'data-nav': key, onFocus: () => setHint(text), onPointerEnter: (e) => e.currentTarget.focus({ preventScroll: true }) });

  useEffect(() => {
    if (!ready) return;
    const q = view === 'root' && back.current ? `[data-nav="${back.current}"]` : view === 'rooms' ? `[data-nav="${(!start ? LESSON_ORDER[here] : next ?? LESSON_ORDER[0]).id}"]` : '[data-nav]';
    root.current?.querySelector(q)?.focus({ preventScroll: true });
    if (view === 'root') back.current = null;
  }, [view, ready]);

  useEffect(() => {
    const k = (e) => {
      if (e.code === 'Escape' && view !== 'root') { setView('root'); return; }
      if (view === 'credits') return;
      const list = [...(root.current?.querySelectorAll('[data-nav]') ?? [])], i = list.indexOf(document.activeElement);
      if (!list.length) return;
      const go = (n) => { e.preventDefault(); list[(n + list.length) % list.length].focus({ preventScroll: true }); };
      if (e.code === 'ArrowDown' || e.code === 'KeyS') go(i + 1);
      if (e.code === 'ArrowUp' || e.code === 'KeyW') go(i - 1);
      if (e.code === 'Home') go(0);
      if (e.code === 'End') go(list.length - 1);
    };
    addEventListener('keydown', k); return () => removeEventListener('keydown', k);
  }, [view]);

  const fs = <div class="m-corner"><FullscreenButton /></div>;
  const notice = S.notice.value && <div class="notice">{S.notice}</div>;

  if (view === 'credits') return <div class="menu" ref={root}>
    <div class="m-shade" />
    <section class="m-credits" tabIndex={0}><div>
      <h2>Créditos</h2>
      <h3>La idea original</h3>
      <p><a href="https://halloween.dev" target="_blank" rel="noopener noreferrer">The Last Deploy</a> es un juego de <b>midudev</b>. Este laboratorio nació para entender cómo funciona, y todo el crédito de la idea original es suyo. Es un proyecto de estudio independiente, sin relación oficial con el juego ni con su autor.</p>
      <h3>Modelos 3D</h3>
      <p>Estos modelos se usan con licencia <a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noopener noreferrer">CC BY 4.0</a>. Para que pesen menos, simplificamos las mallas y comprimimos la geometría y las texturas. En el monitor cambiamos la imagen de la pantalla.</p>
      <CreditRows list={MODELS} />
      <h3>Modelos de uso no comercial</h3>
      <p>Estos tres modelos solo se pueden usar en proyectos sin fines comerciales. Para que pesen menos, redujimos sus texturas y comprimimos o simplificamos su geometría.</p>
      <CreditRows list={MODELS_NC} />
    </div></section>
    <button class="m-back m-corner-btn" data-nav="back" onClick={() => setView('root')}>Volver <kbd>Esc</kbd></button>
  </div>;

  if (view === 'rooms') return <div class={`menu ${start ? '' : 'pause'}`} ref={root}>
    <div class="m-shade" />{fs}
    <div class="m-col list">
      <header><h2 class="m-sub">Elegir sala</h2><p class="m-meta">{seen} de 12 visitadas</p></header>
      <nav class="m-rooms" aria-label="Salas">{LESSON_ORDER.map((l, i) => <button class="m-room" style={{ '--r': l.color }} {...nav(l.id, l.tagline)} onClick={() => game.teleport(l.id)}><i>{nn(i)}</i><span>{l.title}</span>{S.visited.value.has(l.id) && <small>visitada</small>}</button>)}</nav>
      <div><p class="m-desc">{hint}</p><button class="m-back" {...nav('back', '')} onClick={() => setView('root')}><kbd>Esc</kbd> Volver</button></div>
    </div>{notice}
  </div>;

  return <div class={`menu ${start ? '' : 'pause'} ${ready ? 'ready' : ''}`} ref={root}>
    {start && <div class="m-veil" />}
    <div class="m-shade" />{ready && fs}
    <div class="m-col">
      <header class="m-brand">
        {start ? <h1 class="m-title">Laboratorio<small>de juegos web</small></h1> : <h1 class="m-title">Pausa</h1>}
        <Ticks loading={!ready} />
        {start ? <Origin /> : <p class="m-meta">Estás en la sala {nn(here)}: {S.roomName} · {seen} de 12 visitadas</p>}
      </header>
      {ready
        ? <nav class="m-list" aria-label="Menú">
            <button class="m-item main" data-key="main" {...nav('main', main.hint)} onClick={main.run}>{main.label}</button>
            <button class="m-item" data-key="rooms" {...nav('rooms', 'Saltá directo a cualquiera de las doce salas.')} onClick={(e) => open('rooms', e)}>Elegir sala{seen > 0 && <span>{seen}/12</span>}</button>
            <button class="m-item" data-key="credits" {...nav('credits', 'Quién hizo cada modelo 3D y de dónde salió la idea.')} onClick={(e) => open('credits', e)}>Créditos</button>
          </nav>
        : <p class="m-status" role="status">{S.loadStatus}</p>}
      <div class="m-low">
        {touch() && start && <p class="m-note">Por ahora se juega en computadora, con teclado y mouse.</p>}
        <p class="m-desc">{ready ? hint : ''}</p>
      </div>
    </div>
    {start
      ? <p class="m-foot">{HEADPHONES}</p>
      : <div class="m-foot"><dl class="m-controls">{CONTROLS.map(([k, v]) => <><dt>{k}</dt><dd>{v}</dd></>)}</dl><p>{HEADPHONES}</p></div>}
    {notice}
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
    {error ? <div class="menu ready"><div class="m-shade" /><div class="m-col"><header class="m-brand"><h1 class="m-sub">No se pudo abrir el laboratorio</h1><p class="m-origin">Probá recargar la página. Si sigue sin abrir, usá Chrome o Edge actualizados en una computadora.</p></header><nav class="m-list"><button class="m-item main" onClick={() => location.reload()}>Recargar</button></nav><div class="m-low"><Origin /></div></div></div> : <>
      {m !== 'start' && m !== 'paused' && <Hud />}
      {(m === 'start' || m === 'paused') && <Menu />}
      {(m === 'lesson' || m === 'try') && <Lesson />}
    </>}
  </>;
}
