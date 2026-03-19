/**
 * Project velocity statistics — computes medians, IQR, and volatility
 * per task classification from historical data.
 */
import type { TaskEntry, TaskClassification } from './types.js';
interface ClassificationStats {
    classification: TaskClassification;
    count: number;
    median: number;
    p25: number;
    p75: number;
    volatility: 'low' | 'medium' | 'high';
}
export interface ProjectStats {
    totalCompleted: number;
    overall: {
        median: number;
        p25: number;
        p75: number;
    };
    byClassification: ClassificationStats[];
}
export interface TaskEstimate {
    low: number;
    high: number;
    median: number;
    confidence: number;
    basis: string;
    volatility: 'low' | 'medium' | 'high';
    complexity: number;
}
export declare function computeStats(tasks: TaskEntry[]): ProjectStats | null;
/** Score prompt complexity 1-5 based on length, file mentions, and scope */
export declare function scorePromptComplexity(prompt: string): number;
/** Estimate duration for a task based on classification + prompt complexity */
export declare function estimateTask(stats: ProjectStats, classification: string, complexity: number): TaskEstimate;
/** Format stats as a concise context string for Claude injection */
export declare function formatStatsContext(stats: ProjectStats, estimate?: TaskEstimate): string;
export {};
//# sourceMappingURL=stats.d.ts.map