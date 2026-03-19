import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import type { ProjectData, TaskEntry, ActiveTask } from './types.js';

const DATA_DIR = path.join(os.homedir(), '.claude', 'plugins', 'claude-eta', 'data');

function slugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function ensureDataDir(): void {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function getProjectPath(project: string): string {
  return path.join(DATA_DIR, `${slugify(project)}.json`);
}

// ── Project data ──────────────────────────────────────────────

export function loadProject(project: string): ProjectData {
  ensureDataDir();
  const filePath = getProjectPath(project);

  if (fs.existsSync(filePath)) {
    const content = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(content) as ProjectData;
  }

  return {
    project,
    created: new Date().toISOString(),
    tasks: [],
  };
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

export function updateLastTask(project: string, updates: Partial<TaskEntry>): void {
  const data = loadProject(project);
  if (data.tasks.length === 0) return;

  const last = data.tasks[data.tasks.length - 1];
  Object.assign(last, updates);
  saveProject(data);
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
  const activePath = getActivePath();
  if (!fs.existsSync(activePath)) return null;

  try {
    return JSON.parse(fs.readFileSync(activePath, 'utf-8')) as ActiveTask;
  } catch {
    return null;
  }
}

export function clearActiveTask(): void {
  const activePath = getActivePath();
  if (fs.existsSync(activePath)) {
    fs.unlinkSync(activePath);
  }
}

/** Increment counters on the active task (called by PostToolUse hook) */
export function incrementActive(increments: Partial<Pick<ActiveTask, 'tool_calls' | 'files_read' | 'files_edited' | 'files_created' | 'errors'>>): void {
  const active = getActiveTask();
  if (!active) return;

  if (increments.tool_calls) active.tool_calls += increments.tool_calls;
  if (increments.files_read) active.files_read += increments.files_read;
  if (increments.files_edited) active.files_edited += increments.files_edited;
  if (increments.files_created) active.files_created += increments.files_created;
  if (increments.errors) active.errors += increments.errors;

  fs.writeFileSync(getActivePath(), JSON.stringify(active), 'utf-8');
}
