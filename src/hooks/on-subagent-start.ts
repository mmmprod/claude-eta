/**
 * SubagentStart hook — creates a subagent turn.
 * Stub for P3a. Full implementation in Phase 8.
 */
import type { SubagentStartStdin } from '../types.js';
import { readStdin } from '../stdin.js';

async function main(): Promise<void> {
  // Stub — will create an ActiveTurnState for (session_id, agent_id)
  await readStdin<SubagentStartStdin>();
}

void main();
