export type EtaAliasStatus = 'created' | 'updated' | 'unchanged' | 'skipped';
export declare function getEtaCommandPath(homeDir?: string): string;
export declare function buildEtaCommandAlias(pluginRoot: string): string;
export declare function isManagedEtaCommand(content: string): boolean;
export declare function ensureEtaCommandAlias(pluginRoot: string, homeDir?: string): EtaAliasStatus;
//# sourceMappingURL=command-alias.d.ts.map