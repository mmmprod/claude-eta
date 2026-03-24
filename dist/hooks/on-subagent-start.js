import { readStdin } from '../stdin.js';
import { resolveProjectIdentity } from '../identity.js';
import { startTurn, getActiveTurn } from '../event-store.js';
import { createActiveTurn } from '../turn-factory.js';
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
    const state = createActiveTurn({
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
        model: null,
        source: null,
        transcript_path: stdin.transcript_path ?? null,
    });
    startTurn(state);
}
void main();
//# sourceMappingURL=on-subagent-start.js.map