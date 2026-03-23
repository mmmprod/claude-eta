/**
 * Minimal ANSI color helpers — zero dependencies.
 * Respects NO_COLOR (https://no-color.org/).
 * Uses FORCE_COLOR=1 to enable in piped contexts (Claude Code Bash tool).
 */
const hasNoColor = typeof process.env.NO_COLOR === 'string' && process.env.NO_COLOR.length > 0;
const enabled = !hasNoColor && (process.env.FORCE_COLOR === '1' || process.stdout.isTTY === true);
function wrap(code, text) {
    return enabled ? `\x1b[${code}m${text}\x1b[0m` : text;
}
export const c = {
    bold: (t) => wrap('1', t),
    dim: (t) => wrap('2', t),
    cyan: (t) => wrap('36', t),
    green: (t) => wrap('32', t),
    yellow: (t) => wrap('33', t),
    red: (t) => wrap('31', t),
    magenta: (t) => wrap('35', t),
    gray: (t) => wrap('90', t),
};
//# sourceMappingURL=colors.js.map