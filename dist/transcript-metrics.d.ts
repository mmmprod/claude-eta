import type { CompletedTurn, TranscriptDurationSource } from './types.js';
export interface TranscriptTurnSummary {
    started_at: string;
    started_at_ms: number;
    ended_at: string | null;
    duration_seconds: number | null;
    duration_source: TranscriptDurationSource | null;
    prompt_to_first_assistant_seconds: number | null;
    tool_seconds: number | null;
    thinking_seconds: number | null;
}
export declare function resolveTranscriptPathForSession(projectFp: string, sessionId: string, preferredPath?: string | null): string | null;
export declare function loadTranscriptTurnSummaries(projectFp: string, sessionId: string, transcriptPath: string): TranscriptTurnSummary[];
export declare function enrichCompletedTurnsWithTranscriptMetrics(projectFp: string, turns: CompletedTurn[]): CompletedTurn[];
//# sourceMappingURL=transcript-metrics.d.ts.map