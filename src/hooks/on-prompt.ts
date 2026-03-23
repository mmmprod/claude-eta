/**
 * UserPromptSubmit hook — v2: starts a new turn via event-store.
 *
 * Key fixes over v1:
 * - No cross-session flush (defect 4)
 * - Model from SessionMeta, not stdin (defect 5)
 * - Uses event-store per-(session, agent) isolation (defect 1)
 */
import * as crypto from 'node:crypto';
import type { UserPromptSubmitStdin } from '../types.js';
import { readStdin } from '../stdin.js';
import { resolveProjectIdentity } from '../identity.js';
import { getSession, getActiveTurn, startTurn, closeTurn } from '../event-store.js';
import { loadCompletedTurnsCompat, turnsToAnalyticsTasks } from '../compat.js';
import { loadPreferencesV2, savePreferencesV2 } from '../preferences.js';
import { setLastEtaV2, consumeLastCompletedV2 } from '../ephemeral.js';
import { checkDisableRequest, evaluateAutoEta } from '../auto-eta.js';
import { loadProjectMeta } from '../project-meta.js';
import { classifyPrompt, summarizePrompt, decidePromptTransition } from '../classify.js';
import { extractFeatures } from '../features.js';
import { detectRepairLoop } from '../loop-detector.js';
import { estimateInitial, estimateWithTrace, toTaskEstimate } from '../estimator.js';
import {
  computeStats,
  formatStatsContext,
  scorePromptComplexity,
  getDefaultEstimate,
  formatColdStartContext,
  formatTaskRecap,
  fmtSec,
} from '../stats.js';
import type { ActiveTurnState } from '../types.js';

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

  const cwd = stdin.cwd;
  const prompt = stdin.prompt ?? '';
  if (!cwd) return;

  const sessionId = stdin.session_id ?? 'unknown';
  const agentKey = stdin.agent_id ?? 'main';
  const { fp, displayName } = resolveProjectIdentity(cwd);

  // Classify and summarize prompt
  const classification = classifyPrompt(prompt);
  const complexity = scorePromptComplexity(prompt);

  // Load stats once — used by both continuation and new-task branches
  const existing = getActiveTurn(fp, sessionId, agentKey);
  const turns = loadCompletedTurnsCompat(cwd);
  const tasks = turnsToAnalyticsTasks(turns);
  const stats = computeStats(tasks);

  const transition = decidePromptTransition(prompt, classification, existing);

  if (transition === 'continuation' && existing) {
    // ── Continuation: keep the active turn, inject phase-aware estimate ──
    const contextParts: string[] = [];

    if (stats) {
      const features = extractFeatures(existing);
      const elapsed = Math.round(features.elapsed_wall_ms / 1000);
      const initial = estimateInitial(stats, existing.classification, existing.prompt_complexity, {
        model: existing.model,
      });

      // Prefer refined_eta from phase-transition recalc (already computed by on-tool-use)
      const hasRefinedEta = existing.refined_eta && existing.last_phase && existing.last_phase !== 'explore';
      const refined = hasRefinedEta
        ? {
            ...initial,
            remaining_p50: existing.refined_eta!.p50,
            remaining_p80: existing.refined_eta!.p80,
            calibration: 'project+trace' as const,
            phase: features.phase,
          }
        : estimateWithTrace(initial, elapsed, features.phase, {
            stats,
            classification: existing.classification,
            model: existing.model,
          });

      const legacy = toTaskEstimate(refined, existing.prompt_complexity);
      contextParts.push(formatStatsContext(stats, legacy));
      if (features.phase !== 'explore') {
        contextParts.push(
          `[claude-eta] Phase: ${features.phase}, elapsed ${fmtSec(elapsed)}, remaining ~${fmtSec(refined.remaining_p50)}–${fmtSec(refined.remaining_p80)}`,
        );
      }
    }

    respond(contextParts.join('\n'));
    return;
  }

  // ── New task: close previous turn, start fresh ──
  const turnId = crypto.randomUUID();
  let workItemId: ActiveTurnState['work_item_id'] = turnId;
  let cumulativeSeconds = 0;
  if (existing) {
    if (transition === 'same_work_item') {
      workItemId = existing.work_item_id;
      const priorTurns = turns.filter((t) => t.session_id === sessionId && t.work_item_id === existing.work_item_id);
      const priorSeconds = priorTurns.reduce((sum, t) => sum + t.wall_seconds, 0);
      const closingElapsed = Math.round((Date.now() - existing.started_at_ms) / 1000);
      cumulativeSeconds = priorSeconds + closingElapsed;
    }
    closeTurn(fp, sessionId, agentKey, 'replaced_by_new_prompt');
  }

  // Pick up recap from the last completed task (consume-once, v2 ephemeral)
  const lastCompleted = consumeLastCompletedV2(fp, sessionId);

  // Get model from SessionMeta (source of truth, set in SessionStart)
  const sessionMeta = getSession(fp, sessionId);
  const model = sessionMeta?.model ?? null;

  const promptSummary = summarizePrompt(prompt);

  // Create new turn via event-store
  const now = Date.now();
  const state: ActiveTurnState = {
    turn_id: turnId,
    work_item_id: workItemId,
    session_id: sessionId,
    agent_key: agentKey,
    agent_id: agentKey === 'main' ? null : agentKey,
    agent_type: stdin.agent_type ?? null,
    runner_kind: agentKey === 'main' ? 'main' : 'subagent',
    project_fp: fp,
    project_display_name: displayName,
    classification,
    prompt_summary: promptSummary,
    prompt_complexity: complexity,
    started_at: new Date(now).toISOString(),
    started_at_ms: now,
    tool_calls: 0,
    files_read: 0,
    files_edited: 0,
    files_created: 0,
    unique_files: 0,
    bash_calls: 0,
    bash_failures: 0,
    grep_calls: 0,
    glob_calls: 0,
    errors: 0,
    first_tool_at_ms: null,
    first_edit_at_ms: null,
    first_bash_at_ms: null,
    last_event_at_ms: null,
    last_assistant_message: null,
    model,
    source: sessionMeta?.source ?? null,
    status: 'active',
    path_fps: [],
    error_fingerprints: [],
    cached_eta: null,
    live_remaining_p50: null,
    live_remaining_p80: null,
    live_phase: null,
    last_phase: null,
    refined_eta: null,
    files_edited_after_first_failure: 0,
    first_bash_failure_at_ms: null,
    cumulative_work_item_seconds: cumulativeSeconds,
  };

  // Cache ETA snapshot before startTurn so it's persisted in a single write
  let initialEta: ReturnType<typeof estimateInitial> | null = null;
  if (stats) {
    initialEta = estimateInitial(stats, classification, complexity, { model });
    state.cached_eta = {
      p50_wall: Math.max(0, initialEta.p50_wall - cumulativeSeconds),
      p80_wall: Math.max(1, initialEta.p80_wall - cumulativeSeconds),
      basis: initialEta.basis,
      calibration: initialEta.calibration,
    };
  }

  startTurn(state);

  // ── Build context injection ────────────────────────────────
  const contextParts: string[] = [];

  if (lastCompleted) {
    contextParts.push(formatTaskRecap(lastCompleted));
    // Loop detector: inject warning if previous turn had 3+ same errors
    if (lastCompleted.loop_error_fingerprints?.length) {
      const loopResult = detectRepairLoop(lastCompleted.loop_error_fingerprints, 3);
      if (loopResult) {
        contextParts.push(
          `[claude-eta] Warning: your previous attempt hit the same error ${loopResult.count} times: "${loopResult.preview}".\n` +
            `Before trying again, reconsider your approach. Don't retry the same strategy.`,
        );
      }
    }
  }

  if (initialEta && stats) {
    const estimate = toTaskEstimate(initialEta, complexity);
    contextParts.push(formatStatsContext(stats, estimate));
  } else {
    const completedCount = turns.length;
    const estimate = getDefaultEstimate(classification, complexity);
    contextParts.push(formatColdStartContext(estimate, completedCount));
  }

  // Auto-ETA evaluation (only when calibrated)
  if (stats) {
    const prefs = loadPreferencesV2();

    if (checkDisableRequest(prompt)) {
      prefs.auto_eta = false;
      prefs.updated_at = new Date().toISOString();
      savePreferencesV2(prefs);
      contextParts.push('[claude-eta] Auto-ETA disabled. Re-enable anytime with /eta auto on.');
    } else {
      // Load accuracy from project meta for the auto-eta gate
      const meta = loadProjectMeta(fp);
      const rawAccuracy = meta?.eta_accuracy?.by_classification ?? {};
      const etaAccuracy: Record<string, { hits: number; misses: number }> = {};
      for (const [cls, entry] of Object.entries(rawAccuracy)) {
        etaAccuracy[cls] = {
          hits: entry.interval80_hits,
          misses: entry.interval80_total - entry.interval80_hits,
        };
      }

      const decision = evaluateAutoEta({
        prefs,
        stats,
        etaAccuracy,
        classification,
        prompt,
        taskId: workItemId,
        model,
      });

      switch (decision.action) {
        case 'inject':
          contextParts.push(decision.injection);
          setLastEtaV2(fp, sessionId, decision.prediction);
          prefs.prompts_since_last_eta = 0;
          prefs.last_eta_task_id = workItemId;
          prefs.updated_at = new Date().toISOString();
          savePreferencesV2(prefs);
          break;
        case 'cooldown':
          prefs.prompts_since_last_eta++;
          prefs.updated_at = new Date().toISOString();
          savePreferencesV2(prefs);
          break;
      }
    }
  }

  respond(contextParts.join('\n'));
}

void main();
