import { C, clear, text, mono, line, arrow, dot, ring, rect, lerp, clamp, MONO, HEAD } from './draw.js';

const deg = (r) => `${(r * 180 / Math.PI).toFixed(0)}°`;
const num = (v, d = 2) => v.toFixed(d).replace('.', ',');

// ---------------------------------------------------------------- SALA 2
// Simula tres formas de leer teclado con el mismo guion de teclas.
const SCRIPT = { end: 4.2, wDown: 0, dDown: 1.3, dUp: 2.4, wUp: 3.4 };
function polling(t) {
  const trail = { event: [[0, 0]], variable: [[0, 0]], set: [[0, 0]] };
  const h = 1 / 60;
  let e = [0, 0], v = [0, 0], s = [0, 0], nextRepeat = .5, repeatKey = 'W', tecla = null;
  for (let time = 0; time < t; time += h) {
    const w = time >= SCRIPT.wDown && time < SCRIPT.wUp, d = time >= SCRIPT.dDown && time < SCRIPT.dUp;
    // A: mover dentro de keydown. El sistema repite solo la última tecla, con demora inicial.
    if (time < h) e[1] += .1;
    if (Math.abs(time - SCRIPT.dDown) < h / 2) { repeatKey = 'D'; nextRepeat = time + .5; e[0] += .1; }
    if (Math.abs(time - SCRIPT.dUp) < h / 2) repeatKey = null;
    if (repeatKey && time >= nextRepeat) { nextRepeat += .033; if (repeatKey === 'W') e[1] += .055; else e[0] += .055; }
    // B: una sola variable. keyup borra todo aunque W siga apretada.
    if (Math.abs(time - SCRIPT.wDown) < h / 2) tecla = 'W';
    if (Math.abs(time - SCRIPT.dDown) < h / 2) tecla = 'D';
    if (Math.abs(time - SCRIPT.dUp) < h / 2) tecla = null;
    if (tecla === 'W') v[1] += h; if (tecla === 'D') v[0] += h;
    // C: Set leído en cada frame.
    const f = w ? 1 : 0, r = d ? 1 : 0, len = Math.hypot(f, r) || 1;
    s[1] += f / len * h; s[0] += r / len * h;
    if (Math.floor(time * 60) % 4 === 0) { trail.event.push([...e]); trail.variable.push([...v]); trail.set.push([...s]); }
  }
  return trail;
}

export const input = {
  id: 'input', col: 1, row: 0, color: '#45d6c4', title: 'Cámara y controles', tagline: 'Cómo el juego usa el mouse para mirar y las teclas para moverte.',
  params: { lock: false, yaw: 0, hist: [], polT: 0 },
  steps: [
    { h: 'Cómo se mira en un juego: sin cursor y sin bordes', controls: [{ type: 'toggle', key: 'lock', label: 'Activar Pointer Lock real', onChange: (p, game) => { p.lockFail = false; if (p.lock) { const r = game.demoCanvas?.requestPointerLock(); r?.catch?.(() => { p.lockFail = true; }); } else if (document.pointerLockElement) document.exitPointerLock(); } }], body: `<p>En un juego en primera persona no hay flechita: movés el mouse, gira la cámara y podés dar todas las vueltas que quieras. Eso no viene solo. En una página web el mouse maneja un cursor, y el cursor se frena en el borde de la pantalla.</p><p>Mové el mouse sobre el gráfico. La brújula es la cámara. Con el cursor normal, el navegador solo te dice <b>dónde está</b>. Si llegás al borde, la posición deja de cambiar y la cámara deja de girar: no podés dar una vuelta entera.</p><p>La solución es una función del navegador llamada <b>Pointer Lock</b> (bloqueo del puntero). Activá el toggle: el cursor desaparece y ahora medimos cuánto <b>se movió</b>, y eso no tiene borde. Mové el mouse en un solo sentido y la cámara sigue dando vueltas. Con <kbd>Esc</kbd> recuperás el cursor.</p>` },
    { h: 'Pointer Lock: esconder el cursor y medir el movimiento', body: `<p>Es una función del navegador que esconde el cursor, lo encierra en un elemento y te entrega el movimiento crudo en <code>event.movementX</code> y <code>event.movementY</code>. Es <b>delta</b> (cuánto se movió) en vez de <b>posición absoluta</b> (dónde está).</p><p>Tiene dos reglas: se pide desde un gesto del usuario, como un click, y el usuario siempre puede salir con <kbd>Esc</kbd>.</p><p><b>Cómo leer las barras.</b> Cada barra es un frame, y su alto es cuántos píxeles se movió el mouse durante ese frame: ese número es <code>movementX</code>. Hacia arriba es derecha y hacia abajo, izquierda.</p><p><b>Por qué cambian de tamaño.</b> Todos los frames duran casi lo mismo, así que el alto es la velocidad de tu mano. Si la movés despacio, en cada frame recorre pocos píxeles y la barra es chica. Si la movés rápido, recorre muchos y la barra es grande.</p><p><b>Qué hace la cámara con eso.</b> En cada frame convierte la barra en un ángulo y lo resta de su <code>yaw</code>. Nadie calcula una velocidad de cámara: una barra grande es un salto grande entre un frame y el siguiente, y por eso la ves girar rápido.</p><p><b>Lo que importa es la suma.</b> El giro total es la suma de todas las barras: 100 barras de 4 px o 20 barras de 20 px dan los mismos 400 px y el mismo ángulo. Por eso acá no se multiplica por <code>dt</code>.</p><p>Tocá <kbd>Tab</kbd> para ver las barras de tu propio mouse.</p>`, code: `canvas.requestPointerLock();\ndocument.addEventListener('mousemove', (e) => {\n  // PIXEL_A_RADIAN: cuánto gira la cámara por píxel\n  yaw   -= e.movementX * PIXEL_A_RADIAN;\n  pitch -= e.movementY * PIXEL_A_RADIAN;\n});` },
    { h: 'WASD en cualquier teclado: event.code contra event.key', body: `<p>Apretá teclas ahora mismo y mirá el gráfico.</p><p><code>event.key</code> dice <b>qué letra produjo</b> la tecla, y cambia con el idioma del teclado. <code>event.code</code> dice <b>qué tecla física</b> es.</p><p>En un teclado AZERTY francés, la tecla física de la W escribe una Z. Si programás con <code>key</code>, ese jugador no puede caminar. Con <code>code</code>, WASD siempre tiene la misma forma en la mano.</p>` },
    { h: 'Cómo saber qué teclas seguís apretando: un Set', body: `<p>Los eventos llegan cuando la tecla <b>cambia</b>, y el juego necesita saber su estado <b>en cada frame</b>. Por eso se guardan en un <code>Set</code>: <code>keydown</code> agrega y <code>keyup</code> borra.</p><p>Después, cada frame, el loop pregunta <code>keys.has('KeyW')</code>. Separar <b>recibir eventos</b> de <b>leer el estado</b> es un patrón clásico llamado <b>input polling</b>.</p><p>Un Set no guarda repetidos: aunque el sistema mande <code>keydown</code> muchas veces mientras mantenés la tecla, queda una sola entrada.</p><p>En la consola de esta sala hay cuatro teclas que se hunden leyendo ese mismo Set.</p>`, code: `addEventListener('keydown', e => keys.add(e.code));\naddEventListener('keyup',   e => keys.delete(e.code));\n// cada frame:\nconst adelante = keys.has('KeyW') - keys.has('KeyS');` },
    { h: 'Por qué se hace así: tres formas de leer el teclado', controls: [{ type: 'button', label: 'Repetir la comparación', action: (p) => { p.polT = 0; } }], body: `<p>El gráfico simula las tres opciones con las mismas teclas: mantener W, sumar D un rato, soltar D y seguir con W.</p><p><b>A. Mover adentro de <code>keydown</code>.</b> Parece lo natural, pero <code>keydown</code> no se dispara en cada frame. El sistema manda uno, espera cerca de medio segundo y recién repite, como cuando mantenés una letra en un texto. Encima repite solo la última tecla: al sumar D, W deja de contar, y al soltar D se frena todo.</p><p><b>B. Una variable <code>tecla</code>.</b> Se mueve de corrido, pero guarda una sola tecla. Al apretar D pisa a W, y al soltar D queda vacía aunque W siga apretada.</p><p><b>C. Set + polling.</b> El Set recuerda todas las teclas y el loop las lee 60 veces por segundo. Hay diagonal real y ningún corte.</p>`, code: `// A: mal, depende de la repetición del sistema\nonKeydown = e => { if (e.code === 'KeyW') z -= 0.1; };\n// B: mal, una tecla pisa a la otra\nonKeydown = e => { tecla = e.code; };\n// C: bien, estado completo leído por frame\nif (keys.has('KeyW')) z -= velocidad * dt;` },
    { h: 'Joystick sin código extra: el gamepad que finge ser teclado', body: `<p>Para soportar joystick, lo obvio es escribir otra rama de código. Hay una forma más simple: el stick <b>dispara teclas falsas</b> con <code>new KeyboardEvent(...)</code>.</p><p>El código de movimiento no se entera de que existe un gamepad. Este juego lo hace así: enchufá un joystick y probá.</p><p>El patrón general se llama <b>capa de adaptación</b>: convertís varias entradas distintas a un único formato. Sirve mucho más allá de los juegos.</p>`, code: `if (stick.y < -deadzone)\n  dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyW' }));` },
  ],
  demo(g, W, H, x) {
    clear(g, W, H); const { p, step, mouse, game } = x; if (step !== 1) game.input.meterX = 0;
    if (step === 0) {
      const box = { x: 70, y: 70, w: 500, h: 420 };
      rect(g, box.x, box.y, box.w, box.h, '#131c2b', C.line); text(g, 'Tu pantalla', box.x + 16, box.y + 34, { color: C.dim });
      const captured = !!document.pointerLockElement; if (p.lock) p.yaw += mouse.dx * .01; else if (mouse.has) p.yaw = (clamp(mouse.x, box.x, box.x + box.w) - 320) * .012; mouse.dx = 0;
      const cx = 740, cy = 280, R = 120; ring(g, cx, cy, R); arrow(g, cx, cy, cx + Math.sin(p.yaw) * R, cy - Math.cos(p.yaw) * R, C.b, 5);
      text(g, 'Cámara', cx - 40, cy + 170, { color: C.dim }); mono(g, deg(p.yaw), cx, cy + 205, C.fg, 24, 'center');
      const atEdge = !p.lock && mouse.has && (mouse.x <= box.x + 2 || mouse.x >= box.x + box.w - 2);
      if (!p.lock && mouse.has) { const mx = clamp(mouse.x, box.x, box.x + box.w), my = clamp(mouse.y, box.y, box.y + box.h); g.fillStyle = C.fg; g.beginPath(); g.moveTo(mx, my); g.lineTo(mx, my + 20); g.lineTo(mx + 13, my + 15); g.fill(); }
      text(g, p.lock ? (captured ? 'Delta sin límite: la cámara gira para siempre' : 'Chrome no capturó el mouse: tocá el toggle de nuevo') : atEdge ? 'Tope de pantalla: la cámara no gira más' : 'Posición absoluta del cursor', 70, 545, { color: p.lock ? (captured ? C.ok : C.y) : atEdge ? C.c : C.fg, weight: 700, size: 25, font: HEAD });
      if (captured) text(g, 'Esc para soltar el mouse', 70, 580, { color: C.dim, size: 17 });
    } else if (step === 1) {
      if (document.pointerLockElement === game.demoCanvas) document.exitPointerLock();
      const real = game.input.locked || x.mode === 'try', sens = game.feel.sens, N = 180, Y0 = 240;
      if (p.histReal !== real) { p.hist = []; p.histReal = real; p.simF = 0; p.simYaw = 0; }
      let px = game.input.meterX; game.input.meterX = 0;
      if (!real) { const f = p.simF++ % N; px = f < 100 ? 4 : f >= 130 && f < 150 ? 20 : 0; p.simYaw -= px * sens; }
      p.hist.push(px); if (p.hist.length > N) p.hist.shift();
      text(g, 'Cada barra es un frame', 70, 50, { size: 26, weight: 700, font: HEAD }); text(g, 'Alto = píxeles que se movió el mouse en ese frame', 70, 82, { color: C.dim, size: 18 });
      for (const v of [50, -50]) { line(g, 70, Y0 - v * 1.5, 880, Y0 - v * 1.5, C.grid, 1, [5, 5]); text(g, v > 0 ? '+50 px' : '-50 px', 888, Y0 - v * 1.5 + 5, { color: C.dim, size: 14 }); }
      line(g, 70, Y0, 880, Y0); text(g, 'derecha', 888, Y0 - 112, { color: C.b, size: 14 }); text(g, 'izquierda', 888, Y0 + 122, { color: C.a, size: 14 });
      const off = N - p.hist.length; p.hist.forEach((v, i) => { const h = clamp(v * 1.5, -130, 130); rect(g, 70 + (off + i) * 4.5, h > 0 ? Y0 - h : Y0, 3.2, Math.abs(h), h > 0 ? C.b : C.a); });
      if (real) {
        const recent = p.hist.slice(-10), avg = recent.reduce((a, v) => a + Math.abs(v), 0) / recent.length, sum = p.hist.reduce((a, v) => a + v, 0);
        mono(g, `Este frame:  ${Math.abs(px).toFixed(0)} px → ${num(Math.abs(px) * sens * 180 / Math.PI, 1)}° de giro`, 70, 425, C.fg, 20);
        mono(g, `Tu mano:     ${(avg / Math.max(x.dt, .001)).toFixed(0)} px/s`, 70, 465, C.y, 20);
        mono(g, `Suma visible: ${Math.abs(sum).toFixed(0)} px → ${deg(Math.abs(sum) * sens)}`, 70, 505, C.b, 20);
        text(g, game.input.locked ? 'Mové el mouse despacio y después rápido.' : 'Hacé click para capturar el mouse.', 70, 550, { color: C.dim, size: 18 });
      } else {
        mono(g, 'Mano lenta:  100 barras de  4 px = 400 px', 70, 425, C.b, 19); mono(g, 'Mano rápida:  20 barras de 20 px = 400 px', 70, 460, C.b, 19);
        text(g, `Mismo total y mismo giro de ${deg(400 * sens)}: solo cambia la velocidad.`, 70, 505, { color: C.ok, size: 20, weight: 600 });
        text(g, 'Ejemplo simulado. Tocá Tab para ver tu mouse.', 70, 550, { color: C.dim, size: 18 });
      }
      const y = real ? game.yaw : p.simYaw, cx = 800, cy = 470, R = 70; ring(g, cx, cy, R); arrow(g, cx, cy, cx - Math.sin(y) * R, cy - Math.cos(y) * R, C.b, 4); text(g, 'Cámara', cx, cy + R + 24, { color: C.dim, size: 16, align: 'center' });
    } else if (step === 2) {
      text(g, 'Última tecla apretada', 70, 100, { size: 28, weight: 700, font: HEAD });
      text(g, 'event.key (depende del idioma)', 70, 190, { color: C.dim }); mono(g, game.input.lastKey, 70, 280, C.a, 80);
      text(g, 'event.code (tecla física)', 70, 370, { color: C.dim }); mono(g, game.input.lastCode, 70, 460, C.b, 80);
    } else if (step === 3) {
      mono(g, 'keys = Set {', 70, 110, C.dim, 30);
      [...game.input.keys].slice(0, 8).forEach((k, i) => mono(g, `'${k}'`, 110, 165 + i * 44, C.b, 30));
      mono(g, '}', 70, 530, C.dim, 30); text(g, 'Mantené varias teclas', 520, 110, { color: C.dim, size: 22 });
      const f = (game.input.keys.has('KeyW') ? 1 : 0) - (game.input.keys.has('KeyS') ? 1 : 0), s = (game.input.keys.has('KeyD') ? 1 : 0) - (game.input.keys.has('KeyA') ? 1 : 0);
      mono(g, `adelante = ${f}`, 520, 200, C.a, 30); mono(g, `lateral  = ${s}`, 520, 250, C.a, 30);
    } else if (step === 4) {
      p.polT = Math.min(SCRIPT.end, p.polT + x.dt); if (p.polT >= SCRIPT.end) p.polDone = (p.polDone ?? 0) + x.dt; if ((p.polDone ?? 0) > 2) { p.polT = 0; p.polDone = 0; }
      const tr = polling(p.polT), cols = [['event', 'A. En keydown', C.c], ['variable', 'B. Una variable', C.y], ['set', 'C. Set + polling', C.ok]];
      cols.forEach(([k, n, col], i) => {
        const ox = 22 + i * 312, bx = ox + 18, by = 410;
        rect(g, ox, 40, 292, 400, '#131c2b', col); text(g, n, ox + 18, 76, { color: col, weight: 700, size: 22, font: HEAD });
        g.strokeStyle = col; g.lineWidth = 4; g.beginPath(); tr[k].forEach(([a, b], j) => { const X = bx + a * 150, Y = by - b * 90; j ? g.lineTo(X, Y) : g.moveTo(X, Y); }); g.stroke();
        const [a, b] = tr[k][tr[k].length - 1]; dot(g, bx + a * 150, by - b * 90, 9, C.fg);
      });
      const y = 490, sx = 880 / SCRIPT.end, ox = 40; text(g, 'W', 14, y + 16, { size: 16, color: C.dim }); text(g, 'D', 14, y + 50, { size: 16, color: C.dim });
      rect(g, ox + SCRIPT.wDown * sx, y, (SCRIPT.wUp - SCRIPT.wDown) * sx, 22, 'rgba(255,154,60,.6)'); rect(g, ox + SCRIPT.dDown * sx, y + 34, (SCRIPT.dUp - SCRIPT.dDown) * sx, 22, 'rgba(69,214,196,.6)');
      line(g, ox + p.polT * sx, y - 8, ox + p.polT * sx, y + 64, C.fg, 2); text(g, 'Teclas apretadas en el tiempo', ox, 582, { color: C.dim, size: 16 });
    } else {
      const items = [[70, 'Teclado'], [290, 'Gamepad'], [510, 'Joystick táctil']];
      items.forEach(([ix, n], i) => { rect(g, 70, 90 + i * 140, 230, 90, '#172133', i === 1 ? C.y : C.line); text(g, n, 96, 145 + i * 140, { size: 24, weight: 600 }); void ix; });
      rect(g, 610, 210, 260, 110, 'rgba(69,214,196,.12)', C.b); text(g, 'updateWalk()', 636, 275, { font: MONO, size: 26, color: C.b });
      const t = (x.t * .7) % 1; [135, 275, 415].forEach((y) => arrow(g, 306, y, 604, 265, C.line, 2));
      dot(g, lerp(306, 604, t), lerp(275, 265, t), 8, C.y); text(g, 'KeyboardEvent falso', 330, 245, { color: C.y, size: 20 });
      text(g, 'Un joystick táctil entraría de la misma forma. Este juego todavía no lo tiene.', 70, 560, { color: C.dim, size: 18 });
    }
  },
  vocab: ['Pointer Lock API', 'movementX (delta)', 'event.code', 'key repeat', 'input polling', 'Gamepad API', 'deadzone', 'capa de adaptación'],
  prompt: 'Cámara en primera persona con Pointer Lock API. Rotación acumulando event.movementX/Y por un factor de píxeles a radianes, sin multiplicar por dt; pitch limitado. Teclado por event.code en un Set leído cada frame (polling), nunca moviendo dentro de keydown. El gamepad y el joystick táctil se adaptan al mismo input para no duplicar lógica.',
};

// ---------------------------------------------------------------- SALA 3
function topDown(g, cx, cy, R, yaw) {
  const fx = -Math.sin(yaw), fz = -Math.cos(yaw);
  ring(g, cx, cy, R); line(g, cx - R - 20, cy, cx + R + 20, cy, C.grid); line(g, cx, cy - R - 20, cx, cy + R + 20, C.grid);
  text(g, 'norte (-Z)', cx, cy - R - 28, { color: C.dim, size: 16, align: 'center' }); text(g, '+X', cx + R + 26, cy + 6, { color: C.dim, size: 16 });
  return [cx + fx * R, cy + fz * R, fx, fz];
}
const YAW = { type: 'range', key: 'yaw', label: 'Yaw', min: -3.14, max: 3.14, step: .01, fmt: deg };

export const yaw = {
  id: 'yaw', col: 2, row: 0, color: '#ff5d73', title: 'Caminar hacia donde mirás', tagline: 'Cómo el ángulo de la cámara se convierte en pasos: yaw, seno y coseno.',
  params: { yaw: .47, live: false, f: 1, s: 0, normalize: true, speed: 3.2, walker: { x: 0, z: 0 } },
  onClose(p, game) { p.normalize = true; game.feel.normalize = true; },
  steps: [
    { h: 'Yaw, pitch y roll: los tres giros de la cámara', controls: [YAW], body: `<p>Son los tres giros de cualquier objeto, y los nombres vienen de la aviación:</p><ul><li><b>Yaw:</b> girar a los costados, como decir que no con la cabeza.</li><li><b>Pitch:</b> mirar arriba y abajo, como decir que sí.</li><li><b>Roll:</b> inclinar la cabeza hacia un hombro.</li></ul><p>Para caminar sobre un piso plano solo importa el yaw. Es un único número: el ángulo hacia donde mirás, visto desde arriba.</p><p>Tocá <b>Probar caminando</b> y girá: el gráfico y el robot de la brújula copian tu yaw real.</p>` },
    { h: 'Dirección y velocidad: qué hace falta para dar un paso', controls: [YAW, { type: 'range', key: 'speed', label: 'Velocidad', min: 0, max: 6, step: .1, fmt: (v) => `${num(v, 1)} m/s` }], body: `<p>El piso es un plano con dos ejes. Tu posición son dos números, X y Z, y moverte es cambiarlos:</p><ul><li><b>X</b> crece hacia el este y baja hacia el oeste.</li><li><b>Z</b> crece hacia el sur y baja hacia el norte. Por eso ir al norte es ir hacia valores negativos.</li></ul><p>La <b>dirección</b> es un par de números que dice <b>en qué proporción</b> cambiar cada eje. Sola no mueve nada: es una receta.</p><p>Con dirección (-0,45; -0,89): por cada metro que camines, restás 0,45 a X y 0,89 a Z. Terminás 45 cm al oeste y 89 cm al norte. Un valor de -1 en Z es ir recto al norte, porque todo el metro cae en ese eje. Con -0,45 el metro se reparte entre los dos ejes, y por eso salís en diagonal.</p><p>El paso real sale recién acá, en cada frame:</p><p><code>x += dir.x * velocidad * dt</code></p><p>Con velocidad 0 la dirección sigue existiendo, pero el punto no se mueve. Probalo con el slider.</p>`, code: `pos.x += dir.x * velocidad * dt;\npos.z += dir.z * velocidad * dt;` },
    { h: 'Seno y coseno: del ángulo de la cámara a la dirección', controls: [YAW], body: `<p>Falta conseguir esa dirección a partir del yaw. Dibujá una flecha de largo 1 girada ese ángulo: se forma un triángulo rectángulo. La flecha es la hipotenusa y los catetos son justo lo que buscamos.</p><ul><li><b style="color:var(--t)">seno:</b> el cateto opuesto al ángulo, lo que la flecha avanza hacia el costado.</li><li><b style="color:var(--r)">coseno:</b> el cateto pegado al ángulo, lo que avanza hacia el frente.</li></ul><p><b>Desde dónde se mide:</b> en la escuela el ángulo se suele medir desde el eje horizontal, y ahí el coseno queda acostado. Acá el yaw se mide desde el frente, o sea desde el norte, y por eso el coseno queda parado. La regla es la misma: el coseno siempre es el cateto pegado al ángulo, marcado en amarillo.</p><p>No son fórmulas misteriosas: son el nombre de esas dos medidas. <code>Math.sin</code> y <code>Math.cos</code> las calculan.</p><p>Como la flecha mide 1, sus catetos cumplen Pitágoras y <b>sus cuadrados siempre suman 1</b>. Por eso el metro se reparte entre los ejes y nunca sobra ni falta.</p><p>Los signos menos salen del mapa de Three.js: con yaw 0 mirás al norte, o sea hacia -Z, y un yaw positivo gira a la izquierda, hacia -X.</p>`, code: `adelante.x = -Math.sin(yaw);\nadelante.z = -Math.cos(yaw);` },
    { h: 'Adelante y derecha: por qué X y Z tienen fórmulas distintas', controls: [YAW, { type: 'select', key: 'f', label: 'Adelante o atrás', num: true, options: [['1', 'W (f = 1)'], ['0', 'Ninguna (f = 0)'], ['-1', 'S (f = -1)']] }, { type: 'select', key: 's', label: 'Derecha o izquierda', num: true, options: [['1', 'D (s = 1)'], ['0', 'Ninguna (s = 0)'], ['-1', 'A (s = -1)']] }], body: `<p>Tus teclas hablan de <b>tu</b> adelante y <b>tu</b> derecha. El mundo solo entiende X y Z. Necesitamos dos flechas, las dos medidas en el mapa:</p><ul><li><b style="color:var(--a)">adelante</b> = (-sin, -cos)</li><li><b style="color:var(--t)">derecha</b> = (cos, -sin)</li></ul><p>La derecha es la flecha adelante girada 90°. Girar 90° intercambia los catetos: lo que era el costado pasa a ser el frente. Por eso seno y coseno cambian de lugar.</p><p>Las teclas se convierten en dos números, que dicen cuánto usar de cada flecha:</p><ul><li><code>f</code> (adelante): 1 con W, -1 con S y 0 sin ninguna.</li><li><code>s</code> (costado): 1 con D, -1 con A y 0 sin ninguna.</li></ul><p>Cada flecha se multiplica por su número: con 1 queda igual, con -1 apunta al lado contrario y con 0 no cuenta. El yaw no cambia estos números, solo cambia hacia dónde apuntan las flechas.</p><p>Después se <b>suman las dos flechas</b>, y sumar flechas es sumar por separado cada eje:</p><p><code>dirX = adelante.x·f + derecha.x·s</code><br><code>dirZ = adelante.z·f + derecha.z·s</code></p><p>La fórmula de X usa los componentes X de ambas flechas, y la de Z, los componentes Z. Reemplazando sale exactamente el código de <code>updateWalk</code>.</p><p>Cambiá las teclas en los selectores, o tocá <kbd>Tab</kbd> y el gráfico va a leer las que apretás de verdad.</p>`, code: `dirX = -sin(yaw)*f + cos(yaw)*s;\ndirZ = -cos(yaw)*f - sin(yaw)*s;` },
    { h: 'Normalizar: por qué en diagonal se camina más rápido', controls: [{ type: 'toggle', key: 'normalize', label: 'Normalizar el vector (afecta tu personaje)', apply: 'feel' }], body: `<p>Apretando W y D juntas, sumás dos flechas de largo 1 a 90°. Por Pitágoras el resultado mide <b>1,41</b>: caminás 41% más rápido en diagonal.</p><p>La solución es <b>normalizar</b>: dividir por el largo para que siempre mida 1. Conserva la dirección y descarta la magnitud.</p><p>Probalo de verdad: apagá el toggle, tocá <kbd>Tab</kbd> y caminá con W sola y después W+D. El medidor muestra tu velocidad real, y a lo largo de una sala se nota. Al cerrar el pizarrón vuelve a estar normalizado.</p>`, code: `const largo = Math.hypot(f, s) || 1;\nf /= largo; s /= largo;` },
  ],
  demo(g, W, H, x) {
    clear(g, W, H); const { p, step, game } = x;
    const live = x.mode === 'try', y = live ? game.yaw : p.yaw; game.demoYaw = live ? null : p.yaw;
    if (live) p.yaw = ((game.yaw + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI;
    const cx = 280, cy = 300, R = 180, fx = -Math.sin(y), fz = -Math.cos(y);
    if (step === 0) {
      const [ex, ey] = topDown(g, cx, cy, R, y); arrow(g, cx, cy, ex, ey, C.a, 6); dot(g, cx, cy, 10, C.fg);
      g.strokeStyle = C.y; g.lineWidth = 4; g.beginPath(); const a0 = -Math.PI / 2, a1 = a0 - y; g.arc(cx, cy, 60, Math.min(a0, a1), Math.max(a0, a1)); g.stroke();
      text(g, 'Vista desde arriba', 80, 60, { color: C.dim }); mono(g, `yaw = ${deg(y)}`, 560, 110, C.y, 30);
      mono(g, `    = ${num(y)} rad`, 560, 150, C.dim, 24);
      text(g, 'Radianes: la unidad que usa Math.sin.', 560, 220, { color: C.dim, size: 18 }); text(g, 'Una vuelta = 2π ≈ 6,28', 560, 248, { color: C.dim, size: 18 });
    } else if (step === 1) {
      const U = 42, ox = 40, oy = 40, S = 10 * U, sp = live ? game.last.speed : p.speed, w = p.walker;
      if (!live) { w.x += fx * sp * x.dt; w.z += fz * sp * x.dt; if (Math.abs(w.x) > 5 || Math.abs(w.z) > 5) { w.x = 0; w.z = 0; } }
      const wx = live ? 0 : w.x, wz = live ? 0 : w.z;
      rect(g, ox, oy, S, S, '#131c2b', C.line); for (let i = 1; i < 10; i++) { line(g, ox + i * U, oy, ox + i * U, oy + S, C.grid, 1); line(g, ox, oy + i * U, ox + S, oy + i * U, C.grid, 1); }
      const c0x = ox + S / 2, c0y = oy + S / 2, X = c0x + wx * U, Z = c0y + wz * U;
      text(g, '-Z norte', c0x, oy + 20, { align: 'center', color: C.dim, size: 14 }); text(g, '+Z sur', c0x, oy + S - 8, { align: 'center', color: C.dim, size: 14 }); text(g, '-X', ox + 8, c0y - 6, { color: C.dim, size: 14 }); text(g, '+X', ox + S - 28, c0y - 6, { color: C.dim, size: 14 });
      text(g, 'cada cuadro = 1 m', ox, oy + S + 26, { color: C.dim, size: 15 });
      line(g, X, Z, X + fx * U, Z, C.b, 5); line(g, X + fx * U, Z, X + fx * U, Z + fz * U, C.c, 5); arrow(g, X, Z, X + fx * U, Z + fz * U, C.a, 4); dot(g, X, Z, 9, C.fg);
      const dtMs = 1000 / 60, stepX = fx * sp * dtMs / 1000, stepZ = fz * sp * dtMs / 1000;
      mono(g, 'dirección (no se mueve sola)', 500, 80, C.dim, 16); mono(g, `dir.x = ${num(fx)}`, 500, 116, C.b, 24); mono(g, `dir.z = ${num(fz)}`, 500, 150, C.c, 24);
      text(g, `Por cada metro: ${num(Math.abs(fx) * 100, 0)} cm ${fx < 0 ? 'oeste' : 'este'}, ${num(Math.abs(fz) * 100, 0)} cm ${fz < 0 ? 'norte' : 'sur'}`, 500, 190, { size: 17 });
      mono(g, 'en un frame a 60 FPS', 500, 250, C.dim, 16); mono(g, `x += ${num(fx)} · ${num(sp, 1)} · 0,0167`, 500, 285, C.fg, 18); mono(g, `   = ${num(stepX, 3)} m`, 500, 315, C.b, 20); mono(g, `z += ${num(fz)} · ${num(sp, 1)} · 0,0167`, 500, 355, C.fg, 18); mono(g, `   = ${num(stepZ, 3)} m`, 500, 385, C.c, 20);
      text(g, sp < .05 ? 'Velocidad 0: hay dirección, pero no hay movimiento.' : 'Ese paso chico, 60 veces por segundo, es caminar.', 500, 440, { color: sp < .05 ? C.y : C.ok, size: 17, weight: 600 });
    } else if (step === 2) {
      const [ex, ey] = topDown(g, cx, cy, R, y);
      line(g, cx, cy, cx, ey, C.c, 7); line(g, cx, ey, ex, ey, C.b, 7); arrow(g, cx, cy, ex, ey, C.a, 5);
      g.strokeStyle = C.y; g.lineWidth = 4; g.beginPath(); const a0 = -Math.PI / 2, a1 = a0 - y; g.arc(cx, cy, 46, Math.min(a0, a1), Math.max(a0, a1)); g.stroke();
      text(g, 'cos', ex < cx ? cx + 12 : cx - 12, (cy + ey) / 2 + 6, { color: C.c, size: 20, weight: 700, align: ex < cx ? 'left' : 'right' }); text(g, 'sin', (cx + ex) / 2, ey + (ey < cy ? -14 : 28), { color: C.b, size: 20, weight: 700, align: 'center' }); text(g, 'yaw', cx + (ex < cx ? -8 : 8), cy - 58, { color: C.y, size: 16, weight: 700, align: ex < cx ? 'right' : 'left' });
      text(g, 'largo 1', (cx + ex) / 2 - 30, (cy + ey) / 2 - 12, { color: C.a, size: 16 });
      const s = Math.sin(y), co = Math.cos(y);
      mono(g, `sin(${deg(y)}) = ${num(s)}`, 540, 110, C.b, 28); mono(g, `cos(${deg(y)}) = ${num(co)}`, 540, 155, C.c, 28);
      mono(g, `adelante.x = ${num(fx)}`, 540, 225, C.fg, 22); mono(g, `adelante.z = ${num(fz)}`, 540, 260, C.fg, 22);
      mono(g, `sin² + cos² = ${num(s * s + co * co)}`, 540, 315, C.ok, 22);
      for (let i = 0; i < 300; i++) { const a = i / 300 * 6.28 - 3.14, px = 540 + i; dot(g, px, 450 - Math.sin(a) * 50, 1.2, C.b); dot(g, px, 450 - Math.cos(a) * 50, 1.2, C.c); }
      const mx = 540 + (y + 3.14) / 6.28 * 300; line(g, mx, 390, mx, 510, C.y, 2); dot(g, mx, 450 - Math.sin(y) * 50, 6, C.b); dot(g, mx, 450 - Math.cos(y) * 50, 6, C.c);
      text(g, 'Cada ángulo tiene un valor en cada curva.', 540, 540, { color: C.dim, size: 16 });
    } else if (step === 3) {
      const held = (k) => (game.input.keys.has(k) ? 1 : 0), f = live ? held('KeyW') - held('KeyS') : p.f, s = live ? held('KeyD') - held('KeyA') : p.s, rx = Math.cos(y), rz = -Math.sin(y), dx = fx * f + rx * s, dz = fz * f + rz * s, U2 = 120, ox = 270, oy = 300, sg = (v) => (v < 0 ? `(${v})` : `${v}`);
      ring(g, ox, oy, U2, C.grid); text(g, 'norte (-Z)', ox, 150, { align: 'center', color: C.dim, size: 15 }); arrow(g, ox, oy, ox + fx * (f || 1) * U2, oy + fz * (f || 1) * U2, f ? C.a : C.line, 4); arrow(g, ox, oy, ox + rx * (s || 1) * U2, oy + rz * (s || 1) * U2, s ? C.b : C.line, 4);
      if (f && s) { line(g, ox + fx * f * U2, oy + fz * f * U2, ox + dx * U2, oy + dz * U2, C.b, 2, [6, 6]); line(g, ox + rx * s * U2, oy + rz * s * U2, ox + dx * U2, oy + dz * U2, C.a, 2, [6, 6]); }
      if (f || s) arrow(g, ox, oy, ox + dx * U2, oy + dz * U2, C.y, 6); dot(g, ox, oy, 8, C.fg);
      text(g, 'adelante', 60, 480, { color: C.a, size: 17 }); text(g, 'derecha', 160, 480, { color: C.b, size: 17 }); text(g, 'suma = dirección', 260, 480, { color: C.y, size: 17 });
      mono(g, `adelante = (${num(fx)}; ${num(fz)})`, 500, 110, C.a, 19); mono(g, `derecha  = (${num(rx)}; ${num(rz)})`, 500, 145, C.b, 19);
      mono(g, `f = ${f}   s = ${s}`, 500, 195, C.fg, 20);
      mono(g, `dirX = ${num(fx)}·${sg(f)} + ${num(rx)}·${sg(s)}`, 500, 260, C.fg, 19); mono(g, `     = ${num(dx)}`, 500, 290, C.y, 22);
      mono(g, `dirZ = ${num(fz)}·${sg(f)} + ${num(rz)}·${sg(s)}`, 500, 345, C.fg, 19); mono(g, `     = ${num(dz)}`, 500, 375, C.y, 22);
      text(g, 'Con dos teclas se forma un rombo: la suma es su diagonal.', 500, 430, { color: C.dim, size: 16 });
      text(g, 'Sin normalizar todavía: ese es el próximo paso.', 500, 458, { color: C.dim, size: 16 });
    } else {
      const ox = 240, oy = 390, U = 220, k = p.normalize ? Math.SQRT1_2 : 1;
      g.strokeStyle = C.line; g.setLineDash([6, 6]); g.beginPath(); g.arc(ox, oy, U, -Math.PI / 2, 0); g.stroke(); g.setLineDash([]);
      arrow(g, ox, oy, ox, oy - U, C.dim, 3); arrow(g, ox, oy, ox + U, oy, C.dim, 3); arrow(g, ox, oy, ox + U * k, oy - U * k, p.normalize ? C.ok : C.c, 6);
      text(g, 'W = 1', ox - 70, oy - U + 10, { color: C.dim }); text(g, 'D = 1', ox + U - 20, oy + 30, { color: C.dim });
      mono(g, `largo = ${num(k * Math.SQRT2)}`, 520, 120, p.normalize ? C.ok : C.c, 32); text(g, p.normalize ? 'Misma velocidad en toda dirección' : '41% más rápido en diagonal', 520, 165, { color: C.dim, size: 20 });
      const sp = game.last.speed, MAX = 6; text(g, 'Tu velocidad real', 520, 250, { size: 19, weight: 600 }); rect(g, 520, 266, 360, 34, '#141d2c', C.line); rect(g, 520, 266, clamp(sp / MAX, 0, 1) * 360, 34, sp > 3.5 ? C.c : C.ok);
      [[3.2, 'recto'], [4.53, 'diagonal']].forEach(([v, l]) => { const X = 520 + v / MAX * 360; line(g, X, 258, X, 308, C.fg, 2); text(g, l, X, 330, { size: 15, align: 'center', color: C.dim }); });
      mono(g, `${num(sp, 1)} m/s`, 520, 380, C.fg, 28); text(g, live ? 'Caminá con W y después con W+D.' : 'Tocá Tab para caminar.', 520, 420, { color: C.dim, size: 18 });
    }
  },
  vocab: ['yaw / pitch / roll', 'radianes', 'vector unitario', 'dirección y magnitud', 'espacio local y espacio mundo', 'suma de vectores', 'normalizar'],
  prompt: 'Movimiento relativo a la cámara: construí el vector de input local (forward, strafe), normalizalo con Math.hypot y convertilo a espacio mundo sumando los vectores adelante y derecha derivados del yaw. Aplicá pos += dir * velocidad * dt. La cámara usa orden de rotación YXZ.',
};

// ---------------------------------------------------------------- SALA 4
const sim = (fps, fn, T = 1.5) => { const pts = [], h = 1 / fps; let v = 0; for (let t = 0; t <= T + 1e-6; t += h) { pts.push([t, v]); v = fn(v, h); } return pts; };
const curve = (g, pts, ox, oy, sx, sy, col, steps) => { g.strokeStyle = col; g.lineWidth = 3; g.beginPath(); pts.forEach(([t, v], i) => { const X = ox + t * sx, Y = oy - v * sy; if (i && steps) g.lineTo(X, oy - pts[i - 1][1] * sy); i ? g.lineTo(X, Y) : g.moveTo(X, Y); }); g.stroke(); };
function axes(g, ox, oy, sx, sy, T = 1.5) {
  line(g, ox, oy, ox + T * sx + 20, oy); line(g, ox, oy, ox, oy - sy - 20);
  for (const t of [0, .5, 1, 1.5]) { const X = ox + t * sx; line(g, X, oy, X, oy + 7, C.dim, 2); text(g, `${String(t).replace('.', ',')} s`, X, oy + 26, { size: 15, align: 'center', color: C.dim }); }
  for (const v of [0, 50, 100]) { const Y = oy - v / 100 * sy; line(g, ox - 7, Y, ox, Y, C.dim, 2); text(g, `${v}%`, ox - 12, Y + 5, { size: 15, align: 'right', color: C.dim }); }
  line(g, ox, oy - sy, ox + T * sx + 20, oy - sy, C.b, 1, [6, 6]); text(g, 'velocidad objetivo', ox + T * sx - 150, oy - sy - 8, { color: C.b, size: 15 });
}
const FPS = { type: 'select', key: 'fps', label: 'FPS de la simulación', options: [['15', '15 FPS'], ['30', '30 FPS'], ['60', '60 FPS'], ['144', '144 FPS']], num: true };
const K = { type: 'range', key: 'k', label: 'k (rapidez)', min: 2, max: 30, step: 1, fmt: (v) => String(v) };

export const smoothing = {
  id: 'smoothing', col: 3, row: 0, color: '#a493ff', title: 'Movimiento suave', tagline: 'Cómo arrancar y frenar de a poco, igual en cualquier PC: lerp y delta time.',
  params: { t: .3, k: 10, fps: 15, walkK: 10, hist: [], aT: 0, runA: null, runB: null },
  onClose(p, game) { p.walkK = 10; game.feel.k = 10; },
  steps: [
    { h: 'Arrancar y frenar suave: qué es lerp', controls: [{ type: 'range', key: 't', label: 't', min: 0, max: 1, step: .01, fmt: (v) => num(v) }], body: `<p>Un personaje no pasa de quieto a correr en un instante: acelera y frena de a poco. La herramienta más usada para lograrlo es una fórmula muy simple.</p><p><b>Lerp</b> viene de <i>linear interpolation</i>. Devuelve un valor entre A y B según un porcentaje <code>t</code>:</p><p><code>lerp(A, B, t) = A + (B - A) * t</code></p><p>Con <code>t = 0</code> te da A, con <code>t = 1</code> te da B y con <code>0,5</code> el medio.</p><p><b>El truco:</b> en cada frame, el valor avanza un porcentaje de la distancia que le falta. Cada paso lo acerca al destino, entonces falta menos, y el mismo porcentaje da un paso más chico. Por eso arranca rápido y frena solo, sin escribir física.</p><p>Por ejemplo, con <code>t = 0,5</code> para ir de 0 a 100:</p><table><tr><th>Frame</th><th>Falta</th><th>Avanza el 50%</th><th>Llega a</th></tr><tr><td>1</td><td>100</td><td>50</td><td>50</td></tr><tr><td>2</td><td>50</td><td>25</td><td>75</td></tr><tr><td>3</td><td>25</td><td>12,5</td><td>87,5</td></tr></table><p>Los pasos se achican hasta que la distancia que queda es tan chica que ya no se nota.</p><p>El slider cambia los dos gráficos. Abajo, cada punto es un frame: con <code>t</code> chico el valor se arrastra, con <code>t</code> grande llega de golpe, con 1 salta en un frame y con 0 nunca sale.</p>` },
    { h: 'Delta time: el mismo juego en cualquier monitor', body: `<p>Un frame no dura siempre lo mismo. A 60 FPS dura 16,6 ms, a 144 FPS dura 6,9 ms, y si la PC se traba, 100 ms.</p><p><b>Delta time</b> (<code>dt</code>) es el tiempo que pasó desde el frame anterior. Sin él, tu juego corre más rápido en un monitor mejor: es lo que le pasaba a los juegos viejos.</p><p>Mover <code>velocidad * dt</code> soluciona el <b>movimiento</b>. Pero el <b>suavizado</b> tiene una trampa, y la vemos en el próximo paso.</p><p>Medido en tu máquina ahora: el gráfico muestra el dt real de los últimos frames.</p>` },
    { h: 'El error común: un lerp que depende de los FPS', controls: [FPS], body: `<p><b>El problema:</b> con más FPS, el mismo código llega antes al objetivo. El lerp corre una vez por frame, así que en un segundo se ejecuta 60 veces a 60 FPS y solo 15 veces a 15 FPS. Cada ejecución acerca un poco más el valor, y por eso a más FPS recorre la misma distancia en menos tiempo.</p><p>Este es el código que lo causa, y una IA te lo puede dar si no lo pedís bien:</p><p><code>vel = lerp(vel, objetivo, 0.1)</code></p><p>Es la fórmula de la primera página: cada vez que corre, <code>vel</code> avanza el 10% de lo que le falta. Aparece dos veces porque el resultado pisa a la variable y es el punto de partida del frame siguiente.</p><p><b>Cómo leer el gráfico:</b> el eje de abajo es tiempo y el de la izquierda, cuánto de la velocidad objetivo se alcanzó. Cada escalón es un frame. La lista muestra el resultado a los 0,5 s: a 15 FPS se ejecutó 7 veces y a 60 FPS, 30 veces. Abajo lo ves andando contra una referencia a 144 FPS.</p><p>En un juego, esto significa que el personaje acelera distinto en una PC rápida y en una lenta. Multiplicar <code>0.1 * dt</code> lo mejora, pero no lo resuelve del todo, porque el proceso no es lineal.</p>` },
    { h: 'La solución: lerp exponencial, igual a cualquier FPS', controls: [FPS, K], body: `<p>Queremos que el resto por recorrer se reduzca igual <b>por segundo</b>, no por frame. Multiplicar repetidamente es exponencial, y su forma con tiempo continuo es <code>e^(-k·t)</code>.</p><p>Entonces el <code>t</code> del lerp se calcula con el dt:</p><p><code>t = 1 - Math.exp(-dt * k)</code></p><p>Dos frames cortos dan exactamente lo mismo que uno largo, y por eso todos los FPS caen sobre <b>la misma curva</b>. Cambiá el selector: los puntos siguen pegados.</p><p>El nombre técnico es <b>exponential decay</b> o <b>exponential smoothing</b>.</p><p>Existe otra técnica, el <b>resorte amortiguado</b> (spring). Además de la posición guarda su propia velocidad, así que puede pasarse del objetivo y rebotar. Da animaciones más vivas a cambio de más estado y más parámetros. Para caminar no hace falta.</p>`, code: `// en una línea, con los vectores de Three.js\nvel.lerp(target, 1 - Math.exp(-dt * 10));` },
    { h: 'Ajustar la respuesta: qué significa k', controls: [K], body: `<p><code>k</code> controla qué tan rápido responde. Se traduce a un número intuitivo, la <b>vida media</b>: cuánto tarda en recorrer la mitad de lo que falta.</p><p><code>vida media = ln(2) / k</code></p><p>Con <code>k = 10</code>, el valor de este juego, son unos 69 ms: se siente inmediato, pero sin saltos.</p><p>En la pista de la sala, los tres bloques persiguen el mismo objetivo: el del medio simula un lerp fijo a 15 FPS.</p>` },
    { h: 'Dónde se usa: tu personaje, la puerta y la cámara', controls: [{ type: 'range', key: 'walkK', label: 'k de tu personaje', min: 1, max: 30, step: 1, fmt: (v) => String(v), apply: 'walkK' }], body: `<p>No es teoría: tu personaje usa esta fórmula para pasar de quieto a caminando. Las teclas dicen <b>velocidad objetivo</b> y la velocidad real la persigue con lerp exponencial.</p><p>Bajá <code>k</code> a 1 o 2, tocá <kbd>Tab</kbd> y caminá: te sentís sobre hielo, tardás en arrancar y en frenar. Subilo a 30: se vuelve casi instantáneo. El gráfico dibuja tu velocidad real. Al cerrar el pizarrón vuelve al 10.</p><p>También se usa en otros lugares del juego:</p><ul><li>La inclinación de cámara al girar (sala 11).</li><li>La puerta corrediza de la sala 5.</li><li>El foco de la profundidad de campo (sala 7).</li></ul><p>Sirve igual para cámaras que siguen algo, animaciones de UI, valores de un dashboard o scroll suave.</p>` },
  ],
  demo(g, W, H, x) {
    const { p, step, game } = x; clear(g, W, H, step < 2);
    const ox = 80, sx = 520;
    if (step === 0) {
      const A = 120, B = 840, Y = 200, P = lerp(A, B, p.t); line(g, A, Y, B, Y, C.line, 4); dot(g, A, Y, 12, C.dim); dot(g, B, Y, 12, C.b); dot(g, P, Y, 16, C.a);
      text(g, 'A', A - 8, Y - 26, { weight: 700 }); text(g, 'B', B - 8, Y - 26, { weight: 700 }); mono(g, `lerp(0, 100, ${num(p.t)}) = ${(p.t * 100).toFixed(0)}`, 120, 110, C.a, 28);
      text(g, `Repetir lerp con t = ${num(p.t)}, frame a frame (30 frames):`, 120, 310, { color: C.dim }); const n = (x.t * 12) % 36 | 0; let v = 0, reached = -1; for (let i = 0; i < 30; i++) { const X = lerp(A, B, v); dot(g, X, 360, 7, i <= n ? C.y : C.line); if (reached < 0 && v > .99) reached = i; v += (1 - v) * p.t; }
      const msg = p.t === 0 ? 'Con t = 0 el valor nunca se mueve.' : reached >= 0 ? `Llega al 99% en el frame ${reached}.` : `En 30 frames llega al ${(v * 100).toFixed(0)}%.`;
      text(g, msg, 120, 430, { color: C.fg, size: 23, weight: 600 }); text(g, 'Saltos grandes al principio, chicos al final: frena solo.', 120, 470, { color: C.dim });
    } else if (step === 1) {
      const f = game.frameTimes.slice(-180); text(g, 'Delta time real de tu máquina', 70, 80, { size: 26, weight: 700, font: HEAD }); line(g, 70, 500, 900, 500);
      f.forEach((v, i) => rect(g, 70 + i * 4.6, 500 - clamp(v * 10, 2, 390), 3.4, clamp(v * 10, 2, 390), v > 24 ? C.c : C.b));
      const avg = f.reduce((a, b) => a + b, 0) / (f.length || 1); mono(g, `promedio ${num(avg, 1)} ms = ${(1000 / avg).toFixed(0)} FPS`, 70, 545, C.fg, 24);
    } else if (step === 2) {
      const oy = 330, sy = 260; axes(g, ox, oy, sx, sy); const f = (v) => v + (1 - v) * .1, all = [15, 30, 60, 144];
      all.forEach((r) => { if (r !== p.fps) curve(g, sim(r, f), ox, oy, sx, sy, C.line, false); }); curve(g, sim(p.fps, f), ox, oy, sx, sy, C.a, true);
      const fw = sx / p.fps; if (fw > 14) { line(g, ox, oy + 2, ox + fw, oy + 2, C.y, 4); mono(g, `1 frame = ${(1000 / p.fps).toFixed(0)} ms`, ox + fw + 10, oy - 10, C.y, 14); }
      text(g, 'lerp(vel, objetivo, 0.1) por frame', 90, 34, { color: C.c, weight: 700, size: 20, font: HEAD });
      text(g, 'Velocidad alcanzada', 660, 150, { size: 16, weight: 600 }); text(g, 'a los 0,5 s', 660, 170, { size: 16, weight: 600 }); line(g, ox + .5 * sx, oy, ox + .5 * sx, oy - sy, C.dim, 1, [5, 5]);
      all.forEach((r, i) => { const v = sim(r, f).filter(([t]) => t <= .5 + 1e-6).at(-1)[1]; mono(g, `${String(r).padStart(3)} FPS: ${(v * 100).toFixed(0)}%`, 660, 200 + i * 26, r === p.fps ? C.a : C.dim, 17); });
      const T = 2.2; p.aT += x.dt; if (p.aT > T || !p.runA || p.runA.fps !== p.fps) { p.aT = 0; p.runA = { fps: p.fps, v: 0, pos: 0, next: 0 }; p.runB = { fps: 144, v: 0, pos: 0, next: 0 }; }
      for (const r of [p.runA, p.runB]) { const h = 1 / r.fps; while (r.next <= p.aT) { r.v += (1 - r.v) * .1; r.pos += r.v * h; r.next += h; } }
      const tx = 170, tw = 720, sc = tw / 2.2; [[p.runA, `${p.fps} FPS`, C.a, 420], [p.runB, '144 FPS', C.dim, 480]].forEach(([r, l, col, y]) => { text(g, l, 80, y + 6, { color: col, size: 17, weight: 600 }); line(g, tx, y, tx + tw, y, C.line, 2); dot(g, tx + r.pos * sc, y, 11, col); });
      text(g, 'Mismo código, mismo objetivo: cada punto avanza según su velocidad.', 80, 540, { color: C.dim, size: 18 });
      mono(g, `distancia del punto a ${p.fps} FPS: ${num(p.runA.pos / Math.max(p.runB.pos, .001) * 100, 0)}% de la referencia`, 80, 572, C.fg, 16);
    } else if (step === 3) {
      const oy = 510, sy = 420; axes(g, ox, oy, sx, sy); const expo = (v, h) => v + (1 - v) * (1 - Math.exp(-h * p.k));
      curve(g, sim(1000, expo), ox, oy, sx, sy, C.b); sim(p.fps, expo).forEach(([t, v]) => dot(g, ox + t * sx, oy - v * sy, 5, C.a));
      text(g, 'Curva ideal + muestras al FPS elegido', 90, 50, { color: C.ok, weight: 700, size: 22, font: HEAD }); mono(g, `t por frame: ${num(1 - Math.exp(-p.k / p.fps), 3)}`, 640, 400, C.a, 20);
    } else if (step === 4) {
      const oy = 510, sy = 420; axes(g, ox, oy, sx, sy); const hl = Math.log(2) / p.k, expo = (t) => 1 - Math.exp(-p.k * t); const pts = []; for (let t = 0; t <= 1.5; t += .004) pts.push([t, expo(t)]); curve(g, pts, ox, oy, sx, sy, C.b);
      for (let i = 1; i <= 3; i++) { const tt = hl * i, X = ox + tt * sx, Y = oy - expo(tt) * sy; if (tt < 1.5) { line(g, X, oy, X, Y, C.y, 2, [5, 5]); dot(g, X, Y, 7, C.y); text(g, `${num(expo(tt) * 100, 1)}%`, X + 8, Y + 22, { color: C.y, size: 17 }); } }
      mono(g, `vida media = ${(hl * 1000).toFixed(0)} ms`, 640, 400, C.y, 22); text(g, 'Cada vida media corta el resto a la mitad.', 90, 50, { weight: 700, size: 22, font: HEAD });
    } else {
      p.hist.push(game.last.speed); if (p.hist.length > 190) p.hist.shift();
      const oy = 470, sy = 54; line(g, 60, oy, 900, oy); line(g, 60, oy, 60, oy - 6 * sy);
      for (const v of [0, 2, 4, 6]) { text(g, `${v}`, 50, oy - v * sy + 5, { align: 'right', size: 15, color: C.dim }); line(g, 56, oy - v * sy, 60, oy - v * sy, C.dim, 2); }
      text(g, 'Tu velocidad real (m/s), en vivo', 70, 90, { size: 24, weight: 700, font: HEAD });
      g.strokeStyle = C.a; g.lineWidth = 3; g.beginPath(); p.hist.forEach((v, i) => { const X = 60 + i * 4.4, Y = oy - v * sy; i ? g.lineTo(X, Y) : g.moveTo(X, Y); }); g.stroke();
      mono(g, `k = ${p.walkK}  vida media = ${(Math.log(2) / p.walkK * 1000).toFixed(0)} ms`, 60, 530, C.y, 22);
      text(g, x.mode === 'try' ? 'Arrancá y frená: mirá qué tan inclinada queda la curva.' : 'Tocá Tab para caminar.', 60, 568, { color: C.dim, size: 18 });
    }
  },
  vocab: ['lerp', 'delta time', 'framerate independence', 'exponential smoothing', 'vida media (half-life)', 'spring', 'easing'],
  prompt: 'Suavizado independiente del framerate: no uses lerp con t fijo. Calculá t = 1 - Math.exp(-dt * k) con dt en segundos, y limitá dt a 0.1 para que no salte tras una pausa.',
};
