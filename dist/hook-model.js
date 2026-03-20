/**
 * Canonical model ID extraction from hook stdin.
 *
 * The official spec provides model as a string in SessionStart.
 * Legacy versions sent an object { id?, display_name? }.
 * This helper normalizes both forms to string | null.
 */
export function extractModelId(model) {
    if (typeof model === 'string' && model.length > 0)
        return model;
    if (model && typeof model === 'object') {
        const obj = model;
        if (typeof obj.id === 'string' && obj.id.length > 0)
            return obj.id;
        if (typeof obj.display_name === 'string' && obj.display_name.length > 0)
            return obj.display_name;
    }
    return null;
}
//# sourceMappingURL=hook-model.js.map