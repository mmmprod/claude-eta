/**
 * Factory for ActiveTurnState — centralizes zero-initialization of counter fields.
 * Prevents duplication between on-prompt.ts and on-subagent-start.ts.
 */
import * as crypto from 'node:crypto';
export function createActiveTurn(params) {
    const now = Date.now();
    const turnId = crypto.randomUUID();
    return {
        turn_id: turnId,
        work_item_id: turnId,
        session_id: params.session_id,
        agent_key: params.agent_key,
        agent_id: params.agent_id,
        agent_type: params.agent_type,
        runner_kind: params.runner_kind,
        project_fp: params.project_fp,
        project_display_name: params.project_display_name,
        classification: params.classification,
        prompt_summary: params.prompt_summary,
        prompt_complexity: params.prompt_complexity,
        started_at: new Date(now).toISOString(),
        started_at_ms: now,
        tool_calls: 0,
        files_read: 0,
        files_edited: 0,
        files_created: 0,
        unique_files: 0,
        bash_calls: 0,
        bash_failures: 0,
        grep_calls: 0,
        glob_calls: 0,
        errors: 0,
        first_tool_at_ms: null,
        first_edit_at_ms: null,
        first_bash_at_ms: null,
        last_event_at_ms: null,
        last_assistant_message: null,
        model: params.model,
        source: params.source,
        status: 'active',
        path_fps: [],
    };
}
//# sourceMappingURL=turn-factory.js.map