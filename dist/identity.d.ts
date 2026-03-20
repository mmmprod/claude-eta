export interface ProjectIdentity {
    /** SHA-256 fingerprint of the resolved absolute path (first 16 hex chars) */
    fp: string;
    /** Human-readable display name (basename of resolved path) */
    displayName: string;
    /** Resolved absolute path */
    resolvedPath: string;
}
/** Resolve a stable project identity from a working directory */
export declare function resolveProjectIdentity(cwd: string): ProjectIdentity;
/**
 * Get or create a local salt for privacy-safe hashing.
 * The salt is stored at <pluginData>/local-salt.txt and never leaves the machine.
 */
export declare function getLocalSalt(): string;
/** Hash a value with the local salt — one-way, privacy-safe */
export declare function hashWithLocalSalt(value: string): string;
//# sourceMappingURL=identity.d.ts.map