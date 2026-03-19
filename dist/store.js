import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
const DATA_DIR = path.join(os.homedir(), '.claude', 'plugins', 'claude-eta', 'data');
function slugify(name) {
    return name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '');
}
function ensureDataDir() {
    fs.mkdirSync(DATA_DIR, { recursive: true });
}
function getProjectPath(project) {
    return path.join(DATA_DIR, `${slugify(project)}.json`);
}
/** Fill in defaults for tasks from older plugin versions */
function normalizeTask(t) {
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
export function loadProject(project) {
    ensureDataDir();
    const filePath = getProjectPath(project);
    try {
        const content = fs.readFileSync(filePath, 'utf-8');
        const data = JSON.parse(content);
        data.tasks = data.tasks.map(normalizeTask);
        return data;
    }
    catch {
        return { project, created: new Date().toISOString(), tasks: [] };
    }
}
export function saveProject(data) {
    ensureDataDir();
    const filePath = getProjectPath(data.project);
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
}
export function addTask(project, task) {
    const data = loadProject(project);
    data.tasks.push(task);
    saveProject(data);
}
export function updateLastTask(project, updates) {
    const data = loadProject(project);
    if (data.tasks.length > 0) {
        Object.assign(data.tasks[data.tasks.length - 1], updates);
        saveProject(data);
    }
    return data;
}
// ── Active task tracking (_active.json) ───────────────────────
function getActivePath() {
    return path.join(DATA_DIR, '_active.json');
}
export function setActiveTask(project, taskId) {
    ensureDataDir();
    const active = {
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
export function getActiveTask() {
    try {
        return JSON.parse(fs.readFileSync(getActivePath(), 'utf-8'));
    }
    catch {
        return null;
    }
}
export function clearActiveTask() {
    try {
        fs.unlinkSync(getActivePath());
    }
    catch {
        // Already deleted or never existed
    }
}
/** Increment counters on the active task (called by PostToolUse hook) */
export function incrementActive(increments) {
    const activePath = getActivePath();
    let active;
    try {
        active = JSON.parse(fs.readFileSync(activePath, 'utf-8'));
    }
    catch {
        return;
    }
    if (increments.tool_calls != null)
        active.tool_calls += increments.tool_calls;
    if (increments.files_read != null)
        active.files_read += increments.files_read;
    if (increments.files_edited != null)
        active.files_edited += increments.files_edited;
    if (increments.files_created != null)
        active.files_created += increments.files_created;
    if (increments.errors != null)
        active.errors += increments.errors;
    // Atomic write: temp file + rename prevents corruption from concurrent access
    const tmpPath = activePath + '.tmp';
    fs.writeFileSync(tmpPath, JSON.stringify(active), 'utf-8');
    fs.renameSync(tmpPath, activePath);
}
/** Close the active task: flush counters to project data, clear active file.
 *  Returns the updated project data (caller can reuse it). */
export function flushActiveTask() {
    const active = getActiveTask();
    if (!active)
        return null;
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
function getLastCompletedPath() {
    return path.join(DATA_DIR, '_last_completed.json');
}
export function setLastCompleted(info) {
    ensureDataDir();
    fs.writeFileSync(getLastCompletedPath(), JSON.stringify(info), 'utf-8');
}
/** Read and delete in one shot. Discards stale files (e.g. from a crashed session). */
export function consumeLastCompleted(maxAgeMs = 30 * 60 * 1000) {
    const p = getLastCompletedPath();
    try {
        const mtime = fs.statSync(p).mtimeMs;
        const data = JSON.parse(fs.readFileSync(p, 'utf-8'));
        fs.unlinkSync(p);
        if (Date.now() - mtime > maxAgeMs)
            return null;
        return data;
    }
    catch {
        return null;
    }
}
//# sourceMappingURL=store.js.map