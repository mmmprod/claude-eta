#!/usr/bin/env node
/**
 * CLI for /eta command — reads project data and outputs formatted stats.
 *
 * Usage:
 *   node dist/cli/eta.js [session|history|stats] [cwd]
 */
import * as path from 'node:path';
import { loadProject } from '../store.js';
import type { TaskEntry, TaskClassification } from '../types.js';

// ── Formatting helpers ────────────────────────────────────────

function fmtDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const min = Math.floor(seconds / 60);
  const sec = seconds % 60;
  if (min < 60) return sec > 0 ? `${min}m ${sec}s` : `${min}m`;
  const hr = Math.floor(min / 60);
  const remainMin = min % 60;
  return remainMin > 0 ? `${hr}h ${remainMin}m` : `${hr}h`;
}

function fmtDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString('en-GB', {
    month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function padRight(s: string, len: number): string {
  return s.length >= len ? s.slice(0, len) : s + ' '.repeat(len - s.length);
}

function padLeft(s: string, len: number): string {
  return s.length >= len ? s : ' '.repeat(len - s.length) + s;
}

// ── Modes ─────────────────────────────────────────────────────

function showSession(tasks: TaskEntry[]): void {
  // Current session = tasks with no timestamp_end (active) or the most recent session_id
  const lastSessionId = tasks[tasks.length - 1].session_id;
  const sessionTasks = tasks.filter(t => t.session_id === lastSessionId);

  const completed = sessionTasks.filter(t => t.duration_seconds !== null);
  const active = sessionTasks.find(t => t.duration_seconds === null);

  const totalSec = completed.reduce((sum, t) => sum + (t.duration_seconds ?? 0), 0);
  const avgSec = completed.length > 0 ? Math.round(totalSec / completed.length) : 0;

  console.log(`## Session Stats (${completed.length} tasks completed)\n`);
  console.log(`| Metric              | Value               |`);
  console.log(`|---------------------|---------------------|`);
  console.log(`| Tasks completed     | ${padRight(String(completed.length), 19)} |`);
  console.log(`| Total time          | ${padRight(fmtDuration(totalSec), 19)} |`);
  console.log(`| Avg per task        | ${padRight(completed.length > 0 ? fmtDuration(avgSec) : '-', 19)} |`);
  console.log(`| Total tool calls    | ${padRight(String(completed.reduce((s, t) => s + t.tool_calls, 0)), 19)} |`);
  console.log(`| Files read          | ${padRight(String(completed.reduce((s, t) => s + t.files_read, 0)), 19)} |`);
  console.log(`| Files edited        | ${padRight(String(completed.reduce((s, t) => s + t.files_edited, 0)), 19)} |`);
  console.log(`| Errors              | ${padRight(String(completed.reduce((s, t) => s + t.errors, 0)), 19)} |`);

  if (active) {
    console.log(`\n**Active task**: "${active.prompt_summary}" (${active.classification})`);
  }
}

function showHistory(tasks: TaskEntry[]): void {
  const recent = tasks.slice(-20).reverse();

  console.log(`## Last ${recent.length} Tasks\n`);
  console.log(`| Date          | Duration | Type     | Prompt                           | Tools |`);
  console.log(`|---------------|----------|----------|----------------------------------|-------|`);

  for (const t of recent) {
    const date = padRight(fmtDate(t.timestamp_start), 13);
    const dur = padRight(t.duration_seconds !== null ? fmtDuration(t.duration_seconds) : 'running', 8);
    const cls = padRight(t.classification, 8);
    const prompt = padRight(t.prompt_summary.slice(0, 34) || '-', 34);
    const tools = padLeft(String(t.tool_calls), 5);
    console.log(`| ${date} | ${dur} | ${cls} | ${prompt} | ${tools} |`);
  }
}

function showStats(tasks: TaskEntry[]): void {
  const completed = tasks.filter(t => t.duration_seconds !== null);
  if (completed.length === 0) {
    console.log('No completed tasks yet.');
    return;
  }

  const byType = new Map<TaskClassification, TaskEntry[]>();
  for (const t of completed) {
    const list = byType.get(t.classification) ?? [];
    list.push(t);
    byType.set(t.classification, list);
  }

  // Sort by count descending
  const sorted = [...byType.entries()].sort((a, b) => b[1].length - a[1].length);

  console.log(`## Stats by Task Type (${completed.length} total)\n`);
  console.log(`| Type      | Count | Avg Duration | Avg Tools | Avg Files |`);
  console.log(`|-----------|-------|--------------|-----------|-----------|`);

  for (const [cls, entries] of sorted) {
    const count = entries.length;
    const avgDur = Math.round(entries.reduce((s, t) => s + (t.duration_seconds ?? 0), 0) / count);
    const avgTools = Math.round(entries.reduce((s, t) => s + t.tool_calls, 0) / count);
    const avgFiles = Math.round(entries.reduce((s, t) => s + t.files_read + t.files_edited + t.files_created, 0) / count);

    console.log(`| ${padRight(cls, 9)} | ${padLeft(String(count), 5)} | ${padRight(fmtDuration(avgDur), 12)} | ${padLeft(String(avgTools), 9)} | ${padLeft(String(avgFiles), 9)} |`);
  }
}

// ── Main ──────────────────────────────────────────────────────

/** Normalize tasks from older versions that may lack counter fields */
function normalize(t: TaskEntry): TaskEntry {
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

function main(): void {
  const mode = process.argv[2] ?? 'session';
  const cwd = process.argv[3] ?? process.cwd();
  const project = path.basename(cwd);

  const data = loadProject(project);
  data.tasks = data.tasks.map(normalize);

  if (data.tasks.length === 0) {
    console.log('No tasks tracked yet. claude-eta is recording — data will appear after your first completed task.');
    return;
  }

  switch (mode) {
    case 'history':
      showHistory(data.tasks);
      break;
    case 'stats':
      showStats(data.tasks);
      break;
    default:
      showSession(data.tasks);
      break;
  }
}

main();
