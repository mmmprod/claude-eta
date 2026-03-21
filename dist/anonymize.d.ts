/** One-way hash of the contributor UUID. */
export declare function contributorHash(): string;
/** One-way hash of the project name, salted with a local machine secret. */
export declare function projectHash(projectName: string): string;
/** Normalize model ID: strip bracket suffixes and date suffixes, pass through everything else.
 *  "claude-sonnet-4-6" → "claude-sonnet-4-6"
 *  "claude-opus-4-6[1m]" → "claude-opus-4-6"
 *  "claude-sonnet-4-5-20250929" → "claude-sonnet-4-5"
 *  "claude-sonnet-4-20250514" → "claude-sonnet-4"
 *  "gpt-4" → "gpt-4"
 */
export declare function normalizeModel(model: string): string;
/** Deterministic dedup key: sha256(contributorHash + ":" + taskId), truncated to 32 hex chars.
 *  Stable across retries for the same task. Not linkable across contributors. */
export declare function dedupKey(contribHash: string, taskId: string): string;
/** Map lines of code to a privacy-safe bucket. */
export declare function locBucket(loc: number): string;
//# sourceMappingURL=anonymize.d.ts.map