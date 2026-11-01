// Input unificado. El movimiento solo conoce "teclas": el gamepad se convierte en teclado virtual.
export class Input {
  constructor(el) {
    this.el = el;
    this.keys = new Set();
    this.lastCode = '-'; this.lastKey = '-';
    this.dx = 0; this.dy = 0; this.meterX = 0; // meterX: píxeles acumulados para el gráfico de la sala 2
    this.locked = false;
    this.padHeld = new Set();
    this.onLockChange = () => {};
    addEventListener('keydown', (e) => {
      if (e.target?.tagName === 'TEXTAREA' || e.target?.tagName === 'INPUT') return;
      this.keys.add(e.code); this.lastCode = e.code; this.lastKey = e.key;
      if (['Space', 'ArrowUp', 'ArrowDown', 'Tab'].includes(e.code)) e.preventDefault();
    });
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    addEventListener('blur', () => this.keys.clear());
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === this.el;
      // Al salir del lock el keyup puede perderse: sin esto, W queda apretada al volver.
      if (!this.locked) this.releaseKeys();
      this.onLockChange(this.locked);
    });
    document.addEventListener('mousemove', (e) => {
      // Plan B: si el navegador rechaza Pointer Lock, se mira arrastrando con el mouse.
      if (!this.locked && !(e.buttons & 1 && e.target === this.el)) return;
      this.dx += e.movementX; this.dy += e.movementY; this.meterX += e.movementX;
    });
  }
  releaseKeys() { this.keys.clear(); }
  async lock() {
    try { await this.el.requestPointerLock({ unadjustedMovement: true }); }
    catch { try { await this.el.requestPointerLock(); } catch { this.onLockFail?.(); } }
  }
  unlock() { if (document.pointerLockElement) document.exitPointerLock(); }
  consumeMouse() { const r = [this.dx, this.dy]; this.dx = 0; this.dy = 0; return r; }

  // Gamepad API: el stick dispara KeyboardEvent sintéticos.
  pollGamepad() {
    const pad = navigator.getGamepads?.().find(Boolean);
    if (!pad) return;
    const dz = .35, [lx = 0, ly = 0] = pad.axes;
    const want = new Set();
    if (ly < -dz) want.add('KeyW'); if (ly > dz) want.add('KeyS');
    if (lx < -dz) want.add('KeyA'); if (lx > dz) want.add('KeyD');
    for (const code of want) if (!this.padHeld.has(code)) dispatchEvent(new KeyboardEvent('keydown', { code }));
    for (const code of this.padHeld) if (!want.has(code)) dispatchEvent(new KeyboardEvent('keyup', { code }));
    this.padHeld = want;
    this.dx += (pad.axes[2] || 0) * 14; this.dy += (pad.axes[3] || 0) * 10;
  }
}
