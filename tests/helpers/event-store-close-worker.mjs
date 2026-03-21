import { parentPort, workerData } from 'node:worker_threads';

const gate = new Int32Array(workerData.gate);

parentPort.postMessage({ type: 'ready' });
Atomics.wait(gate, 0, 0);

try {
  const { closeTurn } = await import(workerData.moduleUrl);
  const result = closeTurn(
    workerData.projectFp,
    workerData.sessionId,
    workerData.agentKey,
    workerData.reason,
  );
  parentPort.postMessage({ type: 'result', result });
} catch (error) {
  parentPort.postMessage({
    type: 'error',
    error: error instanceof Error ? (error.stack ?? error.message) : String(error),
  });
}
