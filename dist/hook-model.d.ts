/**
 * Canonical model ID extraction from hook stdin.
 *
 * The official spec provides model as a string in SessionStart.
 * Legacy versions sent an object { id?, display_name? }.
 * This helper normalizes both forms to string | null.
 */
export declare function extractModelId(model: unknown): string | null;
//# sourceMappingURL=hook-model.d.ts.map