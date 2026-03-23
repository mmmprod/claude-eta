export declare function readHistorySignature(projectFp: string): string | null;
/** Best-effort bootstrap for existing projects that predate managed signatures. */
export declare function bootstrapHistorySignature(projectFp: string, signature: string): void;
/** Mark completed history as changed using a unique token. */
export declare function markProjectHistoryChanged(projectFp: string): string | null;
//# sourceMappingURL=history-signature.d.ts.map