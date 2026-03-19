/**
 * PostToolUse hook — increments tool counters on the active task.
 * Fires after every tool call. Writes to _active.json (fast, small file).
 */
import type { PostToolUseStdin } from '../types.js';
import { readStdin } from '../stdin.js';
import { incrementActive } from '../store.js';

async function main(): Promise<void> {
  const stdin = await readStdin<PostToolUseStdin>();
  if (!stdin) return;

  const toolName = stdin.tool_name ?? '';

  const increments: Parameters<typeof incrementActive>[0] = { tool_calls: 1 };

  switch (toolName) {
    case 'Read':
    case 'NotebookRead':
      increments.files_read = 1;
      break;
    case 'Edit':
    case 'NotebookEdit':
      increments.files_edited = 1;
      break;
    case 'Write':
      increments.files_created = 1;
      break;
  }

  // Detect errors from Bash tool responses
  if (toolName === 'Bash' && stdin.tool_response) {
    const resp = stdin.tool_response as Record<string, unknown>;
    if (typeof resp.exit_code === 'number' && resp.exit_code !== 0) {
      increments.errors = 1;
    }
  }

  incrementActive(increments);
}

void main();
