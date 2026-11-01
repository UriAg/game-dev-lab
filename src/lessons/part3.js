import { C, clear, text, mono, line, arrow, dot, ring, rect, lerp, clamp, HEAD } from './draw.js';
import { heavyJob } from '../workers/heavyJob.js';
import { inverseGain } from '../game/audio.js';
import { paramsRev } from '../game/state.js';

const MUTE = { type: 'toggle', key: 'sound', label: 'Sonido de la esfera (M caminando)', apply: 'audio' };

// ---------------------------------------------------------------- WORKERS
let worker;
const getWorker = () => worker ??= new Worker(new URL('../workers/heavy.worker.js', import.meta.url), { type: 'module' });
const runMain = (p) => { const t = performance.now(); heavyJob(p.ms); p.log = `Hilo principal: ${(performance.now() - t).toFixed(0)} ms con la pantalla congelada`; p.mark = { kind: 'main', at: performance.now() }; };
const runWorker = (p) => { const w = getWorker(); p.busy = true; p.log = 'Worker trabajando...'; p.spin = 0; w.onmessage = ({ data }) => { p.busy = false; p.log = `Worker: ${data.took.toFixed(0)} ms, sin perder frames. Buffer transferido: ${(data.buffer.byteLength / 1048576).toFixed(0)} MB`; }; w.postMessage({ ms: p.ms }); };
const workers = {
  id: 'workers', col: 0, row: 2, color: '#a493ff', title: 'Tareas en segundo plano', tagline: 'Cómo hacer trabajo pesado sin congelar la pantalla: Web Workers.',
  params: { ms: 1200, log: 'Tocá uno de los dos botones del panel.', busy: false, ang: 0 },
  steps: [
    { h: 'Por qué un juego se congela: un solo hilo para todo', body: `<p>JavaScript corre en un <b>hilo principal</b>, y hace una cosa por vez: tu código, el layout, los clicks, y el pintado.</p><p>Para 60 FPS tenés <b>16,6 ms</b> por frame. Si una función tarda 200 ms, durante ese tiempo no hay frames, ni clicks, ni nada: la página se congela.</p><p>Mirá el gráfico: cada barra es la duración real de un frame. La línea es el límite para llegar a 60 FPS.</p>` },
    { h: 'Probalo: congelar el juego y evitarlo con un worker', controls: [{ type: 'range', key: 'ms', label: 'Duración del trabajo', min: 200, max: 3000, step: 100, fmt: (v) => `${v} ms` }, { type: 'button', label: 'Correr en el hilo principal', action: (p) => setTimeout(() => runMain(p), 30) }, { type: 'button', label: 'Correr en un Worker', action: (p) => runWorker(p) }], body: `<p>Los dos botones ejecutan <b>exactamente la misma función</b>.</p><p>En el hilo principal se congela todo: el círculo, el cubo del pedestal, hasta este panel. Y aparece un pico rojo gigante en el gráfico.</p><p>En el Worker, el círculo sigue girando como si nada.</p><p>Un <b>Web Worker</b> es JavaScript en otro hilo real. Tiene una limitación fuerte: <b>no puede tocar el DOM</b>. Solo intercambia mensajes con el hilo principal.</p>`, code: `const w = new Worker(new URL('./heavy.js', import.meta.url),\n                     { type: 'module' });\nw.postMessage({ ms: 1200 });\nw.onmessage = (e) => usar(e.data);` },
    { h: 'Cómo hablan los hilos: copiar o transferir datos', body: `<p>Los hilos no comparten variables. Por defecto, <code>postMessage</code> <b>clona</b> los datos: con 100 MB de audio, copiar ya es lento.</p><p>Con un <b>Transferable</b>, como un <code>ArrayBuffer</code>, el buffer <b>se muda</b>: no se copia nada, pero el hilo que lo mandó deja de poder usarlo.</p><p>Copiar es sacar una fotocopia; transferir es pasarle el original a otro.</p>`, code: `postMessage({ buffer }, [buffer]);` },
    { h: 'Qué conviene mandar a un worker: tres casos típicos', body: `<p>En un juego web, estas tres tareas suelen ir a un worker:</p><ul><li><b>Texturas:</b> decodificar imágenes pesadas.</li><li><b>Audio:</b> generar datos de sonido, como ruidos e impulsos.</li><li><b>Pantallas dentro del mundo:</b> dibujar un monitor o una cámara de seguridad con <code>OffscreenCanvas</code>, un canvas que funciona fuera del hilo principal.</li></ul><p>Este juego lo hace con las texturas: Basis corre en workers propios del loader. El patrón es siempre igual: <b>cualquier cosa que tarde más de unos pocos ms y no necesite el DOM, afuera del hilo principal</b>.</p><p>Sirve también en una web común: parsear un CSV grande, ordenar miles de filas, comprimir una imagen antes de subirla.</p>` },
  ],
  demo(g, W, H, x) {
    clear(g, W, H); const { p, step, game } = x; p.ang += x.dt * 4;
    const f = game.frameTimes.slice(-170), base = 340, scale = 1.6;
    if (step === 0 || step === 1) {
      text(g, 'Duración de cada frame', 70, 60, { size: 24, weight: 700, font: HEAD }); line(g, 70, base, 900, base);
      f.forEach((v, i) => { const h = clamp(v * scale, 2, 270); rect(g, 70 + i * 4.8, base - h, 3.6, h, v > 33 ? C.c : v > 18 ? C.y : C.b); });
      const lim = base - 16.6 * scale; line(g, 70, lim, 900, lim, C.ok, 2, [6, 6]); text(g, '16,6 ms', 800, lim - 8, { color: C.ok, size: 16 });
      ring(g, 150, 465, 56, C.line, 8); g.strokeStyle = C.a; g.lineWidth = 8; g.beginPath(); g.arc(150, 465, 56, p.ang, p.ang + 1.5); g.stroke();
      text(g, step === 0 ? 'Estos son tus frames, en tiempo real.' : p.log, 240, 472, { size: 22, color: p.busy ? C.y : C.fg });
    } else if (step === 2) {
      const t = (x.t * .6) % 1;
      text(g, 'Clonar', 70, 100, { size: 26, weight: 700, font: HEAD, color: C.y }); rect(g, 70, 130, 150, 90, C.d); rect(g, lerp(70, 650, t), 130, 150, 90, 'rgba(164,147,255,.5)', C.d); text(g, 'Ambos hilos tienen su copia. Costo: proporcional al tamaño.', 70, 256, { color: C.dim, size: 19 });
      text(g, 'Transferir', 70, 340, { size: 26, weight: 700, font: HEAD, color: C.ok }); rect(g, lerp(70, 650, t), 370, 150, 90, C.ok); rect(g, 70, 370, 150, 90, null, C.line); text(g, 'Sin copia. El hilo original pierde el acceso.', 70, 496, { color: C.dim, size: 19 });
    } else {
      rect(g, 70, 90, 300, 400, 'rgba(255,154,60,.08)', C.a); text(g, 'Hilo principal', 220, 130, { align: 'center', size: 22, weight: 700, color: C.a }); ['Render 3D', 'Input', 'UI Preact', 'Lógica del juego'].forEach((s, i) => text(g, s, 220, 200 + i * 60, { align: 'center' }));
      [['Texturas', 100], ['Audio', 230], ['Pantallas', 360]].forEach(([n, y], i) => { rect(g, 600, y, 280, 100, 'rgba(164,147,255,.12)', C.d); text(g, n, 740, y + 58, { align: 'center', color: C.d, size: 22 }); line(g, 376, 290, 594, y + 50, C.line, 2); const t = ((x.t * .5 + i * .3) % 1); dot(g, lerp(594, 376, t), lerp(y + 50, 290, t), 6, C.y); });
    }
  },
  vocab: ['main thread', 'bloquear el hilo', 'Web Worker', 'postMessage', 'Transferable', 'OffscreenCanvas', 'presupuesto de frame'],
  prompt: 'Todo trabajo de más de unos ms va a un Web Worker con módulos ES. Pasá buffers grandes como Transferable para no copiar. Si hay que dibujar en segundo plano, usá OffscreenCanvas. El presupuesto del hilo principal es 16,6 ms por frame.',
};

// ---------------------------------------------------------------- AUDIO
const earGains = (dx, dz, yaw) => { const f = [-Math.sin(yaw), -Math.cos(yaw)], r = [Math.cos(yaw), -Math.sin(yaw)], d = Math.hypot(dx, dz) || 1, side = (dx * r[0] + dz * r[1]) / d, ahead = (dx * f[0] + dz * f[1]) / d, ang = (side + 1) / 2 * Math.PI / 2, g0 = inverseGain(d); return { L: Math.cos(ang) * g0, R: Math.sin(ang) * g0, side, ahead, d, g0 }; };
const audio = {
  id: 'audio', col: 1, row: 2, color: '#ffd34d', title: 'Audio espacial', tagline: 'Cómo un sonido parece venir de un lugar del mundo. Usá auriculares.',
  params: { sound: true, hrtf: true, reverb: true, orbit: true, hist: [] },
  steps: [
    { h: 'Web Audio: cómo se arma el sonido en el navegador', controls: [MUTE], body: `<p>El navegador trae un motor de audio: la <b>Web Audio API</b>. Funciona como una mesa de sonido, enchufando módulos entre sí.</p><p>Cada nodo recibe sonido, lo procesa y lo pasa al siguiente: una fuente, un filtro, un volumen y la salida.</p><p>Mirá el gráfico: es el grafo real de esta sala. <b>Importante:</b> el audio solo arranca después de un gesto del usuario, por eso el juego lo inicia con tu primer click.</p>` },
    { h: 'Cómo ubica un sonido tu cerebro', controls: [MUTE, { type: 'toggle', key: 'orbit', label: 'Órbita automática', apply: 'audio' }], body: `<p>Tu cerebro ubica un sonido con tres pistas:</p><ul><li><b>Diferencia de volumen:</b> la oreja más cerca lo oye más fuerte.</li><li><b>Diferencia de tiempo:</b> llega unos microsegundos antes a una oreja.</li><li><b>Forma de la oreja:</b> filtra frecuencias de forma distinta según si el sonido viene de adelante, atrás o arriba.</li></ul><p>El gráfico gira con vos: tu cabeza siempre mira hacia arriba, así que lo que tenés adelante aparece arriba, con el panel abierto o caminando. Arrastrá el punto amarillo para mover la esfera, o caminá con auriculares. Las barras muestran la diferencia estimada entre orejas.</p>` },
    { h: 'PannerNode y HRTF: poner un sonido en el espacio 3D', controls: [MUTE, { type: 'toggle', key: 'hrtf', label: 'HRTF (si no, equalpower)', apply: 'audio' }], body: `<p>Un <code>PannerNode</code> recibe la posición 3D del sonido y un <code>AudioListener</code> la de tus oídos. Lo demás lo hace el navegador.</p><ul><li><b>equalpower:</b> barato, solo reparte volumen entre izquierda y derecha.</li><li><b>HRTF</b> (Head-Related Transfer Function): filtra con datos medidos sobre cabezas reales, para simular la forma de la oreja. Con auriculares se distingue adelante de atrás.</li></ul><p>Cada frame, el juego actualiza la posición y la orientación del listener con la cámara y el yaw. <b>Es el mismo seno y coseno de la sala 3.</b></p>`, code: `// configuración de este juego\npanner.panningModel = 'HRTF';\npanner.distanceModel = 'inverse';\npanner.refDistance = 1;\npanner.maxDistance = 40;\npanner.rolloffFactor = 1;` },
    { h: 'Atenuación: cómo baja el volumen con la distancia', controls: [MUTE], body: `<p>El volumen no baja en línea recta. Con el modelo <b>inverse</b>:</p><p><code>ganancia = ref / (ref + rolloff * (d - ref))</code></p><p>Hasta 1 metro está al máximo. A 2 metros es la mitad, y a 4 un cuarto.</p><p>Duplicar la distancia reduce la señal a la mitad, y por eso se siente natural: imita a un sonido real.</p>` },
    { h: 'Reverb: hacer que suene a una sala', controls: [MUTE, { type: 'toggle', key: 'reverb', label: 'Reverb por convolución', apply: 'audio' }, { type: 'button', label: 'Aplaudir', action: (p, game) => { game.sound.init(); game.sound.clap(); } }], body: `<p>En una sala real no escuchás solo el sonido directo, sino miles de rebotes.</p><p>Un <code>ConvolverNode</code> toma una <b>respuesta al impulso</b>: la grabación de un aplauso en un lugar, que describe su acústica. Después se la aplica a cualquier sonido, que pasa a sonar "ahí".</p><p>Este juego la genera con código: ruido que se apaga. Así no necesita un archivo de audio.</p><p>La reverb se escucha en la <b>cola</b> que queda cuando un sonido se corta, por eso casi no se nota en un zumbido continuo. Silenciá la esfera y tocá <b>Aplaudir</b> con la reverb prendida y apagada. El gráfico dibuja el sonido directo y la cola. Los pasos también pasan por la reverb.</p><p>El mismo juego también usa un <b>AudioWorklet</b>: procesamiento propio en el hilo de audio, para un filtro tipo 16 bits.</p>` },
  ],
  demo(g, W, H, x) {
    clear(g, W, H); const { p, step, game, mouse } = x, ex = game.world.exhibits.audio;
    if (step === 0) {
      const ns = [['Oscilador', 70, C.a], ['Filtro', 250, C.b], ['Panner', 430, C.y], ['Reverb', 610, C.d], ['Salida', 790, C.ok]]; ns.forEach(([n, X, col], i) => { rect(g, X, 240, 140, 80, '#141d2c', col); text(g, n, X + 70, 288, { align: 'center', size: 19, color: col }); if (i < 4) arrow(g, X + 142, 280, X + 178, 280, C.line, 3); });
      g.strokeStyle = C.a; g.lineWidth = 3; g.beginPath(); for (let i = 0; i < 180; i++) { const Y = 150 + Math.sin(i * .25 + x.t * 6) * 40; i ? g.lineTo(70 + i * 4.6, Y) : g.moveTo(70, Y); } g.stroke();
      text(g, game.sound.ctx ? `AudioContext: ${game.sound.ctx.state}, ${game.sound.ctx.sampleRate} Hz` : 'AudioContext sin iniciar', 70, 430, { color: C.dim });
    } else if (step === 1 || step === 2 || step === 4) {
      if (step === 4) { const lv = game.sound.levels(); p.hist.push(lv); if (p.hist.length > 170) p.hist.shift(); text(g, 'Sonido en el tiempo', 70, 54, { size: 24, weight: 700, font: HEAD }); text(g, 'directo', 300, 54, { color: C.a, size: 18 }); text(g, 'cola de reverb', 380, 54, { color: C.d, size: 18 });
        const base = 330, sc = 900; line(g, 60, base, 900, base); p.hist.forEach((s, i) => { const X = 60 + i * 4.9; rect(g, X, base - clamp(s.wet * sc, 0, 250), 4, clamp(s.wet * sc, 0, 250), C.d); rect(g, X, base - clamp(s.dry * sc, 0, 250), 2, clamp(s.dry * sc, 0, 250), C.a); });
        const last = p.hist.slice(-40).reduce((m, s) => Math.max(m, s.wet), 0); text(g, p.reverb ? 'Reverb prendida: tocá Aplaudir y mirá la cola violeta apagarse de a poco.' : 'Reverb apagada: el sonido se corta en seco.', 70, 390, { size: 21, weight: 600 }); mono(g, `nivel de cola: ${(last * 100).toFixed(1).replace('.', ',')}`, 70, 430, C.d, 20); text(g, 'Silenciá la esfera para ver mejor los aplausos.', 70, 470, { color: C.dim, size: 18 }); return; }
      const cx = 300, cy = 300, U = 40, y = game.yaw, fx = -Math.sin(y), fz = -Math.cos(y), rx = Math.cos(y), rz = -Math.sin(y);
      if (mouse.down && mouse.x < 600) {
        // Del gráfico al mundo: arriba es adelante y a la derecha es tu derecha.
        const b = (mouse.x - cx) / U, a = (cy - mouse.y) / U, wx = game.pos.x + rx * b + fx * a, wz = game.pos.z + rz * b + fz * a;
        if (ex.orbit) { ex.orbit = false; p.orbit = false; paramsRev.value++; } ex.offset.set(wx - ex.center.x, wz - ex.center.z);
      }
      const dx = ex.pos.x - game.pos.x, dz = ex.pos.z - game.pos.z, eg = earGains(dx, dz, y), ahead = dx * fx + dz * fz, right = dx * rx + dz * rz;
      ring(g, cx, cy, U, C.line); ring(g, cx, cy, U * 2, C.grid); ring(g, cx, cy, U * 4, C.grid); ring(g, cx, cy, U * 6.5, C.grid);
      dot(g, cx, cy, 22, '#3a4a68'); arrow(g, cx, cy, cx, cy - 42, C.fg, 3); dot(g, cx - 24, cy, 7, C.b); dot(g, cx + 24, cy, 7, C.a); text(g, 'adelante', cx, cy - 280, { align: 'center', color: C.dim, size: 15 });
      const sx = cx + clamp(right, -6.5, 6.5) * U, sy = cy - clamp(ahead, -6.5, 6.5) * U; for (let i = 1; i <= 3; i++) ring(g, sx, sy, ((x.t * 30 + i * 22) % 66) + 8, 'rgba(255,211,77,.35)'); dot(g, sx, sy, 13, C.y);
      text(g, 'Izquierda', 650, 150, { color: C.b }); rect(g, 650, 165, eg.L * 250, 36, C.b); text(g, 'Derecha', 650, 245, { color: C.a }); rect(g, 650, 260, eg.R * 250, 36, C.a);
      mono(g, `d = ${eg.d.toFixed(1)} m`, 650, 370, C.fg, 22); mono(g, eg.ahead > .2 ? 'adelante' : eg.ahead < -.2 ? 'atrás' : 'al costado', 650, 408, C.y, 22);
      text(g, step === 2 ? (p.hrtf ? 'HRTF activo' : 'equalpower activo') : 'Las barras son una estimación visual', 650, 460, { color: C.dim, size: 19 }); text(g, p.sound ? 'Esfera sonando' : 'Esfera en silencio', 650, 490, { color: p.sound ? C.y : C.dim, size: 19 });
    } else {
      const ox = 90, oy = 490, sx = 19, sy = 400; line(g, ox, oy, ox + 800, oy); line(g, ox, oy, ox, oy - 420);
      g.strokeStyle = C.y; g.lineWidth = 4; g.beginPath(); for (let d = 0; d <= 40; d += .1) { const X = ox + d * sx, Y = oy - inverseGain(d) * sy; d ? g.lineTo(X, Y) : g.moveTo(X, Y); } g.stroke();
      [1, 2, 4, 8].forEach((d) => { const X = ox + d * sx, Y = oy - inverseGain(d) * sy; dot(g, X, Y, 7, C.a); text(g, `${d} m: ${Math.round(inverseGain(d) * 100)}%`, X + 10, Y - 10, { size: 17, color: C.a }); });
      text(g, 'distancia (m)', 760, 524, { color: C.dim, size: 16 }); text(g, 'ganancia', 104, 80, { color: C.dim, size: 16 });
      const d = game.camera.position.distanceTo(ex.pos); if (d < 40) { const X = ox + d * sx, Y = oy - inverseGain(d) * sy; dot(g, X, Y, 10, C.ok); text(g, 'vos', X + 12, Y + 24, { color: C.ok, size: 17 }); }
    }
  },
  vocab: ['Web Audio API', 'grafo de audio', 'PannerNode', 'AudioListener', 'HRTF', 'distance model', 'convolución', 'respuesta al impulso', 'AudioWorklet'],
  prompt: 'Audio posicional con Web Audio: PannerNode en HRTF con distanceModel inverse, AudioListener actualizado cada frame con posición y yaw de la cámara. Reverb con ConvolverNode e impulso procedural. Iniciá el AudioContext en un gesto del usuario.',
};

// ---------------------------------------------------------------- GAME FEEL
const gamefeel = {
  id: 'gamefeel', col: 2, row: 2, color: '#ff9a3c', title: 'Por qué se siente bien', tagline: 'Game feel: detalles que no se ven, pero hacen agradable moverse.',
  params: { bob: true, roll: true, steps: true, smooth: true, hist: [] },
  steps: [
    { h: 'Game feel: por qué un juego se siente bien', controls: [{ type: 'toggle', key: 'smooth', label: 'Velocidad suavizada (arrancás y frenás de a poco, sin saltos)', apply: 'feel' }, { type: 'toggle', key: 'bob', label: 'Head bob (la cámara sube y baja al caminar)', apply: 'feel' }, { type: 'toggle', key: 'roll', label: 'Camera roll (la pantalla se inclina apenas al girar el mouse rápido)', apply: 'feel' }, { type: 'toggle', key: 'steps', label: 'Pasos (suena un paso cada 1,45 m)', apply: 'feel' }], body: `<p><b>Game feel</b> (o <i>juice</i>) es todo lo que no cambia las reglas, pero hace que moverse se sienta bien.</p><p>El mejor experimento: tocá <b>Probar caminando</b>, apagá los cuatro toggles y caminá. Después prendelos uno a uno.</p><p>Sin ellos, sos una cámara deslizándose. Con ellos, un cuerpo. Es lo que más distingue "funciona" de "se siente profesional".</p>` },
    { h: 'Pasos: sonar por distancia, no por tiempo', body: `<p>Lo fácil es reproducir un paso cada 0,4 segundos. Pero si corrés, los pasos no aceleran, y si te frenás contra una pared siguen sonando.</p><p>Lo correcto: acumular <b>distancia recorrida</b> y sonar al llegar a una zancada. Caminar, correr, frenar y chocar funcionan solos, sin ningún caso especial.</p><p>Es un patrón general: atá el efecto a la <b>causa real</b>, no a un temporizador.</p><p>Caminá y mirá el gráfico: cada marca es un paso. Con <kbd>Shift</kbd> se juntan más en el tiempo, pero la distancia entre ellas es la misma.</p>`, code: `stride += distanciaMovida;\nif (stride >= LARGO_PASO) {\n  stride -= LARGO_PASO;\n  sonarPaso(pieIzquierdo = !pieIzquierdo);\n}` },
    { h: 'Head bob: la cámara sube y baja al caminar', body: `<p>La cabeza sube y baja al caminar. Es un seno de la <b>distancia</b>, no del tiempo, así que se detiene y arranca con vos.</p><p><code>y = |sin(distancia)| * altura * velocidad</code></p><p>El valor absoluto hace que rebote hacia arriba, como cada paso. Multiplicarlo por la velocidad lo hace desaparecer suave al frenar.</p><p>Tiene que ser sutil: acá son 4,5 cm. Muy fuerte, marea. Por accesibilidad, un juego serio deja desactivarlo.</p>` },
    { h: 'Camera roll: inclinar la cámara al girar', body: `<p>Al doblar, la cámara se inclina apenas hacia el giro, como una moto o tu cabeza.</p><p>Se calcula con la <b>velocidad de giro</b> (yaw rate), se limita a un máximo y se suaviza con el mismo lerp exponencial de la sala 4.</p><p>Girá rápido en <b>Probar caminando</b> y mirá la curva. Al frenar vuelve sola a cero, y hasta ahí llegaron las técnicas de movimiento: input, rotación, suavizado y colisión, trabajando juntas.</p>` },
  ],
  demo(g, W, H, x) {
    clear(g, W, H); const { p, step, game } = x;
    p.hist.push({ speed: game.last.speed, bob: game.bobNow ?? 0, roll: game.roll, step: game.stepFlash === game.time ? 1 : (p.prevStep !== game.stepFlash ? 1 : 0), stride: game.stride });
    p.prevStep = game.stepFlash; if (p.hist.length > 200) p.hist.shift();
    const plot = (key, oy, h, col, scale, lab) => { line(g, 60, oy, 900, oy); text(g, lab, 60, oy - h - 8, { color: col, size: 19, weight: 600 }); g.strokeStyle = col; g.lineWidth = 3; g.beginPath(); p.hist.forEach((s, i) => { const X = 60 + i * 4.2, Y = oy - s[key] * scale; i ? g.lineTo(X, Y) : g.moveTo(X, Y); }); g.stroke(); };
    if (step === 0) {
      plot('speed', 220, 130, C.b, 24, 'Velocidad real (m/s)'); plot('bob', 470, 130, C.a, 2600, 'Head bob'); mono(g, `distancia caminada: ${game.walked.toFixed(1)} m`, 60, 545, C.fg, 22);
      text(g, 'Probá arrancar y frenar: con suavizado, la curva sube redondeada.', 60, 585, { color: C.dim, size: 18 });
    } else if (step === 1) {
      plot('stride', 300, 200, C.y, 130, 'Distancia acumulada de la zancada'); p.hist.forEach((s, i) => { if (s.step) { line(g, 60 + i * 4.2, 300, 60 + i * 4.2, 400, C.a, 4); dot(g, 60 + i * 4.2, 408, 7, C.a); } }); text(g, 'Paso', 60, 450, { color: C.a }); mono(g, `largo de zancada: 1,45 m  velocidad: ${game.last.speed.toFixed(1)} m/s`, 60, 520, C.fg, 22);
    } else if (step === 2) {
      plot('bob', 340, 240, C.a, 5000, 'Altura extra de la cámara'); const phase = x.t * 6; g.strokeStyle = C.line; const ps = 200; for (let i = 0; i < 300; i++) { const Y = 480 - Math.sin(i * .05 + phase) * 26; dot(g, 60 + i * 1.3, Y, 1.2, C.dim); const Y2 = 480 - Math.abs(Math.sin(i * .05 + phase)) * 40; dot(g, 520 + i * 1.3, Y2, 1.6, C.a); } void ps; text(g, 'sin(x)', 60, 540, { color: C.dim }); text(g, '|sin(x)|', 520, 540, { color: C.a });
    } else {
      const cx = 480, cy = 240, a = game.roll * 7; g.save(); g.translate(cx, cy); g.rotate(a); rect(g, -240, -140, 480, 280, '#141d2c', C.a); line(g, -240, 0, 240, 0, C.b, 2); g.restore(); mono(g, `roll = ${(game.roll * 57.3).toFixed(1)}°  (dibujado x7)`, 260, 440, C.y, 24);
      line(g, 60, 520, 900, 520); g.strokeStyle = C.y; g.lineWidth = 3; g.beginPath(); p.hist.forEach((s, i) => { const X = 60 + i * 4.2, Y = 520 - s.roll * 900; i ? g.lineTo(X, Y) : g.moveTo(X, Y); }); g.stroke();
    }
  },
  vocab: ['game feel', 'juice', 'head bob', 'camera roll', 'yaw rate', 'cadencia por distancia', 'atenuación'],
  prompt: 'Game feel: pasos disparados por distancia recorrida, alternando pie. Head bob con |sin(distancia)| escalado por la velocidad real. Camera roll según yaw rate, limitado a ±3° y suavizado con lerp exponencial. Todo debe poder desactivarse.',
};

// ---------------------------------------------------------------- PROMPTS
const blocks = [
  ['k_stack', 'Stack', 'Astro con una isla Preact (client:only), estado en @preact/signals para que el game loop actualice el HUD sin re-renderizar. Paneles pesados con import() dinámico.'],
  ['k_cam', 'Cámara e input', 'Primera persona con Pointer Lock API. Teclado por event.code en un Set leído cada frame. Gamepad adaptado a eventos de teclado.'],
  ['k_move', 'Movimiento', 'Vector de input normalizado con Math.hypot y rotado a espacio mundo con el yaw. Velocidad suavizada con 1 - Math.exp(-dt * k), independiente del framerate. dt limitado a 0.1.'],
  ['k_col', 'Colisión', 'Sin motor de físicas: grilla 2D de ocupación en Uint8Array, AABB inflados por el radio del jugador, resolución por ejes separados para deslizar.'],
  ['k_path', 'Pathfinding', 'A* sobre la misma grilla, 8 direcciones sin cortar esquinas, heurística octile. Sirve para click-to-walk.'],
  ['k_render', 'Render', 'Three.js WebGPURenderer con fallback a WebGL 2, materiales TSL, RenderPipeline con GTAO. devicePixelRatio máximo 1.5, geometría estática mergeada.'],
  ['k_assets', 'Assets', 'Texturas KTX2 (Basis Universal) con mipmaps, glTF con meshopt.'],
  ['k_work', 'Rendimiento', 'Trabajo pesado en Web Workers con Transferables. Presupuesto de 16,6 ms por frame.'],
  ['k_audio', 'Audio', 'Web Audio con PannerNode HRTF y distanceModel inverse, listener atado a la cámara, reverb con ConvolverNode.'],
  ['k_feel', 'Game feel', 'Pasos por distancia recorrida, head bob con |sin(distancia)| escalado por velocidad, camera roll por yaw rate, con opción de desactivarlos.'],
];
const prompts = {
  id: 'prompts', col: 3, row: 2, color: '#7ee081', title: 'Cómo pedírselo a una IA', tagline: 'Todo lo que aprendiste, convertido en un prompt.',
  params: { goal: 'un recorrido 3D por una oficina', ...Object.fromEntries(blocks.map(([k]) => [k, true])) },
  output: (p) => `Construí ${p.goal} para navegador.\n\nRequisitos técnicos:\n${blocks.filter(([k]) => p[k]).map(([, n, s]) => `- ${n}: ${s}`).join('\n')}\n\nExplicá las decisiones que tomes. Si una técnica no hace falta para este proyecto, decilo y proponé la alternativa más simple.`,
  steps: [
    { h: 'Pedir mejor: del deseo a la especificación', body: `<p>Compará:</p><blockquote>Hacé que el personaje se mueva.</blockquote><p>contra una frase con nombres técnicos. No se trata de sonar experto: <b>cada término elimina decisiones malas que la IA podría tomar por defecto</b>.</p><p>"Lerp exponencial" evita un bug que no ibas a detectar hasta probar en otro monitor. "Sin motor de físicas" evita sumar 500 KB que no necesitabas.</p><p>La regla es pedir <b>el qué, las restricciones y el por qué</b>, no solo el resultado.</p>` },
    { h: 'Armá tu prompt con lo que aprendiste', controls: blocks.map(([k, n]) => ({ type: 'toggle', key: k, label: n })), body: `<p>Prendé solo lo que tu proyecto necesita. Pedir todo en una web simple es sobreingeniería: ese también es un criterio que aprendiste acá.</p><p>Abajo tenés el prompt generado, listo para copiar.</p>` },
    { h: 'Para qué más sirve: lo aprendido fuera de los juegos', body: `<ul><li><b>Delta y exponential smoothing:</b> animaciones de UI, gráficos en vivo, scroll.</li><li><b>Signals:</b> dashboards con datos en tiempo real.</li><li><b>Islas y code splitting:</b> cualquier sitio, para cargar menos JS.</li><li><b>Workers:</b> filtrar miles de filas o procesar archivos.</li><li><b>Capa de adaptación:</b> integrar varias APIs de pagos con un mismo formato.</li><li><b>Grilla y A*:</b> rutas, depósitos, mapas de asientos.</li><li><b>Compresión:</b> imágenes de cualquier web (AVIF, WebP) y su peso real.</li></ul><p>Y la lección más grande: <b>la solución más simple que resuelve el problema real</b>. Eso le ganó a un motor de físicas.</p>` },
  ],
  demo(g, W, H, x) {
    clear(g, W, H); const { p, step } = x;
    if (step === 0) {
      rect(g, 60, 80, 400, 440, 'rgba(255,93,115,.08)', C.c); text(g, 'Prompt vago', 84, 130, { size: 26, weight: 700, font: HEAD, color: C.c }); ['lerp con t fijo', 'velocidad diagonal 1,41', 'motor de físicas de más', 'event.key', 'textura PNG gigante', 'todo en el hilo principal'].forEach((s, i) => text(g, s, 84, 195 + i * 50, { size: 21, color: C.dim }));
      rect(g, 500, 80, 400, 440, 'rgba(126,224,129,.08)', C.ok); text(g, 'Prompt técnico', 524, 130, { size: 26, weight: 700, font: HEAD, color: C.ok }); ['exponential smoothing', 'vector normalizado', 'grilla y resolución por ejes', 'event.code', 'KTX2 con mipmaps', 'Web Workers'].forEach((s, i) => text(g, s, 524, 195 + i * 50, { size: 21 }));
    } else if (step === 1) {
      text(g, 'Tu especificación', 60, 70, { size: 28, weight: 700, font: HEAD }); blocks.forEach(([k, n], i) => { rect(g, 60 + (i % 2) * 430, 100 + (i >> 1) * 88, 400, 68, p[k] ? 'rgba(126,224,129,.14)' : '#141d2c', p[k] ? C.ok : C.line); text(g, n, 84 + (i % 2) * 430, 143 + (i >> 1) * 88, { size: 22, color: p[k] ? C.fg : C.dim }); });
    } else {
      const items = ['Smoothing', 'Signals', 'Islas', 'Workers', 'Adaptadores', 'Grafos', 'Compresión']; items.forEach((n, i) => { const a = i / items.length * 6.283 + x.t * .15, X = 480 + Math.cos(a) * 340, Y = 300 + Math.sin(a) * 210; line(g, 480, 300, X, Y, C.line, 2); dot(g, X, Y, 8, C.ok); text(g, n, X, Y - 16, { align: 'center', size: 21 }); }); dot(g, 480, 300, 60, '#172133'); text(g, 'Vos', 480, 310, { align: 'center', size: 28, weight: 700, font: HEAD, color: C.ok });
    }
  },
  vocab: ['especificación', 'restricciones', 'sobreingeniería', 'trade-off'],
  prompt: 'Antes de escribir código, listá las decisiones técnicas importantes con sus trade-offs. Elegí la solución más simple que cumpla los requisitos.',
};

export const part3 = [workers, audio, gamefeel, prompts];
void arrow;
