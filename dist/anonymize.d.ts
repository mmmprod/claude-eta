/** One-way hash of the contributor UUID. */
export declare function contributorHash(): string;
/** One-way hash of the project name, salted with a local machine secret. */
export declare function projectHash(projectName: string): string;
/** Normalize model ID: "claude-sonnet-4-20250514" → "claude-sonnet-4" */
export declare function normalizeModel(model: string): string | null;
/** Map lines of code to a privacy-safe bucket. */
export declare function locBucket(loc: number): string;
//# sourceMappingURL=anonymize.d.ts.map