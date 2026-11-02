import { C, clear, text, mono, arrow, rect, lerp, clamp, HEAD } from './draw.js';
import { input, yaw, smoothing } from './movement.js';
import { uiStats } from '../game/state.js';

// ---------------------------------------------------------------- STACK
const stack = {
  id: 'stack', col: 0, row: 0, color: '#ff9a3c', title: 'El stack web', tagline: 'Astro, Preact + signals y Three.js: quién hace qué y por qué.',
  params: { mode: 'signal', flash: 0, count: 0, lastFlash: 0, wire: false, shownStep: -1, stepT: 0 },
  steps: [
    { h: 'Tres trabajos, tres herramientas', body: `<p>Un juego web tiene dos mundos que casi no se tocan:</p><ul><li><b>El mundo 3D:</b> se dibuja en un solo <code>&lt;canvas&gt;</code>, 60 veces por segundo.</li><li><b>La interfaz:</b> los menús, las pantallas y los textos, hechos con HTML común.</li></ul><p><b>Astro</b> prepara la página antes de que llegue a tu navegador: el HTML, los estilos, las fuentes y qué JavaScript cargar. <b>Preact</b> dibuja la interfaz y <b>Three.js</b> dibuja el mundo. Estás adentro de ese mismo stack ahora: este panel es Preact, la sala es Three.js y la página la generó Astro.</p>`, },
    { h: 'Astro: armar la página y cargar solo el JavaScript necesario', body: `<p>Astro genera HTML en el servidor o al compilar, y por defecto manda <b>cero JavaScript</b>. Las partes interactivas son <b>islas</b>: componentes aislados que se cargan solos, cada uno en su archivo.</p><p>Imaginá un juego con una pantalla de Ajustes y otra de Ranking: cada una puede ser su propio archivo, llamado <b>chunk</b>. Si nunca abrís el Ranking, nunca bajás su código. Eso se llama <b>code splitting</b>.</p><p>Fijate en el gráfico: lo naranja es lo único que manda JavaScript al navegador.</p>` },
    { h: 'Preact: dibujar la interfaz con muy poco peso', body: `<p>Preact tiene casi la misma API que React, pero pesa unos <b>4 KB</b>, mientras que React y ReactDOM (comprimidos) pesan unos 45 KB.</p><p>Por qué conviene en este caso: la interfaz no necesita el ecosistema completo de React, como por ejemplo React Router para navegar entre páginas, Redux para manejar el estado global o Material UI para tener componentes ya armados. Reducir cada KB posible significa menos tiempo de carga para los procesos más importantes.</p>` },
    { h: 'Signals: cambiar un dato sin redibujar toda la interfaz', controls: [{ type: 'select', key: 'mode', label: 'Modelo de actualización', options: [['signal', 'Signal'], ['vdom', 'Estado clásico (useState en la raíz)']] }, { type: 'button', label: 'Cambiar un valor (+1)', action: (p) => { p.count++; p.flash = 1; } }], body: `<p>Con el estado clásico, un cambio en un elemento padre vuelve a ejecutar los componentes hijos para ver qué cambió (eso es el <b>Virtual DOM</b>).</p><p>Un <b>signal</b> es una cajita con un valor que recuerda quién lo está leyendo. Al cambiar, avisa solo a esos lectores: el resto no se toca.</p><p>Tocá el botón con los dos modelos. Cada cuadrito es un componente, y se ilumina si tuvo que ejecutarse.</p>`, code: `const fps = signal(60);\n// en el loop del juego, afuera de Preact:\nfps.value = medirFps();\n// en la UI: solo este texto se actualiza\n<span>{fps}</span>` },
    { h: 'Three.js: dibujar el mundo 3D sin programar la placa de video', controls: [{ type: 'toggle', key: 'wire', label: 'Ver solo la geometría (sin material)' }], body: `<p>El navegador trae dos APIs para dibujar en 3D: WebGL y WebGPU. Son de muy bajo nivel: hay que preparar a mano cada dato que recibe la placa de video, y dibujar un solo cubo lleva cientos de líneas.</p><p><b>Three.js</b> es una librería que hace ese trabajo por vos. Describís qué hay en el mundo, y ella se encarga de dibujarlo.</p><p>Todo proyecto con Three.js tiene tres piezas:</p><ul><li><b>Escena:</b> lo que existe en el mundo, como objetos y luces.</li><li><b>Cámara:</b> desde dónde se mira.</li><li><b>Renderer:</b> el que convierte la escena y la cámara en una imagen sobre el <code>&lt;canvas&gt;</code>.</li></ul><p>Cada objeto visible es un <b>mesh</b>, que une una <b>geometría</b> (la forma) y un <b>material</b> (cómo se ve). Apagá el material con el toggle de abajo del código y mirá el cubo del gráfico.</p><p>El renderer vuelve a dibujar todo en cada frame. Las salas, el logo de Claude y las luces que ves acá están hechos así.</p>`, code: `const scene = new THREE.Scene();\nconst camera = new THREE.PerspectiveCamera(60, ancho / alto);\ncamera.position.z = 3;\n\nconst cubo = new THREE.Mesh(\n  new THREE.BoxGeometry(),    // la forma\n  new THREE.MeshBasicMaterial() // cómo se ve\n);\nscene.add(cubo);\n\nconst renderer = new THREE.WebGPURenderer({ canvas });\nrenderer.setAnimationLoop((ms) => {\n  cubo.rotation.y = ms / 1000;\n  renderer.render(scene, camera);\n});` },
    { h: 'Prueba en vivo: el contador de FPS de este juego', body: `<p>El contador de FPS del HUD es un signal, y el loop de Three.js le escribe aunque no sabe nada de Preact.</p><p>En el gráfico tenés los contadores reales de esta sesión: cuántas veces se actualizó el signal contra cuántas veces se re-renderizó el componente raíz.</p><p>Este es el motivo técnico fuerte: <b>un game loop puede empujar datos a la UI 60 veces por segundo sin hacerla re-renderizar</b>. En el código se ve como <code>algo.value</code> para leer o escribir, y <code>algo.peek()</code> para leer sin suscribirse.</p>` },
  ],
  demo(g, W, H, x) {
    clear(g, W, H); const { p, step } = x;
    if (p.shownStep !== step) { p.shownStep = step; p.stepT = 0; } p.stepT += x.dt;
    if (step === 0) {
      const b = [[70, 'NAVEGADOR', 820, 90, C.line], [190, 'Preact: menús y paneles', 390, 300, C.b], [190, 'Three.js: el <canvas> 3D', 390, 300, C.d]];
      rect(g, 70, 90, 820, 400, 'rgba(255,154,60,.06)', C.a); text(g, 'Página generada por Astro (HTML)', 92, 130, { color: C.a, weight: 700, size: 24, font: HEAD });
      rect(g, 92, 160, 370, 300, 'rgba(69,214,196,.1)', C.b); text(g, 'Preact + signals', 116, 205, { color: C.b, weight: 700, size: 26, font: HEAD }); text(g, 'Interfaz: menús, apps, HUD', 116, 240, { color: C.dim });
      rect(g, 498, 160, 370, 300, 'rgba(164,147,255,.1)', C.d); text(g, 'Three.js', 522, 205, { color: C.d, weight: 700, size: 26, font: HEAD }); text(g, 'Un solo canvas, 60 veces por segundo', 522, 240, { color: C.dim });
      const a = (x.t * 1.5) % 1; arrow(g, 680, 340, lerp(680, 280, a) , 340, C.y); text(g, 'signals: el puente de datos', 345, 325, { color: C.y, size: 19 });
      void b;
    } else if (step === 1) {
      rect(g, 60, 70, 840, 460, '#131c2b', C.line); text(g, 'Una página con islas', 84, 112, { size: 24, weight: 700, font: HEAD });
      for (let i = 0; i < 6; i++) rect(g, 84, 140 + i * 58, 360, 40, '#1b2638'); text(g, 'HTML estático: 0 KB de JS', 104, 166, { color: C.dim, size: 18 });
      const isl = [[480, 140, 'Island: Ajustes', 'carga al abrir'], [480, 280, 'Island: Ranking', 'carga al abrir'], [690, 140, 'Island: Juego 3D', 'cliente solamente']];
      isl.forEach(([ix, iy, n, m], i) => { const pulse = .15 + .1 * Math.sin(x.t * 2 + i); rect(g, ix, iy, 190, 120, `rgba(255,154,60,${pulse})`, C.a); text(g, n, ix + 12, iy + 40, { size: 18, color: C.fg, weight: 600 }); text(g, m, ix + 12, iy + 72, { size: 16, color: C.dim }); });
      text(g, 'Solo lo naranja manda JavaScript', 480, 470, { color: C.a, weight: 700, size: 22 });
    } else if (step === 2) {
      const rows = [['React + ReactDOM', 45, C.c], ['Preact', 4, C.b], ['@preact/signals', 3, C.y]];
      text(g, 'Peso aproximado, comprimido con gzip', 70, 90, { size: 24, weight: 700, font: HEAD });
      rows.forEach(([n, v, col], i) => { const y = 140 + i * 110, w = lerp(0, v * 15, clamp(p.stepT * 1.5, 0, 1)); text(g, n, 70, y, { size: 22 }); rect(g, 70, y + 18, w, 44, col); mono(g, `~${v} KB`, 84 + v * 15, y + 50, C.fg, 22); });
    } else if (step === 3) {
      p.flash *= Math.exp(-x.dt * 3.5);
      const n = 48, cols = 8, s = 62, ox = 100, oy = 90;
      for (let i = 0; i < n; i++) { const c = i % cols, r = Math.floor(i / cols), target = i === 20, lit = p.mode === 'vdom' || target; rect(g, ox + c * (s + 34), oy + r * (s + 18), s + 26, s, lit && p.flash > .03 ? `rgba(255,154,60,${p.flash})` : '#172133', target ? C.b : C.line); if (target) mono(g, String(p.count), ox + c * (s + 34) + 44, oy + r * (s + 18) + 39, C.fg, 22, 'center'); }
      text(g, p.mode === 'vdom' ? `Se ejecutan ${n} componentes por un valor` : 'Se actualiza 1 solo nodo', 100, 555, { color: p.mode === 'vdom' ? C.c : C.ok, weight: 700, size: 26, font: HEAD });
    } else if (step === 4) {
      const a = x.t * .8, ca = Math.cos(a), sa = Math.sin(a), cb = Math.cos(.5), sb = Math.sin(.5), turn = ([vx, vy, vz]) => { const X = vx * ca + vz * sa, Z = -vx * sa + vz * ca; return [X, vy * cb - Z * sb, vy * sb + Z * cb]; };
      const proj = ([X, Y, Z]) => { const k = 105 * 5 / (5 - Z); return [270 + X * k, 300 - Y * k]; };
      const faces = [[[1, 0, 0], [[1, -1, -1], [1, 1, -1], [1, 1, 1], [1, -1, 1]]], [[-1, 0, 0], [[-1, -1, 1], [-1, 1, 1], [-1, 1, -1], [-1, -1, -1]]], [[0, 1, 0], [[-1, 1, -1], [-1, 1, 1], [1, 1, 1], [1, 1, -1]]], [[0, -1, 0], [[-1, -1, 1], [-1, -1, -1], [1, -1, -1], [1, -1, 1]]], [[0, 0, 1], [[-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1]]], [[0, 0, -1], [[1, -1, -1], [-1, -1, -1], [-1, 1, -1], [1, 1, -1]]]];
      text(g, 'Mesh = geometría + material', 70, 70, { size: 26, weight: 700, font: HEAD });
      for (const [n, vs] of faces) {
        const nz = turn(n)[2]; if (!p.wire && nz <= 0) continue;
        g.beginPath(); vs.map((v) => proj(turn(v))).forEach(([X, Y], i) => (i ? g.lineTo(X, Y) : g.moveTo(X, Y))); g.closePath();
        if (!p.wire) { g.fillStyle = `rgba(69,214,196,${.2 + .75 * nz})`; g.fill(); }
        g.strokeStyle = p.wire ? C.b : '#0d1420'; g.lineWidth = 2; g.stroke();
      }
      text(g, p.wire ? 'Solo geometría: la forma, sin nada que la pinte' : 'Geometría + material: la forma y cómo se ve', 70, 530, { color: p.wire ? C.y : C.ok, size: 20, weight: 600 });
      [['Escena', 'qué hay en el mundo', 80, C.line], ['Cámara', 'desde dónde se mira', 195, C.line], ['Renderer', 'las convierte en una imagen', 335, C.a]].forEach(([n, d, y, col]) => { rect(g, 570, y, 330, 90, '#172133', col); text(g, n, 592, y + 38, { size: 24, weight: 700, font: HEAD }); text(g, d, 592, y + 68, { color: C.dim, size: 18 }); });
      arrow(g, 735, 290, 735, 330, C.y); arrow(g, 735, 430, 735, 472, C.y); text(g, 'Dibujo en el <canvas>', 735, 505, { align: 'center', color: C.fg, size: 20, weight: 600 });
    } else {
      text(g, 'Contadores reales de esta sesión', 70, 100, { size: 28, weight: 700, font: HEAD });
      mono(g, String(uiStats.signalUpdates), 70, 240, C.b, 96); text(g, 'escrituras del loop al signal de FPS', 70, 280, { color: C.dim });
      mono(g, String(uiStats.appRenders), 70, 430, C.a, 96); text(g, 'renders del componente raíz', 70, 470, { color: C.dim });
    }
  },
  vocab: ['islands architecture', 'partial hydration', 'code splitting', 'Virtual DOM', 'fine-grained reactivity', 'signals', 'escena, cámara y renderer', 'mesh', 'geometría y material'],
  prompt: 'Sitio con Astro y una isla Preact con client:only para el juego. Estado compartido con @preact/signals para que el game loop actualice el HUD sin re-renderizar el árbol. Cada panel pesado va en un import() dinámico.',
};

export const part1 = [stack, input, yaw, smoothing];
