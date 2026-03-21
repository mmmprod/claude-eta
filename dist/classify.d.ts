import type { TaskClassification, ActiveTurnState } from './types.js';
export declare function classifyPrompt(prompt: string): TaskClassification;
/** Conversational / continuation patterns — short acknowledgements, not new tasks.
 *  Also used by auto-eta.ts to skip ETA injection on conversational prompts. */
export declare const CONTINUATION_PATTERNS: RegExp;
/** Detect if a prompt is a continuation of the current work item (not a new task).
 *  Returns true only when there's an existing active turn AND the prompt looks
 *  like an acknowledgement / clarification rather than a new instruction. */
export declare function isContinuation(prompt: string, classification: TaskClassification, existingActive: ActiveTurnState | null): boolean;
export declare function summarizePrompt(prompt: string, maxLength?: number): string;
//# sourceMappingURL=classify.d.ts.map