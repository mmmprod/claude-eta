import type { TaskClassification, ActiveTurnState } from './types.js';
export declare function classifyPrompt(prompt: string): TaskClassification;
/** Recover useful classifications from stored prompt summaries when older data was persisted as "other". */
export declare function normalizeStoredClassification(classification: TaskClassification, promptSummary: string): TaskClassification;
/** Conversational / continuation patterns — short acknowledgements, not new tasks.
 *  Also used by auto-eta.ts to skip ETA injection on conversational prompts. */
export declare const CONTINUATION_PATTERNS: RegExp;
export type PromptTransition = 'continuation' | 'same_work_item' | 'new_work_item';
/** Detect if a prompt is a continuation of the current work item (not a new task).
 *  Returns true only when there's an existing active turn AND the prompt looks
 *  like an acknowledgement / clarification rather than a new instruction. */
export declare function isContinuation(prompt: string, classification: TaskClassification, existingActive: ActiveTurnState | null): boolean;
export declare function decidePromptTransition(prompt: string, classification: TaskClassification, existingActive: ActiveTurnState | null): PromptTransition;
/** Compute similarity between a new prompt and an existing turn (0 to 1).
 *  Used as a fallback when regex patterns don't match in decidePromptTransition. */
export declare function computeSimilarityScore(prompt: string, promptClassification: TaskClassification, existingClassification: TaskClassification, existingPromptSummary: string): number;
export declare function summarizePrompt(prompt: string, maxLength?: number): string;
//# sourceMappingURL=classify.d.ts.map