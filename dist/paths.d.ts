/** Root data directory — uses CLAUDE_PLUGIN_DATA if available, else dev fallback */
export declare function getPluginDataDir(): string;
/** Project-specific directory: <data>/projects/<project_fp>/ */
export declare function getProjectDir(projectFp: string): string;
/** Active turn files: <project>/active/ */
export declare function getActiveDir(projectFp: string): string;
/** Event logs: <project>/events/ */
export declare function getEventsDir(projectFp: string): string;
/** Completed turn logs: <project>/completed/ */
export declare function getCompletedDir(projectFp: string): string;
/** Session metadata: <project>/sessions/ */
export declare function getSessionsDir(projectFp: string): string;
/** Cache directory: <project>/cache/ */
export declare function getCacheDir(projectFp: string): string;
/** Global config: <data>/config/ */
export declare function getConfigDir(): string;
/** Closing staging dir (idempotent closeTurn): <project>/closing/ */
export declare function getClosingDir(projectFp: string): string;
/** Community data: <data>/community/ */
export declare function getCommunityDir(): string;
/** Legacy data directory (v1 compat): <data>/data/ */
export declare function getLegacyDataDir(): string;
/** Active turn file for a specific (session, agent) pair */
export declare function getActiveTurnPath(projectFp: string, sessionId: string, agentKey: string): string;
/** Event log for a specific (session, agent) pair */
export declare function getEventLogPath(projectFp: string, sessionId: string, agentKey: string): string;
/** Completed turns log for a specific (session, agent) pair */
export declare function getCompletedLogPath(projectFp: string, sessionId: string, agentKey: string): string;
/** Session metadata file */
export declare function getSessionMetaPath(projectFp: string, sessionId: string): string;
/** Project meta.json */
export declare function getProjectMetaPath(projectFp: string): string;
/** Schema version file at data root */
export declare function getSchemaVersionPath(): string;
/** Ensure a directory exists (recursive, no-op if exists) */
export declare function ensureDir(dirPath: string): void;
/** Atomic write: write to temp file, then rename (prevents corruption from concurrent access) */
export declare function atomicWrite(filePath: string, data: string): void;
/** Atomic create: writes only when the target file does not already exist. */
export declare function atomicWriteIfAbsent(filePath: string, data: string): boolean;
/** Ensure all project subdirectories exist */
export declare function ensureProjectDirs(projectFp: string): void;
//# sourceMappingURL=paths.d.ts.map