#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveProjectIdentity } from '../dist/identity.js';
import { upsertSession, startTurn } from '../dist/event-store.js';
import { ensureDir, getCompletedLogPath } from '../dist/paths.js';
import { createActiveTurn } from '../dist/turn-factory.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..');

const SAMPLES = parseInt(process.env.ETA_PERF_SAMPLES ?? '20', 10);
const PROMPT_HISTORY_TURNS = parseInt(process.env.ETA_PROMPT_HISTORY_TURNS ?? '12', 10);
const TOTAL_AVG_BUDGET_MS = Number(process.env.ETA_HOOK_TOTAL_AVG_MS ?? 180);
const TOTAL_P95_BUDGET_MS = Number(process.env.ETA_HOOK_TOTAL_P95_MS ?? 220);
const DELTA_AVG_BUDGET_MS = Number(process.env.ETA_HOOK_DELTA_AVG_MS ?? 90);
const DELTA_P95_BUDGET_MS = Number(process.env.ETA_HOOK_DELTA_P95_MS ?? 120);

export function percentile(sorted, p) {
  if (sorted.length === 0) return 0;
  const index = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil((p / 100) * sorted.length) - 1),
  );
  return sorted[index];
}

export function summarize(samples) {
  const sorted = [...samples].sort((a, b) => a - b);
  const avg = sorted.reduce((sum, value) => sum + value, 0) / sorted.length;
  return {
    avg_ms: Number(avg.toFixed(3)),
    p95_ms: Number(percentile(sorted, 95).toFixed(3)),
    min_ms: Number(sorted[0].toFixed(3)),
    max_ms: Number(sorted[sorted.length - 1].toFixed(3)),
  };
}

function runCommand(args, runtime = {}) {
  const start = process.hrtime.bigint();
  execFileSync('node', args, {
    cwd: runtime.cwd ?? REPO_ROOT,
    env: {
      ...process.env,
      ...runtime.env,
    },
    input: runtime.input ?? '',
    stdio: ['pipe', 'pipe', 'pipe'],
    encoding: 'utf8',
  });
  return Number(process.hrtime.bigint() - start) / 1e6;
}

function cleanupSetup(setup) {
  if (typeof setup?.cleanup === 'function') setup.cleanup();
}

async function benchCommand(args, options = {}) {
  const samples = [];
  const overheadSamples = [];
  const beforeEach = options.beforeEach ?? (() => ({}));
  const overheadArgs = options.overheadArgs ?? null;

  const warmupSetup = await beforeEach(-1);
  try {
    runCommand(args, {
      cwd: warmupSetup.cwd ?? options.cwd ?? REPO_ROOT,
      env: warmupSetup.env,
      input: warmupSetup.input ?? options.input ?? '',
    });
    if (overheadArgs) {
      runCommand(overheadArgs, {
        cwd: warmupSetup.cwd ?? options.cwd ?? REPO_ROOT,
        env: warmupSetup.env,
      });
    }
  } finally {
    cleanupSetup(warmupSetup);
  }

  for (let index = 0; index < SAMPLES; index += 1) {
    const setup = await beforeEach(index);
    try {
      const runtime = {
        cwd: setup.cwd ?? options.cwd ?? REPO_ROOT,
        env: setup.env,
        input: setup.input ?? options.input ?? '',
      };
      const baselineMs = overheadArgs ? runCommand(overheadArgs, runtime) : null;
      const elapsedMs = runCommand(args, runtime);
      samples.push(elapsedMs);
      if (baselineMs != null) overheadSamples.push(Math.max(0, elapsedMs - baselineMs));
    } finally {
      cleanupSetup(setup);
    }
  }
  return {
    ...summarize(samples),
    overhead_ms: overheadSamples.length > 0 ? summarize(overheadSamples) : null,
  };
}

async function seedSession(pluginDataDir, sessionId = 'perf-session') {
  process.env.CLAUDE_PLUGIN_DATA = pluginDataDir;
  const cwd = REPO_ROOT;
  const { fp, displayName } = resolveProjectIdentity(cwd);
  upsertSession({
    session_id: sessionId,
    project_fp: fp,
    project_display_name: displayName,
    cwd_realpath: cwd,
    model: 'claude-sonnet-4-20250514',
    source: 'perf-bench',
    session_agent_type: null,
    started_at: new Date().toISOString(),
    last_seen_at: new Date().toISOString(),
  });

  return {
    cwd,
    session_id: sessionId,
    project_fp: fp,
    project_display_name: displayName,
  };
}

function buildCompletedTurn({ projectFp, projectDisplayName, sessionId, turnId, startedAtMs, transcriptPath }) {
  const startedAt = new Date(startedAtMs).toISOString();
  const endedAtMs = startedAtMs + 12_000;

  return {
    turn_id: turnId,
    work_item_id: turnId,
    session_id: sessionId,
    agent_key: 'main',
    agent_id: null,
    agent_type: null,
    runner_kind: 'main',
    project_fp: projectFp,
    project_display_name: projectDisplayName,
    classification: 'bugfix',
    prompt_summary: `perf history bugfix ${turnId}`,
    prompt_complexity: 2,
    started_at: startedAt,
    ended_at: new Date(endedAtMs).toISOString(),
    wall_seconds: 12,
    first_edit_offset_seconds: 4,
    first_bash_offset_seconds: null,
    span_until_last_event_seconds: 10,
    tail_after_last_event_seconds: 2,
    active_seconds: 10,
    wait_seconds: 2,
    tool_calls: 1,
    files_read: 1,
    files_edited: 1,
    files_created: 0,
    unique_files: 1,
    bash_calls: 0,
    bash_failures: 0,
    grep_calls: 0,
    glob_calls: 0,
    errors: 0,
    model: 'claude-sonnet-4-20250514',
    source: 'perf-bench',
    transcript_path: transcriptPath,
    transcript_duration_seconds: null,
    transcript_duration_source: null,
    transcript_prompt_to_first_assistant_seconds: null,
    transcript_tool_seconds: null,
    transcript_thinking_seconds: null,
    stop_reason: 'stop',
    repo_loc_bucket: null,
    repo_file_count_bucket: null,
  };
}

function seedCompletedHistory(pluginDataDir, projectFp, projectDisplayName) {
  process.env.CLAUDE_PLUGIN_DATA = pluginDataDir;

  const sessionId = 'perf-history';
  const transcriptDir = path.join(pluginDataDir, 'transcripts');
  ensureDir(transcriptDir);
  const transcriptPath = path.join(transcriptDir, `${sessionId}.jsonl`);
  const transcriptLines = [];
  const completedTurns = [];
  const firstStartMs = Date.parse('2026-03-20T09:00:00.000Z');

  for (let index = 0; index < PROMPT_HISTORY_TURNS; index += 1) {
    const startedAtMs = firstStartMs + index * 60_000;
    const turnId = `perf-history-${index}`;

    transcriptLines.push(
      {
        type: 'user',
        isMeta: false,
        timestamp: new Date(startedAtMs).toISOString(),
        message: { role: 'user', content: `fix benchmark history bug ${index}` },
      },
      {
        type: 'assistant',
        timestamp: new Date(startedAtMs + 2_000).toISOString(),
        message: { role: 'assistant', content: [{ type: 'thinking', thinking: '', signature: `sig-${index}` }] },
      },
      {
        type: 'system',
        subtype: 'turn_duration',
        timestamp: new Date(startedAtMs + 10_000).toISOString(),
        durationMs: 10_000,
      },
    );

    completedTurns.push(
      buildCompletedTurn({
        projectFp,
        projectDisplayName,
        sessionId,
        turnId,
        startedAtMs,
        transcriptPath,
      }),
    );
  }

  fs.writeFileSync(transcriptPath, transcriptLines.map((line) => JSON.stringify(line)).join('\n') + '\n');

  const completedPath = getCompletedLogPath(projectFp, sessionId, 'main');
  ensureDir(path.dirname(completedPath));
  fs.writeFileSync(completedPath, completedTurns.map((turn) => JSON.stringify(turn)).join('\n') + '\n');

  upsertSession({
    session_id: sessionId,
    project_fp: projectFp,
    project_display_name: projectDisplayName,
    cwd_realpath: REPO_ROOT,
    model: 'claude-sonnet-4-20250514',
    source: 'perf-bench',
    session_agent_type: null,
    transcript_path: transcriptPath,
    started_at: new Date(firstStartMs).toISOString(),
    last_seen_at: new Date(firstStartMs + PROMPT_HISTORY_TURNS * 60_000).toISOString(),
  });
}

async function seedActiveState(pluginDataDir) {
  const seeded = await seedSession(pluginDataDir);

  startTurn(
    createActiveTurn({
      session_id: seeded.session_id,
      agent_key: 'main',
      agent_id: null,
      agent_type: null,
      runner_kind: 'main',
      project_fp: seeded.project_fp,
      project_display_name: seeded.project_display_name,
      classification: 'bugfix',
      prompt_summary: 'perf benchmark turn',
      prompt_complexity: 2,
      model: 'claude-sonnet-4-20250514',
      source: 'perf-bench',
    }),
  );

  return {
    cwd: seeded.cwd,
    session_id: seeded.session_id,
  };
}

async function main() {
  const emptyNode = await benchCommand(['-e', '']);

  const toolUseHook = path.join(REPO_ROOT, 'dist', 'hooks', 'on-tool-use.js');
  const toolFailureHook = path.join(REPO_ROOT, 'dist', 'hooks', 'on-tool-failure.js');
  const promptHook = path.join(REPO_ROOT, 'dist', 'hooks', 'on-prompt.js');
  const filePath = path.join(REPO_ROOT, 'package.json');

  const toolUse = await benchCommand([toolUseHook], {
    overheadArgs: ['-e', ''],
    beforeEach: async (index) => {
      const pluginDataDir = fs.mkdtempSync(path.join(os.tmpdir(), `claude-eta-tool-use-${index}-`));
      const cleanup = () => fs.rmSync(pluginDataDir, { recursive: true, force: true });
      const seeded = await seedActiveState(pluginDataDir);
      return {
        cleanup,
        env: { CLAUDE_PLUGIN_DATA: pluginDataDir },
        cwd: REPO_ROOT,
        input: JSON.stringify({
          ...seeded,
          cwd: REPO_ROOT,
          tool_name: 'Read',
          tool_input: { file_path: filePath },
          tool_response: { ok: true },
          hook_event_name: 'PostToolUse',
        }),
      };
    },
  });

  const toolFailure = await benchCommand([toolFailureHook], {
    overheadArgs: ['-e', ''],
    beforeEach: async (index) => {
      const pluginDataDir = fs.mkdtempSync(path.join(os.tmpdir(), `claude-eta-tool-fail-${index}-`));
      const cleanup = () => fs.rmSync(pluginDataDir, { recursive: true, force: true });
      const seeded = await seedActiveState(pluginDataDir);
      return {
        cleanup,
        env: { CLAUDE_PLUGIN_DATA: pluginDataDir },
        cwd: REPO_ROOT,
        input: JSON.stringify({
          ...seeded,
          cwd: REPO_ROOT,
          tool_name: 'Bash',
          error: 'permission denied',
          is_interrupt: false,
          hook_event_name: 'PostToolUseFailure',
        }),
      };
    },
  });

  const onPrompt = await benchCommand([promptHook], {
    overheadArgs: ['-e', ''],
    beforeEach: async (index) => {
      const pluginDataDir = fs.mkdtempSync(path.join(os.tmpdir(), `claude-eta-prompt-${index}-`));
      const cleanup = () => fs.rmSync(pluginDataDir, { recursive: true, force: true });
      const seeded = await seedSession(pluginDataDir, `perf-prompt-${index}`);
      seedCompletedHistory(pluginDataDir, seeded.project_fp, seeded.project_display_name);
      return {
        cleanup,
        env: { CLAUDE_PLUGIN_DATA: pluginDataDir },
        cwd: REPO_ROOT,
        input: JSON.stringify({
          session_id: seeded.session_id,
          cwd: REPO_ROOT,
          prompt: 'fix the benchmarked bug in auth.ts',
          hook_event_name: 'UserPromptSubmit',
        }),
      };
    },
  });

  const results = {
    samples: SAMPLES,
    budgets_ms: {
      total_avg: TOTAL_AVG_BUDGET_MS,
      total_p95: TOTAL_P95_BUDGET_MS,
      delta_avg: DELTA_AVG_BUDGET_MS,
      delta_p95: DELTA_P95_BUDGET_MS,
    },
    baseline_node_spawn: emptyNode,
    on_tool_use: toolUse,
    on_tool_failure: toolFailure,
    on_prompt: onPrompt,
  };

  console.log(JSON.stringify(results, null, 2));

  const failures = [];
  for (const [label, metrics] of [
    ['on_tool_use', toolUse],
    ['on_tool_failure', toolFailure],
    ['on_prompt', onPrompt],
  ]) {
    const deltaAvg = metrics.overhead_ms?.avg_ms ?? metrics.avg_ms - emptyNode.avg_ms;
    const deltaP95 = metrics.overhead_ms?.p95_ms ?? metrics.p95_ms - emptyNode.p95_ms;
    if (metrics.avg_ms > TOTAL_AVG_BUDGET_MS) failures.push(`${label} avg ${metrics.avg_ms}ms > ${TOTAL_AVG_BUDGET_MS}ms`);
    if (metrics.p95_ms > TOTAL_P95_BUDGET_MS) failures.push(`${label} p95 ${metrics.p95_ms}ms > ${TOTAL_P95_BUDGET_MS}ms`);
    if (deltaAvg > DELTA_AVG_BUDGET_MS) failures.push(`${label} avg overhead ${deltaAvg.toFixed(3)}ms > ${DELTA_AVG_BUDGET_MS}ms`);
    if (deltaP95 > DELTA_P95_BUDGET_MS) failures.push(`${label} p95 overhead ${deltaP95.toFixed(3)}ms > ${DELTA_P95_BUDGET_MS}ms`);
  }

  if (failures.length > 0) {
    console.error('\nHook perf budget failures:');
    for (const failure of failures) console.error(`- ${failure}`);
    process.exit(1);
  }
}

if (process.argv[1] && __filename === path.resolve(process.argv[1])) {
  await main();
}
