import type { LastEtaPrediction } from './types.js';

/** p80 upper-bound coverage: true when actual duration fell at or below the predicted p80. */
export function isEtaIntervalHit(actualSeconds: number, prediction: Pick<LastEtaPrediction, 'low' | 'high'>): boolean {
  const high = Math.max(prediction.low, prediction.high);
  return actualSeconds <= high;
}
