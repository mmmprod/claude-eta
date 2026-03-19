/**
 * UserPromptSubmit hook — marks the start of a new task.
 * Reads the user's prompt, classifies it, creates a task entry.
 */
import * as crypto from 'node:crypto';
import * as path from 'node:path';
import type { UserPromptSubmitStdin, TaskEntry } from '../types.js';
import { readStdin } from '../stdin.js';
import { addTask, setActiveTask, getActiveTask, clearActiveTask, updateLastTask } from '../store.js';
import { classifyPrompt, summarizePrompt } from '../classify.js';

function projectName(cwd?: string): string {
  if (!cwd) return 'unknown';
  return path.basename(cwd);
}

async function main(): Promise<void> {
  const stdin = await readStdin<UserPromptSubmitStdin>();
  if (!stdin) return;

  const project = projectName(stdin.cwd);
  const prompt = stdin.prompt ?? '';

  // If there's an active task, close it first
  const active = getActiveTask();
  if (active) {
    const durationMs = Date.now() - active.start;
    updateLastTask(active.project, {
      timestamp_end: new Date().toISOString(),
      duration_seconds: Math.round(durationMs / 1000),
      tool_calls: active.tool_calls ?? 0,
      files_read: active.files_read ?? 0,
      files_edited: active.files_edited ?? 0,
      files_created: active.files_created ?? 0,
      errors: active.errors ?? 0,
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
    prompt_summary: summarizePrompt(prompt),
    classification: classifyPrompt(prompt),
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
