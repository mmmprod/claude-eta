import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import type { ProjectData, TaskEntry, ActiveTask, LastCompleted } from './types.js';

const DATA_DIR = path.join(os.homedir(), '.claude', 'plugins', 'claude-eta', 'data');

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function ensureDataDir(): void {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

function getProjectPath(project: string): string {
  return path.join(DATA_DIR, `${slugify(project)}.json`);
}

/** Fill in defaults for tasks from older plugin versions */
function normalizeTask(t: TaskEntry): TaskEntry {
  return {
    ...t,
    tool_calls: t.tool_calls ?? 0,
    files_read: t.files_read ?? 0,
    files_edited: t.files_edited ?? 0,
    files_created: t.files_created ?? 0,
    errors: t.errors ?? 0,
    prompt_summary: t.prompt_summary ?? '',
    classification: t.classification ?? 'other',
  };
}

// ── Project data ──────────────────────────────────────────────

export function loadProject(project: string): ProjectData {
  ensureDataDir();
  const filePath = getProjectPath(project);

  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    const data = JSON.parse(content) as ProjectData;
    data.tasks = data.tasks.map(normalizeTask);
    return data;
  } catch {
    return { project, created: new Date().toISOString(), tasks: [] };
  }
}

export function saveProject(data: ProjectData): void {
  ensureDataDir();
  const filePath = getProjectPath(data.project);
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
}

export function addTask(project: string, task: TaskEntry): void {
  const data = loadProject(project);
  data.tasks.push(task);
  saveProject(data);
}

export function updateLastTask(project: string, updates: Partial<TaskEntry>): ProjectData {
  const data = loadProject(project);
  if (data.tasks.length > 0) {
    Object.assign(data.tasks[data.tasks.length - 1], updates);
    saveProject(data);
  }
  return data;
}

// ── Active task tracking (_active.json) ───────────────────────

function getActivePath(): string {
  return path.join(DATA_DIR, '_active.json');
}

export function setActiveTask(project: string, taskId: string): void {
  ensureDataDir();
  const active: ActiveTask = {
    project,
    taskId,
    start: Date.now(),
    tool_calls: 0,
    files_read: 0,
    files_edited: 0,
    files_created: 0,
    errors: 0,
  };
  fs.writeFileSync(getActivePath(), JSON.stringify(active), 'utf-8');
}

export function getActiveTask(): ActiveTask | null {
  try {
    return JSON.parse(fs.readFileSync(getActivePath(), 'utf-8')) as ActiveTask;
  } catch {
    return null;
  }
}

export function clearActiveTask(): void {
  try {
    fs.unlinkSync(getActivePath());
  } catch {
    // Already deleted or never existed
  }
}

/** Increment counters on the active task (called by PostToolUse hook) */
export function incrementActive(
  increments: Partial<Pick<ActiveTask, 'tool_calls' | 'files_read' | 'files_edited' | 'files_created' | 'errors'>>,
): void {
  const active = getActiveTask();
  if (!active) return;

  if (increments.tool_calls != null) active.tool_calls += increments.tool_calls;
  if (increments.files_read != null) active.files_read += increments.files_read;
  if (increments.files_edited != null) active.files_edited += increments.files_edited;
  if (increments.files_created != null) active.files_created += increments.files_created;
  if (increments.errors != null) active.errors += increments.errors;

  fs.writeFileSync(getActivePath(), JSON.stringify(active), 'utf-8');
}

/** Close the active task: flush counters to project data, clear active file.
 *  Returns the updated project data (caller can reuse it). */
export function flushActiveTask(): ProjectData | null {
  const active = getActiveTask();
  if (!active) return null;

  const durationMs = Date.now() - active.start;
  const data = updateLastTask(active.project, {
    timestamp_end: new Date().toISOString(),
    duration_seconds: Math.round(durationMs / 1000),
    tool_calls: active.tool_calls ?? 0,
    files_read: active.files_read ?? 0,
    files_edited: active.files_edited ?? 0,
    files_created: active.files_created ?? 0,
    errors: active.errors ?? 0,
  });
  clearActiveTask();
  return data;
}

// ── Last completed task (ephemeral recap for next prompt) ─────

function getLastCompletedPath(): string {
  return path.join(DATA_DIR, '_last_completed.json');
}

export function setLastCompleted(info: LastCompleted): void {
  ensureDataDir();
  fs.writeFileSync(getLastCompletedPath(), JSON.stringify(info), 'utf-8');
}

/** Read and delete in one shot. Discards stale files (e.g. from a crashed session). */
export function consumeLastCompleted(maxAgeMs = 5 * 60 * 1000): LastCompleted | null {
  const p = getLastCompletedPath();
  try {
    const mtime = fs.statSync(p).mtimeMs;
    const data = JSON.parse(fs.readFileSync(p, 'utf-8')) as LastCompleted;
    fs.unlinkSync(p);
    if (Date.now() - mtime > maxAgeMs) return null;
    return data;
  } catch {
    return null;
  }
}
