/**
 * SubagentStart hook — creates a subagent turn via event-store.
 *
 * Only creates a turn if no active turn exists for (session, agentId),
 * preventing conflicts if UserPromptSubmit already created one.
 */
import * as crypto from 'node:crypto';
import { readStdin } from '../stdin.js';
import { resolveProjectIdentity } from '../identity.js';
import { startTurn, getActiveTurn } from '../event-store.js';
async function main() {
    const stdin = await readStdin();
    const cwd = stdin?.cwd;
    const sessionId = stdin?.session_id;
    const agentId = stdin?.agent_id;
    if (!cwd || !sessionId || !agentId)
        return;
    const { fp, displayName } = resolveProjectIdentity(cwd);
    // Don't create if a turn already exists for this (session, agent)
    // (UserPromptSubmit may have already created one)
    const existing = getActiveTurn(fp, sessionId, agentId);
    if (existing)
        return;
    const now = Date.now();
    const turnId = crypto.randomUUID();
    const state = {
        turn_id: turnId,
        work_item_id: turnId, // 1:1 with turn for now
        session_id: sessionId,
        agent_key: agentId,
        agent_id: agentId,
        agent_type: stdin.agent_type ?? null,
        runner_kind: 'subagent',
        project_fp: fp,
        project_display_name: displayName,
        classification: 'other',
        prompt_summary: `subagent:${stdin.agent_type ?? 'unknown'}`,
        prompt_complexity: 1,
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
        model: null,
        source: null,
        status: 'active',
        path_fps: [],
    };
    startTurn(state);
}
void main();
//# sourceMappingURL=on-subagent-start.js.map