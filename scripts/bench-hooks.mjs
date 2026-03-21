#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..');

const SAMPLES = parseInt(process.env.ETA_PERF_SAMPLES ?? '12', 10);
const TOTAL_AVG_BUDGET_MS = Number(process.env.ETA_HOOK_TOTAL_AVG_MS ?? 180);
const TOTAL_P95_BUDGET_MS = Number(process.env.ETA_HOOK_TOTAL_P95_MS ?? 220);
const DELTA_AVG_BUDGET_MS = Number(process.env.ETA_HOOK_DELTA_AVG_MS ?? 90);
const DELTA_P95_BUDGET_MS = Number(process.env.ETA_HOOK_DELTA_P95_MS ?? 120);

function percentile(sorted, p) {
  if (sorted.length === 0) return 0;
  const index = Math.max(0, Math.floor((p / 100) * (sorted.length - 1)));
  return sorted[index];
}

function summarize(samples) {
  const sorted = [...samples].sort((a, b) => a - b);
  const avg = sorted.reduce((sum, value) => sum + value, 0) / sorted.length;
  return {
    avg_ms: Number(avg.toFixed(3)),
    p95_ms: Number(percentile(sorted, 95).toFixed(3)),
    min_ms: Number(sorted[0].toFixed(3)),
    max_ms: Number(sorted[sorted.length - 1].toFixed(3)),
  };
}

async function benchCommand(args, options = {}) {
  const samples = [];
  const beforeEach = options.beforeEach ?? (() => ({}));

  const warmupSetup = await beforeEach(-1);
  try {
    execFileSync('node', args, {
      cwd: warmupSetup.cwd ?? options.cwd ?? REPO_ROOT,
      env: {
        ...process.env,
        ...warmupSetup.env,
      },
      input: warmupSetup.input ?? options.input ?? '',
      stdio: ['pipe', 'pipe', 'pipe'],
      encoding: 'utf8',
    });
  } finally {
    if (typeof warmupSetup.cleanup === 'function') warmupSetup.cleanup();
  }

  for (let index = 0; index < SAMPLES; index += 1) {
    const setup = await beforeEach(index);
    const env = {
      ...process.env,
      ...setup.env,
    };
    const input = setup.input ?? options.input ?? '';
    const cwd = setup.cwd ?? options.cwd ?? REPO_ROOT;
    const start = process.hrtime.bigint();
    execFileSync('node', args, {
      cwd,
      env,
      input,
      stdio: ['pipe', 'pipe', 'pipe'],
      encoding: 'utf8',
    });
    const elapsedMs = Number(process.hrtime.bigint() - start) / 1e6;
    samples.push(elapsedMs);
    if (typeof setup.cleanup === 'function') setup.cleanup();
  }
  return summarize(samples);
}

async function seedActiveState(pluginDataDir) {
  process.env.CLAUDE_PLUGIN_DATA = pluginDataDir;
  const saltCacheBust = `${Date.now()}-${Math.random()}`;
  const [{ resolveProjectIdentity }, { upsertSession, startTurn }, { createActiveTurn }] = await Promise.all([
    import(`../dist/identity.js?t=${saltCacheBust}`),
    import(`../dist/event-store.js?t=${saltCacheBust}`),
    import(`../dist/turn-factory.js?t=${saltCacheBust}`),
  ]);

  const cwd = REPO_ROOT;
  const sessionId = 'perf-session';
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

  startTurn(
    createActiveTurn({
      session_id: sessionId,
      agent_key: 'main',
      agent_id: null,
      agent_type: null,
      runner_kind: 'main',
      project_fp: fp,
      project_display_name: displayName,
      classification: 'bugfix',
      prompt_summary: 'perf benchmark turn',
      prompt_complexity: 2,
      model: 'claude-sonnet-4-20250514',
      source: 'perf-bench',
    }),
  );

  return {
    cwd,
    session_id: sessionId,
  };
}

async function main() {
  const emptyNode = await benchCommand(['-e', '']);

  const toolUseHook = path.join(REPO_ROOT, 'dist', 'hooks', 'on-tool-use.js');
  const toolFailureHook = path.join(REPO_ROOT, 'dist', 'hooks', 'on-tool-failure.js');
  const filePath = path.join(REPO_ROOT, 'package.json');

  const toolUse = await benchCommand([toolUseHook], {
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
  };

  console.log(JSON.stringify(results, null, 2));

  const failures = [];
  for (const [label, metrics] of [
    ['on_tool_use', toolUse],
    ['on_tool_failure', toolFailure],
  ]) {
    const deltaAvg = metrics.avg_ms - emptyNode.avg_ms;
    const deltaP95 = metrics.p95_ms - emptyNode.p95_ms;
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

await main();
