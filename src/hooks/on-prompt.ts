/**
 * UserPromptSubmit hook — marks the start of a new task.
 * Reads stdin JSON from Claude Code, creates a task entry, sets it as active.
 */
import * as crypto from 'node:crypto';
import * as path from 'node:path';
import type { HookStdinData, TaskEntry } from '../types.js';
import { addTask, setActiveTask, getActiveTask, clearActiveTask, updateLastTask } from '../store.js';

async function readStdin(): Promise<HookStdinData | null> {
  if (process.stdin.isTTY) return null;

  const chunks: string[] = [];
  process.stdin.setEncoding('utf8');

  try {
    for await (const chunk of process.stdin) {
      chunks.push(chunk as string);
    }
    const raw = chunks.join('');
    return raw.trim() ? JSON.parse(raw) as HookStdinData : null;
  } catch {
    return null;
  }
}

function projectName(cwd?: string): string {
  if (!cwd) return 'unknown';
  return path.basename(cwd);
}

async function main(): Promise<void> {
  const stdin = await readStdin();
  if (!stdin) return;

  const project = projectName(stdin.cwd);

  // If there's an active task, close it first
  const active = getActiveTask();
  if (active) {
    const durationMs = Date.now() - active.start;
    updateLastTask(active.project, {
      timestamp_end: new Date().toISOString(),
      duration_seconds: Math.round(durationMs / 1000),
    });
    clearActiveTask();
  }

  // Create new task
  const taskId = crypto.randomUUID();
  const task: TaskEntry = {
    task_id: taskId,
    session_id: stdin.session_id ?? 'unknown',
    project,
    timestamp_start: new Date().toISOString(),
    timestamp_end: null,
    duration_seconds: null,
    prompt_summary: '',  // Will be enriched later
    classification: 'other',
    tool_calls: 0,
    files_read: 0,
    files_edited: 0,
    files_created: 0,
    errors: 0,
    model: stdin.model?.display_name ?? stdin.model?.id ?? 'unknown',
  };

  addTask(project, task);
  setActiveTask(project, taskId);
}

void main();
