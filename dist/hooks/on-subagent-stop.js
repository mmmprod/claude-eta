import { readStdin } from '../stdin.js';
import { resolveProjectIdentity } from '../identity.js';
import { closeTurn } from '../event-store.js';
async function main() {
    const stdin = await readStdin();
    const cwd = stdin?.cwd;
    const sessionId = stdin?.session_id;
    const agentId = stdin?.agent_id;
    if (!cwd || !sessionId || !agentId)
        return;
    const { fp } = resolveProjectIdentity(cwd);
    closeTurn(fp, sessionId, agentId, 'subagent_stop');
}
void main();
//# sourceMappingURL=on-subagent-stop.js.map