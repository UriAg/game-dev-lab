# Laboratorio de juegos web

Juego educativo en primera persona que corre en el navegador. Son doce salas que explican cómo se hace un juego 3D para la web, y cada técnica que enseña está funcionando en el mismo juego: la grilla de colisión que ves pintada en el piso es la que te frena, y el cuadro que muestra la sala 1 es el que tu placa de video acaba de dibujar.

Nació de analizar [The Last Deploy](https://halloween.dev), el juego de [midudev](https://midu.dev). Este proyecto es independiente y no está afiliado a ese juego ni a su autor.

## Qué se aprende

| Sala | Tema | Técnica |
|---|---|---|
| 1 | El stack web | Astro, islas, Preact, signals y Three.js |
| 2 | Cámara y controles | Pointer Lock, teclado por `event.code`, gamepad |
| 3 | Caminar hacia donde mirás | Yaw, seno y coseno, vector de movimiento |
| 4 | Movimiento suave | Suavizado exponencial independiente de los FPS |
| 5 | Colisiones | Grilla de ocupación, AABB inflados, deslizamiento por ejes |
| 6 | Encontrar caminos | A* sobre la misma grilla, en vivo |
| 7 | Dibujar con la GPU | WebGPU, TSL, etapas vertex, rasterizado y fragment |
| 8 | Comprimir texturas y modelos | KTX2, Basis Universal, meshopt |
| 9 | Tareas en segundo plano | Web Workers y presupuesto de 16,6 ms por frame |
| 10 | Audio espacial | Web Audio, HRTF, atenuación y reverberación |
| 11 | Por qué se siente bien | Game feel: pasos, head bob y camera roll |
| 12 | Cómo pedírselo a una IA | Vocabulario técnico convertido en un prompt |

## Stack

- **[Astro](https://astro.build) 7:** genera la página y carga una sola isla, el juego.
- **[Preact](https://preactjs.com) y [@preact/signals](https://preactjs.com/guide/v10/signals/):** menús, HUD y paneles de lección.
- **[Three.js](https://threejs.org) 0.187:** `WebGPURenderer` con materiales TSL, y fallback automático a WebGL 2.
- **Assets:** glTF con meshopt y texturas KTX2, generados con gltf-transform, ktx2-encoder y sharp.
- **[Vercel Analytics](https://vercel.com/docs/analytics):** visitas, solo en el sitio publicado.

## Cómo ejecutarlo

Necesitás Node 22 o superior.

```bash
npm install
npm run dev
```

Abrí <http://localhost:4330>. Para probar el backend de respaldo, agregá `?backend=webgl` a la dirección.

| Comando | Qué hace |
|---|---|
| `npm run dev` | Servidor de desarrollo en el puerto 4330 |
| `npm run build` | Compila el sitio estático en `dist/` |
| `npm run preview` | Sirve la compilación en el puerto 4330 |

Funciona mejor en Chrome o Edge, que tienen WebGPU; los demás navegadores usan WebGL 2. Por ahora se juega con teclado y mouse, o con gamepad. No tiene controles táctiles.

## Estructura

```text
src/
  pages/index.astro     Página única: monta la isla del juego
  components/           Interfaz en Preact (App.jsx) y estilos (game.css)
  game/
    Game.js             Bucle principal, render, cámara, estados e interacción
    world.js            Construcción de las salas y sus piezas interactivas
    grid.js             Grilla de colisión y A*
    input.js            Teclado, mouse y gamepad
    audio.js            Web Audio
    state.js            Signals compartidos entre el juego y la interfaz
  lessons/              Contenido y demos de cada sala
scripts/                Preparación de modelos y texturas
public/assets/          Modelos y texturas ya optimizados
public/basis/           Transcodificador de KTX2
```

## Decisiones técnicas

- **Sin motor de físicas:** el piso es plano, así que alcanza con una grilla de celdas de 20 cm. La misma grilla resuelve las colisiones y el pathfinding.
- **Solo se ilumina la sala actual:** las luces se mueven al cambiar de sala, y las salas fuera de la fila y la columna actuales no se dibujan.
- **Cada sala tiene su propio reloj:** al salir se congela, y al volver retoma desde el mismo punto.
- **La interfaz no se redibuja por frame:** el bucle escribe en signals y solo se actualiza lo que los usa.
- **La sala 8 muestra pesos reales:** el modelo original se baja recién al entrar a esa sala, y los datos del gráfico salen de `public/assets/stats.json`.

## Preparar assets

Los assets ya están en el repositorio, así que no hace falta generarlos para ejecutar el proyecto.

```bash
node scripts/build-model.mjs entrada.glb salida.glb 8000
node scripts/build-floor.mjs color.jpg normal.jpg rough.jpg
```

`build-model.mjs` simplifica la malla hasta el límite de triángulos, reduce las texturas a 512 px en KTX2 y comprime la geometría con meshopt.

`npm run assets` regenera el robot y la textura de ejemplo, y reescribe `stats.json`. Hoy la sala 8 usa datos de otro modelo, así que no lo corras sin volver a actualizar ese archivo.

## Créditos y licencias

Los modelos y las texturas son de terceros. Sus autores y licencias están en [CREDITOS.md](CREDITOS.md). Algunos tienen licencia no comercial, y por eso el sitio no puede usarse con fines comerciales tal como está.
