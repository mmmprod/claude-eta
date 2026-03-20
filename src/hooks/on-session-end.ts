/**
 * SessionEnd hook — closes all active turns for the session.
 * No blocking, no network, quick cleanup only.
 */
import type { SessionEndStdin } from '../types.js';
import { readStdin } from '../stdin.js';
import { resolveProjectIdentity } from '../identity.js';
import { closeAllSessionTurns } from '../event-store.js';

async function main(): Promise<void> {
  const stdin = await readStdin<SessionEndStdin>();
  if (!stdin?.cwd || !stdin.session_id) return;

  const { fp } = resolveProjectIdentity(stdin.cwd);
  // reason available per official spec (clear, resume, logout, etc.)
  closeAllSessionTurns(fp, stdin.session_id, 'session_end');
}

void main();
