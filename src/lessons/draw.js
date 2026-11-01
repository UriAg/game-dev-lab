export const C = { bg: '#0d1420', grid: '#1e2a3e', line: '#33445f', fg: '#eef3fa', dim: '#93a6be', a: '#ff9a3c', b: '#45d6c4', c: '#ff5d73', d: '#a493ff', y: '#ffd34d', ok: '#7ee081' };
export const MONO = '"JetBrains Mono", monospace', SANS = '"IBM Plex Sans", sans-serif', HEAD = '"Chakra Petch", sans-serif';
export function clear(g, W, H, grid = true) {
  g.fillStyle = C.bg; g.fillRect(0, 0, W, H); if (!grid) return; g.strokeStyle = C.grid; g.lineWidth = 1;
  for (let x = 0; x <= W; x += 40) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, H); g.stroke(); }
  for (let y = 0; y <= H; y += 40) { g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke(); }
}
export function text(g, s, x, y, o = {}) {
  g.fillStyle = o.color ?? C.fg; g.font = `${o.weight ?? 400} ${o.size ?? 20}px ${o.font ?? SANS}`; g.textAlign = o.align ?? 'left'; g.textBaseline = o.base ?? 'alphabetic'; g.fillText(s, x, y); g.textAlign = 'left'; g.textBaseline = 'alphabetic';
}
export const mono = (g, s, x, y, color = C.fg, size = 20, align) => text(g, s, x, y, { font: MONO, color, size, align });
export function line(g, x0, y0, x1, y1, color = C.line, w = 2, dash) { g.strokeStyle = color; g.lineWidth = w; g.setLineDash(dash ?? []); g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke(); g.setLineDash([]); }
export function arrow(g, x0, y0, x1, y1, color = C.a, w = 4) {
  const a = Math.atan2(y1 - y0, x1 - x0), L = Math.hypot(x1 - x0, y1 - y0); if (L < 2) return;
  const h = Math.min(16, L * .5); line(g, x0, y0, x1 - Math.cos(a) * h * .7, y1 - Math.sin(a) * h * .7, color, w);
  g.fillStyle = color; g.beginPath(); g.moveTo(x1, y1); g.lineTo(x1 - h * Math.cos(a - .45), y1 - h * Math.sin(a - .45)); g.lineTo(x1 - h * Math.cos(a + .45), y1 - h * Math.sin(a + .45)); g.fill();
}
export function dot(g, x, y, r = 6, color = C.a) { g.fillStyle = color; g.beginPath(); g.arc(x, y, r, 0, 7); g.fill(); }
export function ring(g, x, y, r, color = C.line, w = 2) { g.strokeStyle = color; g.lineWidth = w; g.beginPath(); g.arc(x, y, r, 0, 7); g.stroke(); }
export function rect(g, x, y, w, h, fill, stroke) { if (fill) { g.fillStyle = fill; g.fillRect(x, y, w, h); } if (stroke) { g.strokeStyle = stroke; g.lineWidth = 2; g.strokeRect(x, y, w, h); } }
export const lerp = (a, b, t) => a + (b - a) * t;
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const kb = (n) => n >= 1e6 ? `${(n / 1e6).toFixed(2).replace('.', ',')} MB` : `${Math.round(n / 1000)} KB`;
