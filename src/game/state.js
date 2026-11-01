import { signal } from '@preact/signals';

// Estado que comparten el loop del juego (Three.js) y la interfaz (Preact).
// mode: 'start' | 'paused' | 'walk' | 'lesson' | 'try'
export const mode = signal('start');
export const lessonId = signal(null);
export const stepIndex = signal(0);
export const promptText = signal('');
export const roomName = signal('');
export const fps = signal(0);
export const frameMs = signal(0);
export const backendName = signal('...');
export const loadStatus = signal('Preparando el renderer');
export const visited = signal(new Set());
export const paramsRev = signal(0);
export const notice = signal('');
export const fullscreen = signal(false);

export const uiStats = { appRenders: 0, signalUpdates: 0 };

const KEY = 'last-deploy-lab:visited';
export function loadVisited() {
  try { visited.value = new Set(JSON.parse(localStorage.getItem(KEY) || '[]')); } catch { /* sin storage */ }
}
export function markVisited(id) {
  const next = new Set(visited.value); next.add(id); visited.value = next;
  try { localStorage.setItem(KEY, JSON.stringify([...next])); } catch { /* sin storage */ }
}
