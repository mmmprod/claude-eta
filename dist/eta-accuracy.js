/** Treat ETA accuracy as an interval check, not just an upper-bound check. */
export function isEtaIntervalHit(actualSeconds, prediction) {
    const low = Math.min(prediction.low, prediction.high);
    const high = Math.max(prediction.low, prediction.high);
    return actualSeconds >= low && actualSeconds <= high;
}
//# sourceMappingURL=eta-accuracy.js.map