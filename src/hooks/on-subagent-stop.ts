/**
 * SubagentStop hook — closes a subagent turn.
 * Stub for P3a. Full implementation in Phase 8.
 */
import type { SubagentStopStdin } from '../types.js';
import { readStdin } from '../stdin.js';

async function main(): Promise<void> {
  // Stub — will call closeTurn(fp, sid, agent_id, 'subagent_stop')
  await readStdin<SubagentStopStdin>();
}

void main();
