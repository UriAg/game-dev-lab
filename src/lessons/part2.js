import { C, clear, text, mono, line, arrow, dot, ring, rect, lerp, clamp, kb, HEAD } from './draw.js';
import { OccupancyGrid, astar } from '../game/grid.js';
import { GpuEffect, cpuEffect } from './gpuDemo.js';
import { backendName } from '../game/state.js';

const benchKey = 'lab:bench';
const readBench = () => { try { return JSON.parse(sessionStorage.getItem(benchKey) || '{}'); } catch { return {}; } };
const saveBench = (b) => { try { sessionStorage.setItem(benchKey, JSON.stringify(b)); } catch { /* sin storage */ } };
let cpuCanvas, cpuCtx, gpuFx;

// ---------------------------------------------------------------- COLISIONES
const G = new OccupancyGrid(12, 7.5, .3, 0);
G.addBox(6, 7.2, 0, 4.5); G.addBox(2.4, 3.6, 4.5, 7.5); G.addBox(9.3, 12, 3, 3.9); G.rebuild();

const collision = {
  id: 'collision', col: 3, row: 1, color: '#ffd34d', title: 'Colisiones', tagline: 'Cómo sabe el juego que chocaste con una pared, sin un motor de físicas.',
  params: { slide: true, inflate: false, angle: .45, bot: null, door: false, rays: true },
  steps: [
    { h: 'Chocar sin motor de físicas: por qué alcanza con menos', body: `<p>Para que no atravieses las paredes, el juego tiene que saber en cada frame si tu próximo paso choca con algo. Lo primero que se suele pensar es usar un motor de físicas.</p><p>Un motor como Rapier o Cannon simula masa, fricción, rebotes y formas arbitrarias. Es potente, pesa varios cientos de KB y consume CPU en cada frame.</p><p>Este juego pasa en interiores con piso plano: no hay saltos, ni cajas que vuelan. Solo necesita responder una pregunta: <b>¿puedo pararme acá?</b></p><p>Esta es una de las decisiones más valiosas para aprender: <b>elegir la herramienta más simple que resuelve el problema real</b>.</p>` },
    { h: 'Grilla de ocupación: el mundo como un mapa de celdas', body: `<p>Se divide el piso en celdas y cada una guarda un 0 (libre) o un 1 (bloqueada). Así el mundo 3D se reduce a un mapa 2D.</p><p>Se guarda en un <code>Uint8Array</code>: un array plano de bytes. Es compacto y muy rápido. Se llega a una celda con <code>z * ancho + x</code>.</p><p>Consultar una posición cuesta siempre lo mismo, tengas 10 o 10.000 objetos: <b>O(1)</b>.</p><p>Tocá <b>Probar caminando</b> y mirá el piso de la sala: esas celdas rojas son la grilla real de este juego, a 20 cm por celda.</p>`, code: `blocked(x, z) {\n  const cx = Math.floor(x / celda);\n  const cz = Math.floor(z / celda);\n  return cells[cz * ancho + cx] === 1;\n}` },
    { h: 'Darle cuerpo al jugador: inflar los obstáculos', controls: [{ type: 'toggle', key: 'inflate', label: 'Inflar con el radio del jugador' }], body: `<p>El jugador tiene cuerpo, pero chequear un círculo contra todo es más complejo.</p><p>El truco: agrandar cada obstáculo por el radio del jugador, y tratar al jugador como un <b>punto</b>. El resultado es equivalente, y solo chequeás una celda.</p><p>Se llama <b>espacio de configuración</b> (configuration space), y viene de la robótica.</p><p>Por eso en el piso rojo de la sala las paredes se ven más gruesas de lo que son.</p>` },
    { h: 'No quedarse pegado: deslizar contra las paredes', controls: [{ type: 'toggle', key: 'slide', label: 'Resolución por ejes (slide)' }, { type: 'range', key: 'angle', label: 'Ángulo del choque', min: .1, max: 1.45, step: .01, fmt: (v) => `${(v * 57.3).toFixed(0)}°` }], body: `<p>Si chocás en diagonal y frenás en seco, se siente pegajoso. Deslizarse es tres intentos:</p><ol><li>¿Puedo moverme en diagonal? Listo.</li><li>Si no, ¿puedo moverme solo en X?</li><li>Si no, ¿puedo moverme solo en Z?</li></ol><p>Apagá el toggle y mirá cómo se queda pegado. Encendido, conserva la parte del movimiento que no choca.</p><p>Hay un límite honesto: si el <code>dt</code> es muy grande, el paso podría saltarse una pared fina. Por eso se limita el <code>dt</code> máximo.</p>`, code: `if (!blocked(x+dx, z+dz)) { x+=dx; z+=dz; }\nelse if (!blocked(x+dx, z)) x+=dx;\nelse if (!blocked(x, z+dz)) z+=dz;` },
    { h: 'Puertas: actualizar el mapa cuando el mundo cambia', controls: [{ type: 'button', label: 'Abrir o cerrar la puerta hacia A*', action: (p, game) => { const e = game.world.exhibits.collision; e.setDoor(!e.doorClosed); } }], body: `<p>El mapa no es fijo: cuando una puerta se cierra, se marcan sus celdas y se recalcula esa zona.</p><p>Tocá el botón, o apretá con <kbd>E</kbd> el botón junto a la puerta, y mirá el mapa real. También cambia la puerta en la pared oeste de esta sala, y si la cerrás, ni vos ni el pathfinding pueden pasar: los dos leen la misma grilla.</p><p>Una estructura de datos sola resuelve caminar, chocar, y buscar caminos. La próxima sala es justo eso.</p>` },
  ],
  demo(g, W, H, x) {
    clear(g, W, H); const { p, step, game } = x, S = 40, ox = 0, oy = 0;
    const cells = (grid, sz, inflated) => { for (let z = 0; z < grid.h; z++) for (let c = 0; c < grid.w; c++) { const b = grid.blockedCell(c, z); rect(g, ox + c * sz + 1, oy + z * sz + 1, sz - 2, sz - 2, b ? (inflated ? 'rgba(255,93,115,.5)' : C.c) : 'rgba(69,214,196,.07)'); } };
    if (step === 0) {
      const opts = [['Rapier / Cannon', ['Masa, fricción, rebotes', 'Formas 3D arbitrarias', 'Pesa cientos de KB', 'CPU en cada frame'], C.c], ['Grilla 2D + ejes', ['¿Puedo pararme acá?', 'Piso plano e interiores', 'Unos KB de código propio', 'Sirve también para A*'], C.ok]];
      opts.forEach(([n, l, col], i) => { const X = 70 + i * 430; rect(g, X, 90, 390, 400, '#131c2b', col); text(g, n, X + 24, 145, { size: 28, weight: 700, font: HEAD, color: col }); l.forEach((s, k) => text(g, s, X + 24, 210 + k * 56, { size: 22 })); });
    } else if (step === 1) {
      cells(G, S); const col = clamp(Math.floor((x.mouse.x) / S), 0, G.w - 1), row = clamp(Math.floor(x.mouse.y / S), 0, G.h - 1);
      rect(g, col * S, row * S, S, S, null, C.y); const v = G.blockedCell(col, row) ? 1 : 0;
      rect(g, 20, 520, 920, 64, '#0b111ccc'); mono(g, `cells[${row} * ${G.w} + ${col}] = cells[${row * G.w + col}] = ${v}`, 40, 562, v ? C.c : C.ok, 26);
    } else if (step === 2) {
      const grid = new OccupancyGrid(12, 7.5, .3, p.inflate ? .3 : 0); grid.boxes = G.boxes; grid.rebuild();
      cells(grid, S, p.inflate); if (p.inflate) { for (let z = 0; z < G.h; z++) for (let c = 0; c < G.w; c++) if (G.blockedCell(c, z)) rect(g, c * S + 1, z * S + 1, S - 2, S - 2, C.c); }
      const c = 120 + Math.sin(x.t) * 60 + 300; if (p.inflate) dot(g, 4.2 * S + Math.sin(x.t) * 20, 300, 6, C.y); else { dot(g, c - 120, 300, 40, 'rgba(255,211,77,.3)'); dot(g, c - 120, 300, 6, C.y); }
      text(g, p.inflate ? 'Jugador = un punto. Obstáculos más gordos.' : 'Jugador = un círculo. Más casos para chequear.', 30, 575, { size: 24, weight: 700, font: HEAD });
    } else if (step === 3) {
      cells(G, S); const bot = p.bot ??= { x: 2, z: 1.2, trail: [] };
      const speed = 2.2 * x.dt, dx = Math.cos(p.angle) * speed, dz = Math.sin(p.angle) * speed;
      const res = G.move(bot, dx, dz, p.slide); bot.trail.push([bot.x, bot.z]); if (bot.trail.length > 300) bot.trail.shift();
      if (bot.x > 11.5 || bot.z > 7.2) { bot.x = 2; bot.z = 1.2; bot.trail = []; p.stuckT = 0; }
      if (res === 'stuck') { p.stuckT = (p.stuckT ?? 0) + x.dt; if (p.stuckT > 1.4) { bot.x = 2; bot.z = 1.2; bot.trail = []; p.stuckT = 0; } }
      bot.trail.forEach(([a, b], i) => i % 3 === 0 && dot(g, a / .3 * S, b / .3 * S, 2.5, C.y)); dot(g, bot.x / .3 * S, bot.z / .3 * S, 10, C.a);
      arrow(g, bot.x / .3 * S, bot.z / .3 * S, bot.x / .3 * S + Math.cos(p.angle) * 56, bot.z / .3 * S + Math.sin(p.angle) * 56, C.fg, 3);
      rect(g, 20, 528, 420, 54, '#0b111ccc'); mono(g, `resultado: ${res}`, 36, 564, res === 'stuck' ? C.c : res === 'free' ? C.ok : C.y, 26);
    } else {
      const w = game.grid, sz = 9.6, x0 = 100, z0 = 50, room = game.world.exhibits.collision;
      for (let z = 0; z < 56; z++) for (let c = 0; c < 100; c++) { if (w.blockedCell(x0 + c, z0 + z)) rect(g, c * sz, z * sz, sz - .6, sz - .6, C.c); }
      dot(g, (game.pos.x / .2 - x0) * sz, (game.pos.z / .2 - z0) * sz, 8, C.y);
      text(g, room.doorClosed ? 'Puerta CERRADA: celdas bloqueadas' : 'Puerta ABIERTA: celdas libres', 30, 590, { color: room.doorClosed ? C.c : C.ok, size: 24, weight: 700, font: HEAD });
    }
  },
  vocab: ['occupancy grid', 'Uint8Array', 'AABB', 'configuration space', 'axis-separated resolution', 'collide and slide'],
  prompt: 'No uses motor de físicas. Colisión con grilla 2D de ocupación en un Uint8Array, obstáculos AABB inflados por el radio del jugador. Resolvé por ejes separados (diagonal, solo X, solo Z) para deslizar por las paredes. La misma grilla debe servir para pathfinding.',
};

// ---------------------------------------------------------------- A*
const AW = 24, AH = 15;
function freshAstar(p) {
  p.it = astar(AW, AH, (x, z) => p.walls[z * AW + x] === 1, p.start, p.goal, p.weight);
  p.state = null; p.done = false; p.expanded = 0; p.acc = 0;
}
const astarLesson = {
  id: 'astar', col: 2, row: 1, color: '#7ee081', title: 'Encontrar caminos', tagline: 'Cómo un personaje llega a un punto esquivando paredes: el algoritmo A*.',
  params: { walls: null, start: [2, 7], goal: [21, 7], weight: 1, speed: 40, play: true, paint: 1 },
  init(p) { if (!p.walls) { p.walls = new Uint8Array(AW * AH); for (let z = 2; z < 13; z++) { p.walls[z * AW + 12] = 1; } for (let c = 6; c < 13; c++) p.walls[2 * AW + c] = 1; for (let c = 12; c < 19; c++) p.walls[12 * AW + c] = 1; freshAstar(p); } },
  steps: [
    { h: 'Cómo encuentra el camino un enemigo: la idea de A*', body: `<p>Tenés un punto A, un punto B y obstáculos. ¿Cuál es el camino más corto?</p><p>Probar todos los caminos es imposible. A* explora ordenadamente: siempre sigue por la celda <b>más prometedora</b>, y se guarda las demás para volver si esa no sirve.</p><p>Mirá la animación. Verde: celdas pendientes (lista abierta). Azul: ya exploradas (lista cerrada). Amarillo: el camino final.</p><p><b>Click izquierdo</b> sobre el gráfico dibuja paredes y <b>click derecho</b> las borra. Cada cambio recalcula la búsqueda.</p>`, controls: [{ type: 'button', label: 'Reiniciar búsqueda', action: (p) => freshAstar(p) }] },
    { h: 'Cómo elige la próxima celda: f = g + h', body: `<p>La nota de cada celda sale de dos números:</p><ul><li><b>g:</b> lo que ya caminaste desde el inicio. Es real.</li><li><b>h:</b> lo que <b>estimás</b> que falta hasta la meta, ignorando paredes. Es la <b>heurística</b>.</li></ul><p><b>f = g + h</b> es el costo total estimado. A* siempre abre la celda con menor f.</p><p>Pasá el mouse sobre las celdas exploradas para ver sus números.</p><p>Si <code>h</code> nunca sobreestima, A* garantiza el camino más corto. En una grilla de 8 direcciones se usa la distancia <b>octile</b>: rectas cuestan 1 y diagonales 1,41.</p>`, controls: [{ type: 'button', label: 'Reiniciar búsqueda', action: (p) => freshAstar(p) }] },
    { h: 'Heurística: por qué A* no explora todo el mapa', controls: [{ type: 'range', key: 'weight', label: 'Peso de h', min: 0, max: 3, step: .25, fmt: (v) => v.toFixed(2), onChange: (p) => freshAstar(p) }], body: `<p>Mové el peso y compará las celdas exploradas:</p><ul><li><b>0:</b> sin heurística, es el algoritmo de <b>Dijkstra</b>. Se expande en todas direcciones: óptimo, pero explora de más.</li><li><b>1:</b> A* clásico. Se dirige a la meta y sigue siendo óptimo.</li><li><b>Mayor que 1:</b> más rápido y más "goloso", pero puede devolver un camino peor.</li></ul><p>Ese es el trade-off: velocidad de búsqueda contra calidad del camino.</p>` },
    { h: 'A* en el juego: el personaje que te persigue', body: `<p>El código que corre esta animación es el mismo <code>astar()</code> que usa el juego, con <code>grid.path()</code>.</p><p>En esta sala hay un personaje que te persigue: recalcula su camino cada 0,6 segundos y lo marca con puntos amarillos en el piso. Tocá <b>Probar caminando</b> y escondete atrás de un muro bajo.</p><p>También podés hacer <b>click derecho</b> apuntando con la mira a un punto del piso, en cualquier sala, y caminás hasta ahí solo. Es el clásico "click para caminar".</p>` },
  ],
  demo(g, W, H, x) {
    const { p, mouse, game } = x; astarLesson.init(p); clear(g, W, H);
    const S = 40, oz = 0;
    const cx = Math.floor(mouse.x / S), cz = Math.floor((mouse.y - oz) / S), inside = cx >= 0 && cz >= 0 && cx < AW && cz < AH && mouse.has;
    if (mouse.down && inside) {
      const k = cz * AW + cx, isEnd = (cx === p.start[0] && cz === p.start[1]) || (cx === p.goal[0] && cz === p.goal[1]);
      p.paint = mouse.button === 2 ? 0 : 1;
      if (!isEnd && p.walls[k] !== p.paint) { p.walls[k] = p.paint; freshAstar(p); }
    }
    if (!p.done) { p.acc += x.dt * p.speed; while (p.acc > 1 && !p.done) { p.acc--; const r = p.it.next(); if (r.done) p.done = true; else { p.state = r.value; p.expanded = r.value.closed.size; } } }
    const s = p.state;
    for (let z = 0; z < AH; z++) for (let c = 0; c < AW; c++) {
      const k = z * AW + c; let col = 'rgba(255,255,255,.03)';
      if (p.walls[k]) col = '#52627c'; else if (s?.closed.has(k)) col = 'rgba(69,150,214,.42)'; else if (s?.open.has(k)) col = 'rgba(126,224,129,.42)';
      rect(g, c * S + 1, z * S + oz + 1, S - 2, S - 2, col);
    }
    if (s?.path) { g.strokeStyle = C.y; g.lineWidth = 6; g.beginPath(); s.path.forEach(([c, z], i) => { const X = c * S + 20, Y = z * S + 20; i ? g.lineTo(X, Y) : g.moveTo(X, Y); }); g.stroke(); }
    dot(g, p.start[0] * S + 20, p.start[1] * S + 20, 13, C.a); dot(g, p.goal[0] * S + 20, p.goal[1] * S + 20, 13, C.c);
    const hx = inside ? cx : null;
    if (hx !== null && s) { const k = cz * AW + cx, gv = s.g.get(k); if (gv !== undefined) { const dx = Math.abs(cx - p.goal[0]), dz = Math.abs(cz - p.goal[1]), h = dx + dz + (Math.SQRT2 - 2) * Math.min(dx, dz); rect(g, cx * S, cz * S, S, S, null, C.fg); mono(g, `g ${gv.toFixed(1)} + h ${h.toFixed(1)} = f ${(gv + h).toFixed(1)}`, 40, 596, C.fg, 18); } }
    if (!(hx !== null && s?.g.get(cz * AW + cx) !== undefined)) mono(g, `exploradas: ${p.expanded}${s?.path ? `  costo: ${s.cost.toFixed(1)}` : s?.failed ? '  sin camino' : ''}${game.world.exhibits.astar.lastMs != null && x.step === 3 ? `  grilla real: ${game.world.exhibits.astar.lastMs.toFixed(1)} ms` : ''}`, 40, 596, C.fg, 18);
  },
  vocab: ['A*', 'heurística', 'g, h, f', 'lista abierta / cerrada', 'distancia octile', 'Dijkstra', 'trade-off'],
  prompt: 'Pathfinding A* sobre la grilla de colisión, con 8 direcciones sin cortar esquinas y heurística octile. Usá una cola de prioridad (binary heap) si la grilla es grande. Reusá el camino para click-to-walk y recalculá cuando cambie una puerta.',
};

// ---------------------------------------------------------------- WEBGPU
const tri = [[.5, .08], [.92, .92], [.1, .75]];
const inTri = (px, py) => { const s = (a, b) => (px - b[0]) * (a[1] - b[1]) - (a[0] - b[0]) * (py - b[1]); const d1 = s(tri[0], tri[1]), d2 = s(tri[1], tri[2]), d3 = s(tri[2], tri[0]); return !((d1 < 0 || d2 < 0 || d3 < 0) && (d1 > 0 || d2 > 0 || d3 > 0)); };
const webgpu = {
  id: 'webgpu', col: 1, row: 1, color: '#6db3ff', title: 'Dibujar con la GPU', tagline: 'Cómo el mundo 3D se convierte en píxeles: WebGPU y shaders.',
  params: { res: 12, amp: .08, freq: 9, speed: 1.6, mixA: .5, ao: true, dof: false, dofLevel: .35, proc: 'gpu', n: 128, cpuMs: 0, gpuMs: 0, stage: 'vertex', bench: readBench(), benching: false },
  steps: [
    { h: 'Por qué dibujar con la GPU: CPU contra GPU', controls: [{ type: 'select', key: 'proc', label: 'Ejecutar en', options: [['gpu', 'GPU (shader)'], ['cpu', 'CPU (JavaScript)']] }, { type: 'range', key: 'n', label: 'Resolución de la prueba', min: 128, max: 512, step: 64, fmt: (v) => `${v}×${v}` }], body: `<p>Un juego 3D tiene que calcular el color de millones de píxeles, 60 veces por segundo. Para eso hay un procesador especial, y la clave es entender por qué.</p><p>La <b>CPU</b> tiene pocos núcleos muy capaces: resuelve tareas complejas una tras otra. La <b>GPU</b> tiene miles de núcleos simples, que hacen a la vez la misma operación sobre datos distintos.</p><p>Una pantalla Full HD son 2 millones de píxeles, y cada uno necesita un color 60 veces por segundo: eso es paralelismo puro.</p><p>El juego le pasa los datos a la GPU y le da un programa pequeño llamado <b>shader</b>, que se ejecuta para cada vértice y cada píxel.</p><p><b>Probalo:</b> el gráfico calcula el mismo efecto por píxel con cualquiera de los dos. No es todo el juego, porque esta escena no se puede dibujar por CPU: es un área de prueba con el mismo cálculo escrito en JavaScript y en WGSL. Los milisegundos son reales. Subí la resolución en CPU y mirá cómo se traba todo, también el resto del juego.</p><p><b>Aviso:</b> el tope es 512×512 para que la página no se cuelgue, pero en una PC lenta se va a sentir. Si se traba demasiado, bajá la resolución o volvé a GPU.</p>` },
    { h: 'Cómo se dibuja en 3D: el camino de un triángulo', controls: [{ type: 'range', key: 'res', label: 'Resolución', min: 6, max: 60, step: 1, fmt: (v) => `${v}×${v}` }], body: `<p>Todo lo 3D son triángulos. Para cada uno, la GPU hace tres etapas:</p><ol><li><b>Vertex shader:</b> calcula dónde cae cada vértice en la pantalla.</li><li><b>Rasterizado:</b> decide qué píxeles cubre el triángulo.</li><li><b>Fragment shader:</b> calcula el color de cada uno de esos píxeles.</li></ol><p>La cuadrícula simula una pantalla: cada cuadrado hace de un píxel. En una pantalla real pasa lo mismo, pero con 2 millones de cuadrados.</p><p>Subí la resolución: el triángulo sigue teniendo 3 vértices, pero la cantidad de veces que corre el fragment shader crece con el <b>cuadrado</b>. Duplicar ancho y alto da 4 veces más píxeles. Por eso bajar la resolución es la mejora de rendimiento más potente, y este juego limita el pixel ratio a 1,5.</p>` },
    { h: 'Vertex, rasterizado y fragment: qué hace cada etapa', controls: [{ type: 'select', key: 'stage', label: 'Etapa', options: [['vertex', '1. Vertex shader'], ['raster', '2. Rasterizado'], ['fragment', '3. Fragment shader']] }], body: `<p><b>1. Vertex shader.</b> Cada vértice tiene una posición 3D. Se multiplica por tres matrices: dónde está el objeto (modelo), desde dónde se mira (vista) y cómo se aplasta la perspectiva a la pantalla (proyección). Lo lejano queda más cerca del centro. Corre una vez por vértice.</p><p><b>2. Rasterizado.</b> No lo programás: lo hace la GPU. Recorre los píxeles de la zona del triángulo y prueba si el centro de cada uno cae del lado interno de los tres bordes. Los que pasan siguen adelante.</p><p><b>3. Fragment shader.</b> Corre una vez por cada píxel que pasó. Combina textura, luces y material y devuelve un color. Los datos de los vértices, como la UV, llegan <b>interpolados</b>: es el mismo lerp de la sala 4, entre tres puntos.</p><p>Con más resolución, las etapas 2 y 3 trabajan más. La etapa 1 no cambia, porque la cantidad de vértices es la misma.</p>` },
    { h: 'Qué API usar: WebGL contra WebGPU', body: `<p><b>WebGL</b> es la API gráfica del navegador desde 2011, basada en OpenGL, y solo sirve para dibujar. <b>WebGPU</b> es su reemplazo moderno, basado en cómo funcionan Vulkan, Metal y Direct3D 12.</p><ul><li><b>Compute shaders:</b> usar la GPU para cálculos generales, no solo dibujar.</li><li><b>Menos overhead:</b> el estado se prepara de antemano y cada draw call cuesta menos.</li><li><b>Mejor pipeline asíncrono:</b> compila sin trabar tanto.</li></ul><p>No soluciona todo: un juego mal armado sigue andando mal. Y no todo dispositivo lo soporta, por eso <code>WebGPURenderer</code> tiene <b>fallback</b> automático a WebGL 2.</p><p>En el gráfico está lo que detectó tu navegador.</p><p><b>Probalo:</b> el backend se elige al crear el renderer, así que cambiarlo recarga la página y te devuelve acá. La imagen casi no cambia, y esta escena es tan liviana que a simple vista no vas a notar diferencia. Por eso el botón <b>Medir</b> dibuja 4.000 objetos separados y cronometra cuánto tarda la CPU en prepararlos. Medí con cada uno y compará los resultados, sean los que sean.</p>`, controlsFn: (game) => [{ type: 'button', label: game.renderer.backend.isWebGPUBackend ? 'Cambiar a WebGL 2 (recarga)' : 'Cambiar a WebGPU (recarga)', action: (p, g) => g.switchBackend(g.renderer.backend.isWebGPUBackend) }, { type: 'button', label: 'Medir 4.000 draw calls', action: async (p, g) => { if (p.benching) return; p.benching = true; const ms = await g.benchDrawCalls(4000); p.benching = false; p.bench = { ...p.bench, [g.renderer.backend.isWebGPUBackend ? 'WebGPU' : 'WebGL 2']: ms }; saveBench(p.bench); } }] },
    { h: 'TSL: escribir shaders en JavaScript', controls: [{ type: 'range', key: 'amp', label: 'Amplitud', min: 0, max: .25, step: .005, fmt: (v) => v.toFixed(3), apply: 'tsl' }, { type: 'range', key: 'freq', label: 'Frecuencia', min: 1, max: 30, step: .5, fmt: (v) => v.toFixed(1), apply: 'tsl' }, { type: 'range', key: 'speed', label: 'Velocidad', min: 0, max: 6, step: .1, fmt: (v) => v.toFixed(1), apply: 'tsl' }, { type: 'range', key: 'mixA', label: 'Mezcla de color', min: 0, max: 1, step: .01, fmt: (v) => v.toFixed(2), apply: 'tsl' }], body: `<p>Los shaders se escriben en idiomas especiales: GLSL para WebGL y WGSL para WebGPU. <b>TSL</b> (Three.js Shading Language) te deja describirlos con funciones JS, y Three los compila al idioma que toque.</p><p>La ventaja concreta: <b>el mismo material corre en WebGPU y en el fallback WebGL</b>, sin escribirlo dos veces.</p><p>Los sliders cambian <b>uniforms</b>: variables que la CPU le pasa al shader. Con <kbd>Tab</kbd> alternás entre el panel y las esferas de los pedestales, sin perder los valores. Se deforma en la GPU: la geometría original no cambia.</p>`, code: `const onda = sin(positionLocal.y.mul(freq).add(time));\nmat.positionNode = positionLocal\n  .add(normalLocal.mul(onda.mul(amp)));` },
    { h: 'Post-procesado: los efectos finales sobre la imagen', controls: [{ type: 'toggle', key: 'ao', label: 'GTAO (sombras de contacto)', apply: 'fx' }, { type: 'toggle', key: 'dof', label: 'Profundidad de campo', apply: 'fx' }, { type: 'range', key: 'dofLevel', label: 'Intensidad de la profundidad', min: 0, max: 1.25, step: .01, fmt: (v) => v.toFixed(2).replace('.', ','), apply: 'dofLevel', mark: { at: 1, text: 'En 1,00: a partir de este valor el juego se vuelve un simulador de miopía' } }], body: `<p>Primero se dibuja la escena a una textura, y después se le aplican efectos como si fuera una foto, usando la profundidad y las normales de cada píxel.</p><ul><li><b>GTAO</b> (Ambient Occlusion): oscurece rincones y uniones, que es donde llega menos luz. Le da peso a los objetos.</li><li><b>DOF</b> (Depth of Field): enfoca una distancia y desenfoca lo que está más cerca o más lejos, como una cámara real.</li></ul><p>Encendé y apagá, y mirá la sala con <kbd>Tab</kbd>: el GTAO se nota en las esquinas y al pie de las paredes.</p><p>Acá el DOF enfoca lo que está en la mira, con un seguimiento suave. Probá apuntar cerca y lejos. El parámetro clave es el rango nítido en metros: si es muy chico, todo sale borroso, y eso es lo que pasa al subir el slider.</p>` },
  ],
  demo(g, W, H, x) {
    clear(g, W, H); const { p, step, game } = x;
    if (step === 0) {
      const n = p.n, canGpu = game.renderer.backend.isWebGPUBackend, useGpu = p.proc === 'gpu' && canGpu;
      if (!cpuCanvas) { cpuCanvas = document.createElement('canvas'); cpuCtx = cpuCanvas.getContext('2d', { willReadFrequently: true }); }
      let src;
      if (useGpu) { gpuFx ??= new GpuEffect(game.renderer.backend.device); src = gpuFx.render(n, x.t); p.gpuMs = gpuFx.lastMs; }
      else { if (cpuCanvas.width !== n) cpuCanvas.width = cpuCanvas.height = n; const t0 = performance.now(); cpuEffect(cpuCtx, n, x.t); p.cpuMs = performance.now() - t0; src = cpuCanvas; }
      g.imageSmoothingEnabled = false; g.drawImage(src, 40, 60, 480, 480); g.imageSmoothingEnabled = true; rect(g, 40, 60, 480, 480, null, useGpu ? C.b : C.a);
      text(g, useGpu ? 'Calculado en la GPU' : 'Calculado en la CPU', 40, 44, { size: 22, weight: 700, font: HEAD, color: useGpu ? C.b : C.a });
      mono(g, `${(n * n).toLocaleString('es-AR')} píxeles`, 560, 100, C.fg, 22); text(g, 'Cada uno repite 12 senos y cosenos.', 560, 132, { color: C.dim, size: 18 });
      mono(g, `CPU ${p.cpuMs ? p.cpuMs.toFixed(1) + ' ms' : 'sin medir'}`, 560, 210, C.a, 26); mono(g, `GPU ${p.gpuMs ? p.gpuMs.toFixed(1) + ' ms' : 'sin medir'}`, 560, 256, C.b, 26);
      text(g, 'Última medición de cada modo.', 560, 290, { color: C.dim, size: 16 }); text(g, 'La GPU incluye la espera de la cola de trabajo.', 560, 314, { color: C.dim, size: 16 });
      line(g, 560, 360, 900, 360, C.line, 1); const lim = 16.6; text(g, `Presupuesto de un frame: ${String(lim).replace('.', ',')} ms`, 560, 394, { size: 18 });
      const cur = useGpu ? p.gpuMs : p.cpuMs; text(g, cur > lim ? 'Se pasa: el juego pierde frames.' : 'Entra en el frame.', 560, 426, { size: 20, weight: 700, color: cur > lim ? C.c : C.ok });
      if (p.proc === 'gpu' && !canGpu) text(g, 'Esto necesita el backend WebGPU: se muestra la CPU.', 560, 470, { color: C.y, size: 17 });
      if (!useGpu && n > 256) text(g, 'En CPU el juego se traba: bajá la resolución al terminar.', 560, 500, { color: C.y, size: 16 });
    } else if (step === 1) {
      const N = p.res, S = 420, ox = 60, oy = 70, s = S / N; let count = 0;
      for (let z = 0; z < N; z++) for (let c = 0; c < N; c++) { const u = (c + .5) / N, v = (z + .5) / N, on = inTri(u, v); if (on) count++; rect(g, ox + c * s + .4, oy + z * s + .4, s - .8, s - .8, on ? `hsl(${u * 60 + 190 + Math.sin(x.t) * 20},75%,${35 + v * 30}%)` : '#141d2c'); }
      g.strokeStyle = C.y; g.lineWidth = 3; g.beginPath(); tri.forEach(([a, b], i) => { const X = ox + a * S, Y = oy + b * S; i ? g.lineTo(X, Y) : g.moveTo(X, Y); }); g.closePath(); g.stroke(); tri.forEach(([a, b]) => dot(g, ox + a * S, oy + b * S, 8, C.y));
      text(g, `Pantalla simulada de ${N}×${N}`, 520, 120, { size: 22, weight: 700, font: HEAD }); text(g, `Tiene ${N * N} píxeles: cada cuadrado es uno.`, 520, 154, { color: C.dim, size: 18 }); text(g, `El triángulo cubre ${count}.`, 520, 182, { color: C.dim, size: 18 });
      text(g, 'Vertex shader: corre 3 veces', 520, 262, { color: C.y, size: 21, weight: 700 }); text(g, `Fragment shader: corre ${count} veces`, 520, 304, { color: C.b, size: 21, weight: 700 }); text(g, `Mismo triángulo en Full HD: decenas de miles.`, 520, 360, { color: C.dim, size: 17 }); void 0;
    } else if (step === 2) {
      const ox = 300, oy = 300, Sx = 300;
      if (p.stage === 'vertex') {
        const w = [[-.8, -.5, 1], [.9, -.3, 3], [.1, .8, 1.6]], ph = (Math.sin(x.t) + 1) / 2;
        text(g, 'Posición 3D', 60, 60, { color: C.dim, size: 18 }); text(g, 'Vértice ya en pantalla', 560, 60, { color: C.y, size: 18 });
        const proj = (v, k) => [v[0] / lerp(1, v[2], k), v[1] / lerp(1, v[2], k)];
        g.strokeStyle = C.y; g.lineWidth = 3; g.beginPath(); w.forEach((v, i) => { const [a, b] = proj(v, ph); const X = 480 + a * Sx, Y = oy - b * Sx * .7; i ? g.lineTo(X, Y) : g.moveTo(X, Y); }); g.closePath(); g.stroke();
        w.forEach((v) => { const [a, b] = proj(v, ph); dot(g, 480 + a * Sx, oy - b * Sx * .7, 9, C.y); mono(g, `z=${String(v[2]).replace('.', ',')}`, 480 + a * Sx + 12, oy - b * Sx * .7, C.dim, 16); });
        dot(g, 480, oy, 4, C.dim); mono(g, 'x / z, y / z', 60, 550, C.fg, 22); text(g, 'Dividir por la profundidad es la perspectiva: lo lejano se acerca al centro.', 220, 550, { color: C.dim, size: 18 });
      } else {
        const N = 18, S = 480 / N, o2 = 60; let shown = 0, covered = 0; const reveal = p.stage === 'raster' ? Math.floor((x.t * 60) % (N * N + 60)) : N * N;
        for (let z = 0; z < N; z++) for (let c = 0; c < N; c++) { const i = z * N + c, u = (c + .5) / N, v = (z + .5) / N, on = inTri(u, v), seen = i < reveal; if (on) covered++; if (seen) shown++;
          const col = !seen ? '#101826' : !on ? '#172133' : p.stage === 'raster' ? 'rgba(69,214,196,.55)' : `hsl(${200 + u * 150},75%,${30 + v * 40}%)`; rect(g, o2 + c * S + .5, 40 + z * S + .5, S - 1, S - 1, col);
          if (seen && p.stage === 'raster') dot(g, o2 + (c + .5) * S, 40 + (z + .5) * S, 2, on ? C.fg : C.line); }
        g.strokeStyle = C.y; g.lineWidth = 2; g.beginPath(); tri.forEach(([a, b], i) => { const X = o2 + a * 480, Y = 40 + b * 480; i ? g.lineTo(X, Y) : g.moveTo(X, Y); }); g.closePath(); g.stroke();
        if (p.stage === 'raster') { text(g, '¿El centro del píxel', 580, 150, { size: 21, weight: 700 }); text(g, 'cae adentro de los tres bordes?', 580, 180, { size: 21, weight: 700 }); mono(g, `revisados ${Math.min(shown, N * N)}/${N * N}`, 580, 240, C.y, 20); }
        else { text(g, 'Cada píxel cubierto', 580, 150, { size: 21, weight: 700 }); text(g, 'calcula su color.', 580, 180, { size: 21, weight: 700 }); mono(g, `${covered} ejecuciones`, 580, 240, C.b, 22); text(g, 'El color varía porque recibe', 580, 290, { color: C.dim, size: 17 }); text(g, 'datos interpolados distintos.', 580, 316, { color: C.dim, size: 17 }); }
      }
      void ox;
    } else if (step === 3) {
      const gpu = !!navigator.gpu, active = game.renderer.backend.isWebGPUBackend; text(g, 'Lo que detectó tu navegador', 70, 70, { size: 26, weight: 700, font: HEAD });
      [['navigator.gpu existe', gpu ? 'sí' : 'no', gpu], ['Backend activo', backendName.value, active], ['Pixel ratio', game.renderer.getPixelRatio().toFixed(2), true], ['Triángulos por frame', (game.frameInfo?.triangles || 0).toLocaleString('es-AR'), true], ['Draw calls por frame', String(game.frameInfo?.drawCalls || 0), true]].forEach(([k, v, ok], i) => { text(g, k, 70, 125 + i * 44, { color: C.dim, size: 19 }); mono(g, v, 400, 125 + i * 44, ok ? C.ok : C.y, 20); });
      line(g, 70, 335, 890, 335, C.line, 1); text(g, 'Medición: tiempo de CPU para preparar 4.000 draw calls', 70, 372, { size: 20, weight: 700, font: HEAD });
      const bs = Object.entries(p.bench), max = Math.max(1, ...bs.map(([, v]) => v));
      if (p.benching) mono(g, 'Midiendo...', 70, 420, C.y, 22); else if (!bs.length) text(g, 'Tocá Medir. Después cambiá de backend y medí de nuevo.', 70, 420, { color: C.dim });
      bs.forEach(([k, v], i) => { const y = 400 + i * 62; text(g, k, 70, y + 26, { size: 19 }); rect(g, 190, y, v / max * 520, 38, k === 'WebGPU' ? C.b : C.a); mono(g, `${v.toFixed(1)} ms`, 200 + v / max * 520, y + 27, C.fg, 20); });
    } else if (step === 4) {
      const cx = 480, cy = 300, Rr = 190; g.beginPath(); for (let i = 0; i <= 400; i++) { const a = i / 400 * 6.283, yy = Math.sin(a), wave = Math.sin(yy * p.freq * .6 + x.t * p.speed), r = Rr * (1 + wave * p.amp * 2), X = cx + Math.cos(a) * r, Y = cy + Math.sin(a) * r; i ? g.lineTo(X, Y) : g.moveTo(X, Y); } g.closePath(); g.fillStyle = 'rgba(255,154,60,.18)'; g.fill(); g.strokeStyle = C.a; g.lineWidth = 3; g.stroke(); ring(g, cx, cy, Rr, C.line, 2);
      text(g, 'Perfil: el círculo gris es la geometría original.', 70, 560, { color: C.dim, size: 20 });
    } else {
      [['Escena', C.d, '#color'], ['Profundidad', C.b, '#z'], ['Normales', C.y, '#n'], ['GTAO', p.ao ? C.ok : C.line, ''], ['DOF', p.dof ? C.ok : C.line, ''], ['Pantalla', C.a, '']].forEach(([n, col], i) => { const X = i < 3 ? 70 : i === 3 ? 390 : i === 4 ? 570 : 750, Y = i < 3 ? 110 + i * 130 : 240; rect(g, X, Y, 150, 90, '#141d2c', col); text(g, n, X + 75, Y + 52, { align: 'center', size: 20, color: col }); });
      [[220, 155], [220, 285], [220, 415]].forEach(([a, b]) => arrow(g, a, b, 386, 285, C.line, 2)); arrow(g, 540, 285, 566, 285, C.line, 3); arrow(g, 720, 285, 746, 285, C.line, 3);
      text(g, 'La salida de una etapa es la entrada de la siguiente.', 70, 545, { color: C.dim });
    }
  },
  vocab: ['GPU / CPU', 'vertex y fragment shader', 'rasterizado', 'draw call', 'uniform', 'compute shader', 'TSL', 'post-processing', 'ambient occlusion'],
  prompt: 'Three.js con WebGPURenderer y fallback a WebGL 2. Materiales NodeMaterial con TSL, sin GLSL a mano. RenderPipeline con pass(), MRT de normales, GTAO y DOF. Limitá devicePixelRatio a 1.5 y minimizá draw calls mergeando geometría estática.',
};

// ---------------------------------------------------------------- COMPRESIÓN
const compression = {
  id: 'compression', col: 0, row: 1, color: '#ff7ac6', title: 'Comprimir texturas y modelos', tagline: 'Por qué una imagen liviana igual ocupa mucha memoria, y cómo evitarlo.',
  params: { bits: 14, bitsDemo: 7, measured: null },
  steps: [
    { h: 'Por qué una textura pesa dos veces: descarga y VRAM', body: `<p>Toda textura tiene dos pesos: <b>lo que baja por internet</b> y <b>lo que ocupa en la memoria de video</b> (VRAM).</p><p>PNG y JPG reducen lo primero, pero la GPU no sabe leerlos. Hay que descomprimirlos a píxeles crudos: 4 bytes por píxel (RGBA) sí o sí.</p><p>Las barras son datos reales de este juego. La textura de 705 KB en PNG ocupa 5,6 MB en VRAM con sus mipmaps: el formato del archivo no cambió lo que ocupa adentro.</p>` },
    { h: 'Cómo se achica la memoria de video: compresión por bloques', body: `<p>Las GPU leen directamente formatos especiales como <b>BC7</b> o <b>ASTC</b>. Dividen la imagen en bloques de 4×4 píxeles.</p><p>Por bloque se guardan 2 colores extremos y, para cada píxel, un índice corto que dice en qué punto de la mezcla entre ambos cae.</p><p>La GPU puede decodificar <b>cualquier bloque al instante</b>, sin leer los demás. Eso permite leer la textura desde la VRAM comprimida.</p><p>Es compresión <b>con pérdida</b>: mirá el bloque de la derecha, muy parecido pero no idéntico. Pasa a pesar 1 byte por píxel en vez de 4.</p>` },
    { h: 'Un archivo para todas las GPU: KTX2 y Basis Universal', body: `<p>Problema: cada GPU acepta formatos distintos. Las de PC usan BC, los celulares ASTC o ETC.</p><p><b>Basis Universal</b> es un formato intermedio que se <b>transcodifica</b> en el dispositivo al formato que esa GPU entienda. Un solo archivo sirve para todos. <b>KTX2</b> es el contenedor.</p><p>El piso de todas estas salas es <code>floor.ktx2</code>: pasó por ese proceso al cargar. La transcodificación corre en Web Workers para no trabar la pantalla.</p><p>Comparado con PNG: pesa 80% menos al bajar y 75% menos en VRAM.</p>`, code: `const ktx2 = new KTX2Loader()\n  .setTranscoderPath('/basis/')\n  .detectSupport(renderer);` },
    { h: 'Meshopt: cómo se comprime la geometría', controls: [{ type: 'range', key: 'bitsDemo', label: 'Bits por coordenada', min: 2, max: 16, step: 1, fmt: (v) => `${v} bits`, apply: 'quant' }], body: `<p>Un vértice guarda posición, normal y UV en números de 32 bits, con mucha más precisión de la necesaria.</p><p><b>Cuantizar</b> es redondear a una grilla de pocos niveles. Con 14 bits, un objeto de 2 metros tiene precisión de 0,1 mm. Nadie lo nota.</p><p>Mové el slider y tocá <kbd>Tab</kbd> para ver los dos robots de la balanza: el de la derecha aplica ese redondeo en vivo con un shader. Por debajo de 8 bits se ven los escalones.</p><p>Después, <b>meshopt</b> reordena los vértices y comprime los bytes, y decodificar eso es rapidísimo.</p>` },
    { h: 'Cuánto se ahorró: el resultado real', controls: [{ type: 'button', label: 'Medir carga en esta máquina', action: async (p, game) => { const m = {}; const png = performance.now(); const b = await fetch('/assets/panel.png?' + Date.now()).then((r) => r.blob()); const bmp = await createImageBitmap(b); m.png = performance.now() - png; bmp.close(); const k = performance.now(); const t = await game.ktx2.loadAsync('/assets/panel.ktx2?' + Date.now()); m.ktx2 = performance.now() - k; t.dispose(); p.measured = m; } }], body: `<p>Hay dos archivos en juego. El <b>robot</b> es un <code>.glb</code> que trae adentro su geometría y su textura. La textura se llama <code>panel</code>. Por eso, en el gráfico, la textura ya está <b>incluida</b> en la barra del robot.</p><p>Con menos peso gana la carga, pero también la memoria: menos VRAM significa que entra en celulares y notebooks sin crashear.</p><p>Este modelo es adrede un caso exigente: 95 mil vértices sin soldar. En un asset real, con vértices compartidos, meshopt rinde todavía más.</p>` },
  ],
  demo(g, W, H, x) {
    clear(g, W, H); const { p, step, game } = x, s = game.stats;
    const bars = (rows, max, ox, oy, h = 54) => rows.forEach(([n, v, col], i) => { const y = oy + i * (h + 42); text(g, n, ox, y, { size: 20 }); rect(g, ox, y + 10, Math.max(3, v / max * 760), h, col); mono(g, kb(v), ox + Math.max(3, v / max * 760) + 12, y + 46, C.fg, 20); });
    if (step === 0) { text(g, 'Una textura de 1024×1024', 70, 70, { size: 26, weight: 700, font: HEAD }); bars([['Archivo PNG (lo que baja)', s.texture.png, C.b], ['Archivo JPG calidad 85', s.texture.jpg, C.b], ['En VRAM, descomprimida con mipmaps', s.texture.vramRgba, C.c]], s.texture.vramRgba * 1.15, 70, 120, 58); }
    else if (step === 1) {
      const cell = 62, A = [255, 154, 60], B = [40, 90, 150], ox = 70, oy = 110; const px = []; for (let z = 0; z < 4; z++) for (let c = 0; c < 4; c++) px.push(.5 + .5 * Math.sin((c + z * .7) * .9 + 1) + (((c * 7 + z * 13) % 5) - 2) * .03);
      const mix = (t) => A.map((v, i) => Math.round(lerp(B[i], v, clamp(t, 0, 1))));
      text(g, 'Original', ox, 90, { color: C.dim }); text(g, 'Índices (0 a 3)', 340, 90, { color: C.dim }); text(g, 'Reconstruido', 640, 90, { color: C.dim });
      px.forEach((t, i) => { const c = i % 4, z = Math.floor(i / 4), v = mix(t), q = Math.round(clamp(t, 0, 1) * 3), r = mix(q / 3); rect(g, ox + c * cell, oy + z * cell, cell - 2, cell - 2, `rgb(${v})`); rect(g, 340 + c * cell, oy + z * cell, cell - 2, cell - 2, '#141d2c', C.line); mono(g, String(q), 340 + c * cell + 30, oy + z * cell + 40, C.y, 24, 'center'); rect(g, 640 + c * cell, oy + z * cell, cell - 2, cell - 2, `rgb(${r})`); });
      for (let i = 0; i < 4; i++) rect(g, 340 + i * 62, 400, 60, 40, `rgb(${mix(i / 3)})`); text(g, 'Paleta del bloque: dos extremos y dos mezclas', 340, 472, { color: C.dim, size: 19 }); mono(g, '16 px × 4 bytes = 64 → 16 bytes', 70, 545, C.ok, 26);
    } else if (step === 2) {
      const n = [['floor.ktx2', 70, C.y], ['Dispositivo', 340, C.line]]; rect(g, 70, 240, 200, 110, '#141d2c', C.y); text(g, 'floor.ktx2', 170, 300, { align: 'center', font: '"JetBrains Mono"', size: 22, color: C.y }); void n;
      [['PC: BC7', C.b, 100], ['Android: ASTC / ETC2', C.a, 245], ['iPhone: ASTC', C.d, 390]].forEach(([l, col, y]) => { rect(g, 560, y, 320, 90, '#141d2c', col); text(g, l, 720, y + 54, { align: 'center', color: col, size: 22 }); arrow(g, 276, 295, 554, y + 45, C.line, 2); });
      text(g, 'transcodificar', 340, 250, { color: C.dim, size: 18 }); mono(g, `carga real: ${game.metrics.ktx2Load?.toFixed(0)} ms`, 70, 540, C.ok, 24);
    } else if (step === 3) {
      const lv = 2 ** p.bitsDemo, ox = 70, oy = 90, S = 440; const q = (v) => Math.round(v * (lv - 1)) / (lv - 1);
      if (lv <= 64) for (let i = 0; i <= Math.min(lv - 1, 64); i++) { const f = i / (lv - 1); line(g, ox + f * S, oy, ox + f * S, oy + S, C.grid, 1); line(g, ox, oy + f * S, ox + S, oy + f * S, C.grid, 1); }
      g.strokeStyle = C.b; g.lineWidth = 3; g.beginPath(); for (let i = 0; i <= 120; i++) { const a = i / 120 * 6.283, r = .36 + .08 * Math.sin(a * 5), X = q(.5 + Math.cos(a) * r), Y = q(.5 + Math.sin(a) * r); i ? g.lineTo(ox + X * S, oy + Y * S) : g.moveTo(ox + X * S, oy + Y * S); } g.closePath(); g.stroke();
      const prec = 2000 / lv; mono(g, `${p.bitsDemo} bits = ${lv.toLocaleString('es-AR')} niveles`, 550, 170, C.y, 22); mono(g, `Precisión en 2 m: ${prec >= 1 ? prec.toFixed(1) : prec.toFixed(2)} mm`, 550, 215, C.fg, 20);
      mono(g, `32 bits → ${p.bitsDemo} bits`, 550, 280, C.ok, 22); text(g, `Ahorro antes de comprimir: ${Math.round((1 - p.bitsDemo / 32) * 100)}%`, 550, 318, { color: C.dim, size: 19 });
    } else {
      text(g, 'Archivo del robot (.glb): de qué está hecho', 70, 62, { size: 25, weight: 700, font: HEAD });
      const gr = s.model.rawGlb - s.texture.png, go = s.model.optGlb - s.texture.ktx2, sc = 700 / s.model.rawGlb;
      [['Original', gr, s.texture.png, s.model.rawGlb, 92], ['Comprimido', go, s.texture.ktx2, s.model.optGlb, 222]].forEach(([n, a, b, t, y]) => { text(g, n, 70, y + 16, { size: 20, weight: 600 }); mono(g, kb(t), 240, y + 16, C.fg, 20); rect(g, 70, y + 28, a * sc, 54, C.d); rect(g, 70 + a * sc, y + 28, b * sc, 54, C.y); text(g, `geometría ${kb(a)}`, 70, y + 106, { size: 16, color: C.d }); text(g, `textura ${kb(b)}`, 290, y + 106, { size: 16, color: C.y }); });
      line(g, 70, 366, 890, 366, C.line, 1); text(g, 'La textura panel sola, la que usa el robot', 70, 402, { size: 21, weight: 700, font: HEAD });
      bars([['PNG', s.texture.png, C.c], ['KTX2', s.texture.ktx2, C.ok]], s.texture.png * 1.2, 70, 436, 30);
      if (p.measured) mono(g, `Medido acá: PNG ${p.measured.png.toFixed(0)} ms, KTX2 ${p.measured.ktx2.toFixed(0)} ms`, 70, 590, C.y, 18);
    }
  },
  vocab: ['VRAM', 'mipmaps', 'block compression (BC7, ASTC)', 'KTX2', 'Basis Universal', 'transcodificar', 'cuantización', 'meshopt', 'glTF'],
  prompt: 'Pipeline de assets: texturas a KTX2 (Basis Universal) con mipmaps y modelos glTF cuantizados y comprimidos con meshopt. Cargá con KTX2Loader + GLTFLoader.setMeshoptDecoder, con el transcoder corriendo en workers. Medí el peso en VRAM, no solo el de descarga.',
};

export const part2 = [collision, astarLesson, webgpu, compression];
void ring; void arrow; void line;
