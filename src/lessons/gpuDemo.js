// El mismo efecto por píxel, escrito dos veces: JavaScript en CPU y WGSL en GPU.
const ITER = 12;

export function cpuEffect(ctx, n, time) {
  const img = ctx.createImageData(n, n), d = img.data;
  for (let y = 0, i = 0; y < n; y++) for (let x = 0; x < n; x++, i += 4) {
    const u = x / n * 6, v = y / n * 6; let a = 0;
    for (let k = 1; k <= ITER; k++) a += Math.sin(u * k * .7 + time) * Math.cos(v * k * .5 - time * .7) / k;
    d[i] = 128 + 127 * Math.sin(a * 3); d[i + 1] = 128 + 127 * Math.sin(a * 3 + 2); d[i + 2] = 128 + 127 * Math.sin(a * 3 + 4); d[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
}

const WGSL = `
struct U { time: f32 }
@group(0) @binding(0) var<uniform> u: U;
@vertex fn vs(@builtin(vertex_index) i: u32) -> @builtin(position) vec4f {
  var p = array<vec2f, 3>(vec2f(-1, -1), vec2f(3, -1), vec2f(-1, 3));
  return vec4f(p[i], 0, 1);
}
@group(0) @binding(1) var<uniform> size: f32;
@fragment fn fs(@builtin(position) pos: vec4f) -> @location(0) vec4f {
  let c = pos.xy / size * 6.0;
  var a = 0.0;
  for (var k = 1.0; k <= ${ITER}.0; k += 1.0) {
    a += sin(c.x * k * 0.7 + u.time) * cos(c.y * k * 0.5 - u.time * 0.7) / k;
  }
  return vec4f(0.5 + 0.5 * sin(a * 3.0), 0.5 + 0.5 * sin(a * 3.0 + 2.0), 0.5 + 0.5 * sin(a * 3.0 + 4.0), 1.0);
}`;

export class GpuEffect {
  constructor(device) {
    this.device = device;
    this.canvas = new OffscreenCanvas(256, 256);
    this.ctx = this.canvas.getContext('webgpu');
    this.format = navigator.gpu.getPreferredCanvasFormat();
    this.ctx.configure({ device, format: this.format, alphaMode: 'opaque' });
    const module = device.createShaderModule({ code: WGSL });
    this.pipeline = device.createRenderPipeline({ layout: 'auto', vertex: { module, entryPoint: 'vs' }, fragment: { module, entryPoint: 'fs', targets: [{ format: this.format }] } });
    this.timeBuf = device.createBuffer({ size: 16, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
    this.sizeBuf = device.createBuffer({ size: 16, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
    this.bind = device.createBindGroup({ layout: this.pipeline.getBindGroupLayout(0), entries: [{ binding: 0, resource: { buffer: this.timeBuf } }, { binding: 1, resource: { buffer: this.sizeBuf } }] });
    this.pending = false; this.lastMs = 0;
  }
  render(n, time) {
    if (this.canvas.width !== n) { this.canvas.width = this.canvas.height = n; }
    const q = this.device.queue;
    q.writeBuffer(this.timeBuf, 0, new Float32Array([time])); q.writeBuffer(this.sizeBuf, 0, new Float32Array([n]));
    const enc = this.device.createCommandEncoder();
    const pass = enc.beginRenderPass({ colorAttachments: [{ view: this.ctx.getCurrentTexture().createView(), loadOp: 'clear', storeOp: 'store', clearValue: [0, 0, 0, 1] }] });
    pass.setPipeline(this.pipeline); pass.setBindGroup(0, this.bind); pass.draw(3); pass.end();
    const start = performance.now(); q.submit([enc.finish()]);
    if (!this.pending) { this.pending = true; q.onSubmittedWorkDone().then(() => { this.lastMs = performance.now() - start; this.pending = false; }); }
    return this.canvas;
  }
}
