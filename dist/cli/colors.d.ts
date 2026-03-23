/**
 * Minimal ANSI color helpers — zero dependencies.
 * Respects NO_COLOR (https://no-color.org/).
 * Uses FORCE_COLOR=1 to enable in piped contexts (Claude Code Bash tool).
 */
export declare const c: {
    bold: (t: string) => string;
    dim: (t: string) => string;
    cyan: (t: string) => string;
    green: (t: string) => string;
    yellow: (t: string) => string;
    red: (t: string) => string;
    magenta: (t: string) => string;
    gray: (t: string) => string;
};
//# sourceMappingURL=colors.d.ts.map