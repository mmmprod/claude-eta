/**
 * Project velocity statistics — computes medians, IQR, and volatility
 * per task classification from historical data.
 */
import type { AnalyticsTask, TaskClassification, LastCompleted } from './types.js';
interface ClassificationStats {
    classification: TaskClassification;
    count: number;
    median: number;
    p25: number;
    p75: number;
    p80: number;
    volatility: 'low' | 'medium' | 'high';
}
interface ClassificationModelStats extends ClassificationStats {
    model: string;
}
export type PhaseCalibrationPoint = 'edit' | 'validate';
interface ClassificationPhaseStats extends ClassificationStats {
    phase: PhaseCalibrationPoint;
}
interface ClassificationModelPhaseStats extends ClassificationPhaseStats {
    model: string;
}
export interface ProjectStats {
    totalCompleted: number;
    overall: {
        median: number;
        p25: number;
        p75: number;
        p80: number;
    };
    byClassification: ClassificationStats[];
    byClassificationModel: ClassificationModelStats[];
    byClassificationPhase: ClassificationPhaseStats[];
    byClassificationModelPhase: ClassificationModelPhaseStats[];
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
/** Minimum completed tasks before real stats kick in */
export declare const CALIBRATION_THRESHOLD = 5;
/** Generic baselines (seconds) used before enough real data exists */
export declare const DEFAULT_BASELINES: Record<TaskClassification, {
    low: number;
    median: number;
    high: number;
}>;
export declare function computeStats(tasks: AnalyticsTask[]): ProjectStats | null;
/** Score prompt complexity 1-5 based on length, file mentions, and scope */
export declare function scorePromptComplexity(prompt: string): number;
/** Estimate duration using shrinkage quantile blending (v2 estimator) */
export declare function estimateTask(stats: ProjectStats, classification: string, complexity: number, context?: {
    model?: string | null;
}): TaskEstimate;
/** Estimate from generic baselines (cold start, before real data exists) */
export declare function getDefaultEstimate(classification: TaskClassification, complexity: number): TaskEstimate;
export declare function fmtSec(seconds: number): string;
/** Format stats as a concise context string for Claude injection */
export declare function formatStatsContext(stats: ProjectStats, estimate?: TaskEstimate, estimateLabel?: string): string;
/** Format context during cold start (< CALIBRATION_THRESHOLD tasks) */
export declare function formatColdStartContext(estimate: TaskEstimate, tasksCompleted: number, estimateLabel?: string): string;
/** One-line recap of the last completed task */
export declare function formatTaskRecap(info: LastCompleted): string;
export {};
//# sourceMappingURL=stats.d.ts.map