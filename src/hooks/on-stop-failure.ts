/**
 * StopFailure hook — closes the active turn with stop_reason='stop_failure'.
 */
import type { StopFailureStdin } from '../types.js';
import { readStdin } from '../stdin.js';
import { resolveProjectIdentity } from '../identity.js';
import { getActiveTurn, closeTurn, setActiveTurn } from '../event-store.js';
import { setLastCompletedV2 } from '../ephemeral.js';

async function main(): Promise<void> {
  const stdin = await readStdin<StopFailureStdin>();
  if (!stdin?.cwd || !stdin.session_id) return;

  const agentKey = stdin.agent_id ?? 'main';
  const { fp } = resolveProjectIdentity(stdin.cwd);

  const active = getActiveTurn(fp, stdin.session_id, agentKey);
  if (!active) return;

  // Persist error details on active turn before closeTurn re-reads from disk
  if (stdin.last_assistant_message) {
    active.last_assistant_message = stdin.last_assistant_message;
    setActiveTurn(active);
  }

  const completed = closeTurn(fp, stdin.session_id, agentKey, 'stop_failure');
  if (completed) {
    setLastCompletedV2(fp, stdin.session_id, {
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
