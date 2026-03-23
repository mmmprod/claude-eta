/** p80 upper-bound coverage: true when actual duration fell at or below the predicted p80. */
export function isEtaUpperBoundHit(actualSeconds, prediction) {
    const high = Math.max(prediction.low, prediction.high);
    return actualSeconds <= high;
}
//# sourceMappingURL=eta-accuracy.js.map