import { readStdin } from '../stdin.js';
import { getActiveTurn, setActiveTurn, appendEvent } from '../event-store.js';
import { resolveProjectIdentity } from '../identity.js';
import { buildErrorFingerprint } from '../loop-detector.js';
import { applyPhaseTransition } from '../features.js';
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
    const state = getActiveTurn(fp, sessionId, agentKey);
    if (!state)
        return;
    const toolName = stdin.tool_name ?? '';
    const now = Date.now();
    // Always count as error
    state.tool_calls += 1;
    state.errors += 1;
    state.last_event_at_ms = now;
    if (state.first_tool_at_ms === null) {
        state.first_tool_at_ms = now;
    }
    // Bash-specific failure tracking
    if (toolName === 'Bash') {
        state.bash_calls += 1;
        state.bash_failures += 1;
        if (state.first_bash_at_ms === null)
            state.first_bash_at_ms = now;
    }
    // Repair-loop tracking is intentionally scoped to Bash failures.
    if (toolName === 'Bash' && stdin.error && stdin.error.length > 0 && state.error_fingerprints.length < 50) {
        state.error_fingerprints.push(buildErrorFingerprint(stdin.error));
    }
    applyPhaseTransition(state, now);
    setActiveTurn(state);
    try {
        appendEvent(fp, sessionId, agentKey, {
            seq: state.tool_calls,
            ts: new Date(now).toISOString(),
            ts_ms: now,
            event: 'tool_fail',
            tool_name: toolName || undefined,
            ok: false,
            error: stdin.error ?? null,
            is_interrupt: stdin.is_interrupt ?? null,
        });
    }
    catch {
        // Non-fatal on hot path
    }
}
void main();
//# sourceMappingURL=on-tool-failure.js.map