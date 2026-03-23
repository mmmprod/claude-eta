import type { LastEtaPrediction } from './types.js';
/** Treat ETA accuracy as an interval check, not just an upper-bound check. */
export declare function isEtaIntervalHit(actualSeconds: number, prediction: Pick<LastEtaPrediction, 'low' | 'high'>): boolean;
//# sourceMappingURL=eta-accuracy.d.ts.map