/**
 * UserPromptSubmit hook — marks the start of a new task.
 * Reads the user's prompt, classifies it, creates a task entry.
 * Injects project velocity stats as additionalContext to calibrate Claude.
 */
import * as crypto from 'node:crypto';
import * as path from 'node:path';
import type { UserPromptSubmitStdin, TaskEntry } from '../types.js';
import { readStdin } from '../stdin.js';
import { loadProject, addTask, setActiveTask, flushActiveTask, consumeLastCompleted } from '../store.js';
import { classifyPrompt, summarizePrompt } from '../classify.js';
import {
  computeStats,
  formatStatsContext,
  estimateTask,
  scorePromptComplexity,
  getDefaultEstimate,
  formatColdStartContext,
  formatTaskRecap,
} from '../stats.js';

function projectName(cwd?: string): string {
  if (!cwd) return 'unknown';
  return path.basename(cwd);
}

/** Output hook response with optional additionalContext */
function respond(additionalContext?: string): void {
  if (!additionalContext) return;
  const response = {
    hookSpecificOutput: {
      hookEventName: 'UserPromptSubmit',
      additionalContext,
    },
  };
  process.stdout.write(JSON.stringify(response));
}

async function main(): Promise<void> {
  const stdin = await readStdin<UserPromptSubmitStdin>();
  if (!stdin) return;

  const project = projectName(stdin.cwd);
  const prompt = stdin.prompt ?? '';

  // Close previous active task if any
  flushActiveTask();

  // Pick up recap from the last completed task (consume-once)
  const lastCompleted = consumeLastCompleted();

  // Load project data for stats BEFORE adding the new task
  const data = loadProject(project);
  const stats = computeStats(data.tasks);

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

  // Build context: optional recap + stats or cold-start baselines
  const contextParts: string[] = [];

  if (lastCompleted) {
    contextParts.push(formatTaskRecap(lastCompleted));
  }

  const complexity = scorePromptComplexity(prompt);

  if (stats) {
    // Calibrated path — real project data
    const estimate = estimateTask(stats, task.classification, complexity);
    contextParts.push(formatStatsContext(stats, estimate));
  } else {
    // Cold start — generic baselines
    const completedCount = data.tasks.filter((t) => t.duration_seconds != null).length;
    const estimate = getDefaultEstimate(task.classification, complexity);
    contextParts.push(formatColdStartContext(estimate, completedCount));
  }

  respond(contextParts.join('\n'));
}

void main();
