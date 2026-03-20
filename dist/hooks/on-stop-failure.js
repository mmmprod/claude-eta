import { readStdin } from '../stdin.js';
import { resolveProjectIdentity } from '../identity.js';
import { getActiveTurn, closeTurn } from '../event-store.js';
import { setLastCompleted } from '../store.js';
async function main() {
    const stdin = await readStdin();
    if (!stdin?.cwd || !stdin.session_id)
        return;
    const agentKey = stdin.agent_id ?? 'main';
    const { fp } = resolveProjectIdentity(stdin.cwd);
    const active = getActiveTurn(fp, stdin.session_id, agentKey);
    if (!active)
        return;
    const completed = closeTurn(fp, stdin.session_id, agentKey, 'stop_failure');
    if (completed) {
        setLastCompleted({
            classification: completed.classification,
            duration_seconds: completed.wall_seconds,
            tool_calls: completed.tool_calls,
            files_read: completed.files_read,
            files_edited: completed.files_edited,
            files_created: completed.files_created,
        });
    }
}
void main();
//# sourceMappingURL=on-stop-failure.js.map