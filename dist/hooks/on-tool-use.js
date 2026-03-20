import { readStdin } from '../stdin.js';
import { getActiveTurn, setActiveTurn, appendEvent } from '../event-store.js';
import { resolveProjectIdentity } from '../identity.js';
import { hashWithLocalSalt } from '../identity.js';
async function main() {
    const stdin = await readStdin();
    if (!stdin)
        return;
    const cwd = stdin.cwd;
    const sessionId = stdin.session_id;
    if (!cwd || !sessionId)
        return;
    const agentKey = stdin.agent_id ?? 'main';
    const { fp } = resolveProjectIdentity(cwd);
    // Read active turn — if none, silently return (no turn started yet)
    const state = getActiveTurn(fp, sessionId, agentKey);
    if (!state)
        return;
    const toolName = stdin.tool_name ?? '';
    const now = Date.now();
    // ── Increment counters ─────────────────────────────────────
    state.tool_calls += 1;
    state.last_event_at_ms = now;
    if (state.first_tool_at_ms === null) {
        state.first_tool_at_ms = now;
    }
    // File operations
    let fileOp = null;
    switch (toolName) {
        case 'Read':
        case 'NotebookRead':
            state.files_read += 1;
            fileOp = 'read';
            break;
        case 'Edit':
        case 'NotebookEdit':
            state.files_edited += 1;
            fileOp = 'edit';
            if (state.first_edit_at_ms === null)
                state.first_edit_at_ms = now;
            break;
        case 'Write':
            state.files_created += 1;
            fileOp = 'create';
            if (state.first_edit_at_ms === null)
                state.first_edit_at_ms = now;
            break;
    }
    // Tool-specific counters
    switch (toolName) {
        case 'Bash':
            state.bash_calls += 1;
            if (state.first_bash_at_ms === null)
                state.first_bash_at_ms = now;
            break;
        case 'Grep':
            state.grep_calls += 1;
            break;
        case 'Glob':
            state.glob_calls += 1;
            break;
    }
    // Track unique files via hashed path
    let pathFp = null;
    const filePath = stdin.tool_input?.file_path;
    if (filePath) {
        pathFp = hashWithLocalSalt(filePath).slice(0, 12);
        if (!state.path_fps.includes(pathFp)) {
            state.path_fps.push(pathFp);
            state.unique_files = state.path_fps.length;
        }
    }
    // Detect Bash errors
    if (toolName === 'Bash' && stdin.tool_response) {
        const resp = stdin.tool_response;
        if (typeof resp.exit_code === 'number' && resp.exit_code !== 0) {
            state.errors += 1;
            state.bash_failures += 1;
        }
    }
    // ── Persist ────────────────────────────────────────────────
    setActiveTurn(state);
    // Append event (non-blocking for perf — errors are silent)
    try {
        appendEvent(fp, sessionId, agentKey, {
            seq: state.tool_calls,
            ts: new Date(now).toISOString(),
            ts_ms: now,
            event: 'tool_ok',
            tool_name: toolName || undefined,
            ok: true,
            file_op: fileOp,
            path_fp: pathFp,
        });
    }
    catch {
        // Event log append failure is non-fatal on hot path
    }
}
void main();
//# sourceMappingURL=on-tool-use.js.map