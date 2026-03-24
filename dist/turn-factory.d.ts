import type { ActiveTurnState, RunnerKind, TaskClassification } from './types.js';
interface CreateTurnParams {
    session_id: string;
    agent_key: string;
    agent_id: string | null;
    agent_type: string | null;
    runner_kind: RunnerKind;
    project_fp: string;
    project_display_name: string;
    classification: TaskClassification;
    prompt_summary: string;
    prompt_complexity: number;
    model: string | null;
    source: string | null;
    transcript_path?: string | null;
}
export declare function createActiveTurn(params: CreateTurnParams): ActiveTurnState;
export {};
//# sourceMappingURL=turn-factory.d.ts.map