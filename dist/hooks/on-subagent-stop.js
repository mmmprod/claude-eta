import { readStdin } from '../stdin.js';
import { resolveProjectIdentity } from '../identity.js';
import { closeTurn, getActiveTurn, setActiveTurn } from '../event-store.js';
async function main() {
    const stdin = await readStdin();
    const cwd = stdin?.cwd;
    const sessionId = stdin?.session_id;
    const agentId = stdin?.agent_id;
    if (!cwd || !sessionId || !agentId)
        return;
    const { fp } = resolveProjectIdentity(cwd);
    const active = getActiveTurn(fp, sessionId, agentId);
    if (active && (stdin.agent_transcript_path || stdin.transcript_path)) {
        active.transcript_path = stdin.agent_transcript_path ?? stdin.transcript_path ?? null;
        setActiveTurn(active);
    }
    closeTurn(fp, sessionId, agentId, 'subagent_stop');
}
void main();
//# sourceMappingURL=on-subagent-stop.js.map