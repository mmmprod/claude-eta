import { readStdin } from '../stdin.js';
import { resolveProjectIdentity } from '../identity.js';
import { closeAllSessionTurns } from '../event-store.js';
async function main() {
    const stdin = await readStdin();
    if (!stdin?.cwd || !stdin.session_id)
        return;
    const { fp } = resolveProjectIdentity(stdin.cwd);
    closeAllSessionTurns(fp, stdin.session_id, 'session_end');
}
void main();
//# sourceMappingURL=on-session-end.js.map