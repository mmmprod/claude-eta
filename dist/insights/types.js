// ── Utility functions (shared across modules) ────────────────
/** Filter tasks with valid positive duration */
export function completed(tasks) {
    return tasks.filter((t) => t.duration_seconds != null && t.duration_seconds > 0);
}
/** Median of a pre-sorted numeric array */
export function median(sorted) {
    if (sorted.length === 0)
        return 0;
    if (sorted.length === 1)
        return sorted[0];
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}
/** Group items by a string key */
export function groupBy(items, key) {
    const map = new Map();
    for (const item of items) {
        const k = key(item);
        const list = map.get(k) ?? [];
        list.push(item);
        map.set(k, list);
    }
    return map;
}
//# sourceMappingURL=types.js.map