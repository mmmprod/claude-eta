/**
 * SubagentStop hook — closes a subagent turn via event-store.
 *
 * If Stop already closed the turn, closeTurn returns null (safe).
 */
import type { SubagentStopStdin } from '../types.js';
import { readStdin } from '../stdin.js';
import { resolveProjectIdentity } from '../identity.js';
import { closeTurn } from '../event-store.js';

async function main(): Promise<void> {
  const stdin = await readStdin<SubagentStopStdin>();
  const cwd = stdin?.cwd;
  const sessionId = stdin?.session_id;
  const agentId = stdin?.agent_id;
  if (!cwd || !sessionId || !agentId) return;

  const { fp } = resolveProjectIdentity(cwd);
  closeTurn(fp, sessionId, agentId, 'subagent_stop');
}

void main();
