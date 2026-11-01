// Corre en otro hilo: puede tardar lo que quiera sin frenar el render.
import { heavyJob } from './heavyJob.js';

self.onmessage = ({ data }) => {
  const started = performance.now();
  const result = heavyJob(data.ms);
  // Transferable: el buffer se mueve al hilo principal sin copiarse.
  self.postMessage({ result, took: performance.now() - started, buffer: result.buffer }, [result.buffer]);
};
