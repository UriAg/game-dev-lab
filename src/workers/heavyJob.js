// Un cálculo inútil pero real: llena un buffer con matemática pesada durante `ms` milisegundos.
export function heavyJob(ms) {
  const out = new Float32Array(1 << 18), end = performance.now() + ms;
  let i = 0;
  while (performance.now() < end) {
    for (let n = 0; n < 5000; n++, i++) out[i & 262143] = Math.sqrt(Math.abs(Math.sin(i) * Math.cos(i * .5)));
  }
  return out;
}
