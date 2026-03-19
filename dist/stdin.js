/**
 * Shared stdin reader for all hooks.
 * Claude Code sends JSON on stdin for every hook event.
 */
export async function readStdin() {
    if (process.stdin.isTTY)
        return null;
    const chunks = [];
    process.stdin.setEncoding('utf8');
    try {
        for await (const chunk of process.stdin) {
            chunks.push(chunk);
        }
        const raw = chunks.join('');
        return raw.trim() ? JSON.parse(raw) : null;
    }
    catch {
        return null;
    }
}
//# sourceMappingURL=stdin.js.map