import type { LastCompleted, LastEtaPrediction } from './types.js';
export declare function setLastEtaV2(fp: string, sessionId: string, prediction: LastEtaPrediction): void;
/** Read and consume (clear) the last ETA prediction */
export declare function consumeLastEtaV2(fp: string, sessionId: string): LastEtaPrediction | null;
export declare function setLastCompletedV2(fp: string, sessionId: string, info: LastCompleted): void;
/** Read and consume (clear) the last completed recap. Stale entries (>30min) are discarded. */
export declare function consumeLastCompletedV2(fp: string, sessionId: string, maxAgeMs?: number): LastCompleted | null;
//# sourceMappingURL=ephemeral.d.ts.map