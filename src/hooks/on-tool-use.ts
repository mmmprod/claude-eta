/**
 * PostToolUse hook — increments tool counters on the active task.
 * Fires after every tool call. Writes to _active.json (fast, small file).
 */
import type { PostToolUseStdin } from '../types.js';
import { readStdin } from '../stdin.js';
import { getActiveTask, incrementActive } from '../store.js';

async function main(): Promise<void> {
  const stdin = await readStdin<PostToolUseStdin>();
  if (!stdin) return;

  if (!getActiveTask()) return;

  const toolName = stdin.tool_name ?? '';

  const increments: {
    tool_calls: number;
    files_read?: number;
    files_edited?: number;
    files_created?: number;
    errors?: number;
  } = { tool_calls: 1 };

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
