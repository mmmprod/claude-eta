import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

// Point plugin data dir to a temp dir for isolation
const TEST_ROOT = path.join(os.tmpdir(), `admin-export-test-${Date.now()}`);
process.env.CLAUDE_PLUGIN_DATA = TEST_ROOT;

const { buildAdminExport } = await import('../dist/cli/admin-export.js');
const { ensureDir } = await import('../dist/paths.js');

// ── Helpers ──────────────────────────────────────────────────

function writeCompletedTurn(projectFp, sessionId, agentKey, turn) {
  const dir = path.join(TEST_ROOT, 'projects', projectFp, 'completed');
  ensureDir(dir);
  const file = path.join(dir, `${sessionId}__${agentKey}.jsonl`);
  fs.appendFileSync(file, JSON.stringify(turn) + '\n');
}

function writeActiveTurn(projectFp, sessionId, agentKey, state) {
  const dir = path.join(TEST_ROOT, 'projects', projectFp, 'active');
  ensureDir(dir);
  fs.writeFileSync(path.join(dir, `${sessionId}__${agentKey}.json`), JSON.stringify(state));
}

function writeSessionMeta(projectFp, sessionId, meta) {
  const dir = path.join(TEST_ROOT, 'projects', projectFp, 'sessions');
  ensureDir(dir);
  fs.writeFileSync(path.join(dir, `${sessionId}.json`), JSON.stringify(meta));
}

function makeTurn(overrides = {}) {
  return {
    turn_id: `turn-${Math.random().toString(36).slice(2)}`,
    work_item_id: 'wi-1',
    session_id: 'sess-1',
    agent_key: 'main',
    agent_id: null,
    agent_type: null,
    runner_kind: 'main',
    project_fp: 'aaa111',
    project_display_name: 'test-project',
    classification: 'bugfix',
    prompt_summary: 'fix something',
    prompt_complexity: 2,
    started_at: '2026-03-15T10:00:00.000Z',
    ended_at: '2026-03-15T10:00:30.000Z',
    wall_seconds: 30,
    active_seconds: 25,
    wait_seconds: 5,
    tool_calls: 8,
    files_read: 3,
    files_edited: 2,
    files_created: 0,
    unique_files: 4,
    bash_calls: 1,
    bash_failures: 0,
    grep_calls: 2,
    glob_calls: 1,
    errors: 0,
    model: 'claude-sonnet-4',
    source: 'vscode',
    stop_reason: 'stop',
    repo_loc_bucket: 'small',
    repo_file_count_bucket: '10-50',
    ...overrides,
  };
}

// ── Setup ────────────────────────────────────────────────────

before(() => {
  // Ensure base directories exist
  ensureDir(path.join(TEST_ROOT, 'projects'));
  ensureDir(path.join(TEST_ROOT, 'data'));

  // Project A: 5 completed turns (3 bugfix, 1 feature, 1 other)
  const fpA = 'projA_fp00001';
  writeSessionMeta(fpA, 'sess-a1', {
    session_id: 'sess-a1',
    project_fp: fpA,
    project_display_name: 'project-alpha',
    cwd_realpath: '/tmp/alpha',
    model: 'claude-sonnet-4',
    source: 'vscode',
    session_agent_type: null,
    started_at: '2026-03-10T08:00:00.000Z',
    last_seen_at: '2026-03-10T09:00:00.000Z',
  });

  writeCompletedTurn(
    fpA,
    'sess-a1',
    'main',
    makeTurn({
      project_fp: fpA,
      session_id: 'sess-a1',
      project_display_name: 'project-alpha',
      classification: 'bugfix',
      wall_seconds: 30,
      active_seconds: 25,
      wait_seconds: 5,
      stop_reason: 'stop',
      started_at: '2026-03-10T08:00:00.000Z',
      ended_at: '2026-03-10T08:00:30.000Z',
    }),
  );
  writeCompletedTurn(
    fpA,
    'sess-a1',
    'main',
    makeTurn({
      project_fp: fpA,
      session_id: 'sess-a1',
      project_display_name: 'project-alpha',
      classification: 'bugfix',
      wall_seconds: 45,
      active_seconds: 40,
      wait_seconds: 5,
      stop_reason: 'stop',
      started_at: '2026-03-10T08:01:00.000Z',
      ended_at: '2026-03-10T08:01:45.000Z',
    }),
  );
  writeCompletedTurn(
    fpA,
    'sess-a1',
    'main',
    makeTurn({
      project_fp: fpA,
      session_id: 'sess-a1',
      project_display_name: 'project-alpha',
      classification: 'bugfix',
      wall_seconds: 20,
      active_seconds: 18,
      wait_seconds: 2,
      stop_reason: 'stop_failure',
      started_at: '2026-03-10T08:02:00.000Z',
      ended_at: '2026-03-10T08:02:20.000Z',
    }),
  );
  writeCompletedTurn(
    fpA,
    'sess-a1',
    'main',
    makeTurn({
      project_fp: fpA,
      session_id: 'sess-a1',
      project_display_name: 'project-alpha',
      classification: 'feature',
      wall_seconds: 120,
      active_seconds: 100,
      wait_seconds: 20,
      stop_reason: 'stop',
      started_at: '2026-03-10T08:03:00.000Z',
      ended_at: '2026-03-10T08:05:00.000Z',
    }),
  );
  writeCompletedTurn(
    fpA,
    'sess-a1',
    'main',
    makeTurn({
      project_fp: fpA,
      session_id: 'sess-a1',
      project_display_name: 'project-alpha',
      classification: 'other',
      wall_seconds: 10,
      active_seconds: 8,
      wait_seconds: 2,
      stop_reason: 'replaced_by_new_prompt',
      started_at: '2026-03-10T08:06:00.000Z',
      ended_at: '2026-03-10T08:06:10.000Z',
    }),
  );

  // Active turn for project A
  writeActiveTurn(fpA, 'sess-a1', 'main', {
    session_id: 'sess-a1',
    agent_key: 'main',
    classification: 'refactor',
    runner_kind: 'main',
    started_at: '2026-03-20T17:00:00.000Z',
    tool_calls: 5,
  });

  // Project B: 2 subagent turns
  const fpB = 'projB_fp00002';
  writeSessionMeta(fpB, 'sess-b1', {
    session_id: 'sess-b1',
    project_fp: fpB,
    project_display_name: 'project-beta',
    cwd_realpath: '/tmp/beta',
    model: 'claude-opus-4',
    source: 'cli',
    session_agent_type: null,
    started_at: '2026-03-18T14:00:00.000Z',
    last_seen_at: '2026-03-18T15:00:00.000Z',
  });

  writeCompletedTurn(
    fpB,
    'sess-b1',
    'main',
    makeTurn({
      project_fp: fpB,
      session_id: 'sess-b1',
      project_display_name: 'project-beta',
      runner_kind: 'main',
      classification: 'feature',
      wall_seconds: 60,
      active_seconds: 55,
      wait_seconds: 5,
      stop_reason: 'stop',
      started_at: '2026-03-18T14:00:00.000Z',
      ended_at: '2026-03-18T14:01:00.000Z',
    }),
  );
  writeCompletedTurn(
    fpB,
    'sess-b1',
    'sub_explore',
    makeTurn({
      project_fp: fpB,
      session_id: 'sess-b1',
      agent_key: 'sub_explore',
      project_display_name: 'project-beta',
      runner_kind: 'subagent',
      agent_type: 'Explore',
      classification: 'other',
      wall_seconds: 15,
      active_seconds: 14,
      wait_seconds: 1,
      stop_reason: 'subagent_stop',
      started_at: '2026-03-18T14:01:00.000Z',
      ended_at: '2026-03-18T14:01:15.000Z',
    }),
  );
  writeCompletedTurn(
    fpB,
    'sess-b1',
    'sub_plan',
    makeTurn({
      project_fp: fpB,
      session_id: 'sess-b1',
      agent_key: 'sub_plan',
      project_display_name: 'project-beta',
      runner_kind: 'subagent',
      agent_type: 'Plan',
      classification: 'other',
      wall_seconds: 20,
      active_seconds: 18,
      wait_seconds: 2,
      stop_reason: 'subagent_stop',
      started_at: '2026-03-18T14:01:15.000Z',
      ended_at: '2026-03-18T14:01:35.000Z',
    }),
  );
});

after(() => {
  fs.rmSync(TEST_ROOT, { recursive: true, force: true });
});

// ── Tests ────────────────────────────────────────────────────

describe('admin-export', () => {
  let result;

  before(async () => {
    result = await buildAdminExport('0.7.0-test');
  });

  it('has correct top-level structure', () => {
    assert.ok(result.generated_at);
    assert.equal(result.plugin_version, '0.7.0-test');
    assert.ok(result.health);
    assert.ok(result.eta_accuracy);
    assert.ok(result.data_quality);
    assert.ok(result.supabase);
    assert.ok(Array.isArray(result.insights));
    assert.ok(result.subagents);
  });

  describe('health', () => {
    it('computes uptime from earliest turn', () => {
      assert.equal(result.health.uptime_since, '2026-03-10T08:00:00.000Z');
      assert.ok(result.health.uptime_days >= 0);
    });

    it('counts total turns across all projects', () => {
      // 5 from projA + 3 from projB = 8
      assert.equal(result.health.total_turns_alltime, 8);
    });

    it('detects active turns', () => {
      assert.equal(result.health.active_turns_count, 1);
      assert.equal(result.health.active_turns[0].classification, 'refactor');
    });

    it('computes stop_reason distribution', () => {
      assert.equal(result.health.stop_reasons['stop'], 4);
      assert.equal(result.health.stop_reasons['stop_failure'], 1);
      assert.equal(result.health.stop_reasons['replaced_by_new_prompt'], 1);
      assert.equal(result.health.stop_reasons['subagent_stop'], 2);
    });

    it('computes stop_failure rate', () => {
      // 1 failure out of 8 total = 12% (rounded)
      assert.equal(result.health.stop_failure_rate_pct, 13); // Math.round(1/8*100)
    });

    it('lists projects with last event and stale flag', () => {
      assert.ok(result.health.last_event_by_project.length >= 2);
      for (const p of result.health.last_event_by_project) {
        assert.ok(p.display_name);
        assert.ok(p.last_event_at);
        assert.ok(typeof p.stale === 'boolean');
      }
    });
  });

  describe('eta_accuracy', () => {
    it('returns empty arrays when no legacy data', () => {
      assert.ok(Array.isArray(result.eta_accuracy.by_project_type));
      assert.ok(Array.isArray(result.eta_accuracy.global));
      assert.ok(Array.isArray(result.eta_accuracy.auto_disabled_types));
    });
  });

  describe('data_quality', () => {
    it('lists projects with turn counts', () => {
      assert.ok(result.data_quality.by_project.length >= 2);
      const alpha = result.data_quality.by_project.find((p) => p.project === 'project-alpha');
      assert.ok(alpha);
      assert.equal(alpha.total, 5);
    });

    it('computes classification distribution', () => {
      const dist = result.data_quality.classification_distribution;
      assert.ok(dist.length > 0);
      const totalPct = dist.reduce((s, d) => s + d.pct, 0);
      // Percentages should roughly sum to 100 (rounding ok)
      assert.ok(totalPct >= 95 && totalPct <= 105, `pct sum = ${totalPct}`);
    });

    it('marks type coverage for auto-ETA eligibility', () => {
      const cov = result.data_quality.type_coverage;
      assert.ok(cov.length > 0);
      for (const c of cov) {
        assert.equal(c.auto_eta_eligible, c.count >= 5);
        assert.equal(c.robust, c.count >= 10);
      }
    });

    it('computes time ratios per project', () => {
      const ratios = result.data_quality.time_ratios;
      assert.ok(ratios.length >= 2);
      for (const r of ratios) {
        assert.ok(r.avg_wall_seconds >= r.avg_active_seconds);
        assert.ok(r.wait_ratio_pct >= 0 && r.wait_ratio_pct <= 100);
      }
    });

    it('produces weekly volume', () => {
      assert.ok(Array.isArray(result.data_quality.weekly_volume));
      assert.ok(result.data_quality.weekly_volume.length > 0);
    });
  });

  describe('subagents', () => {
    it('separates main and subagent turns', () => {
      // 5 main (projA) + 1 main (projB) = 6 main, 2 subagent (projB)
      assert.equal(result.subagents.main_turns, 6);
      assert.equal(result.subagents.subagent_turns, 2);
    });

    it('computes ratio', () => {
      assert.ok(result.subagents.ratio > 0);
      assert.equal(result.subagents.ratio, Math.round((2 / 6) * 100) / 100);
    });

    it('groups by agent_type', () => {
      const types = result.subagents.by_agent_type;
      assert.equal(types.length, 2); // Explore + Plan
      const explore = types.find((t) => t.agent_type === 'Explore');
      assert.ok(explore);
      assert.equal(explore.count, 1);
    });

    it('computes median durations', () => {
      assert.ok(result.subagents.median_main_seconds > 0);
      assert.ok(result.subagents.median_subagent_seconds > 0);
    });
  });

  describe('supabase', () => {
    it('has available flag', () => {
      assert.ok(typeof result.supabase.available === 'boolean');
    });
  });

  describe('insights', () => {
    it('returns array of insight results', () => {
      assert.ok(Array.isArray(result.insights));
      // With 8 turns total, some insights may have enough data
    });
  });
});
