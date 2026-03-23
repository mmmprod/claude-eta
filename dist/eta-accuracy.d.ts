import type { LastEtaPrediction } from './types.js';
/** p80 upper-bound coverage: true when actual duration fell at or below the predicted p80. */
export declare function isEtaUpperBoundHit(actualSeconds: number, prediction: Pick<LastEtaPrediction, 'low' | 'high'>): boolean;
//# sourceMappingURL=eta-accuracy.d.ts.map