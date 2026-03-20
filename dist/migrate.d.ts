/** Check if a legacy project file exists and hasn't been migrated yet */
export declare function needsMigration(projectFp: string, legacySlug: string): boolean;
/** Migrate legacy project data to v2 format */
export declare function migrateLegacyProject(projectFp: string, legacySlug: string, displayName: string, cwdRealpath: string): {
    migratedCount: number;
};
/** Legacy slug function (same as old store.ts) for finding legacy files */
export declare function legacySlug(name: string): string;
//# sourceMappingURL=migrate.d.ts.map