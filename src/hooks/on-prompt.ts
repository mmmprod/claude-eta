/**
 * UserPromptSubmit hook — v2: starts a new turn via event-store.
 *
 * Key fixes over v1:
 * - No cross-session flush (defect 4)
 * - Model from SessionMeta, not stdin (defect 5)
 * - Uses event-store per-(session, agent) isolation (defect 1)
 */
import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { UserPromptSubmitStdin } from '../types.js';
import { readStdin } from '../stdin.js';
import { getPluginDataDir } from '../paths.js';
import { resolveProjectIdentity } from '../identity.js';
import { getSession, getActiveTurn, startTurn, closeTurn } from '../event-store.js';
import { loadCompletedTurnsCompat, turnsToTaskEntries } from '../compat.js';
import { loadPreferencesV2, savePreferencesV2 } from '../preferences.js';
import { setLastEtaV2, consumeLastCompletedV2 } from '../ephemeral.js';
import { checkDisableRequest, evaluateAutoEta } from '../auto-eta.js';
import { loadProjectMeta, toAutoEtaAccuracy } from '../project-meta.js';
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

/** Temporary debug: dump stdin keys to file for 48h empirical validation.
 *  Auto-disables after DEBUG_EXPIRY_MS. Remove this block after validation. */
function debugDumpStdinKeys(stdin: Record<string, unknown>): void {
  try {
    const DEBUG_EXPIRY_MS = 48 * 60 * 60 * 1000;
    const debugPath = path.join(getPluginDataDir(), 'debug-stdin-keys.jsonl');
    // Check expiry: if first entry is >48h old, delete and stop
    // Uses first-line timestamp (not birthtimeMs which is unreliable on Linux ext4/xfs)
    try {
      const content = fs.readFileSync(debugPath, 'utf8');
      const firstLine = content.split('\n')[0];
      if (firstLine) {
        const firstTs = Date.parse(JSON.parse(firstLine).ts);
        if (!Number.isNaN(firstTs) && Date.now() - firstTs > DEBUG_EXPIRY_MS) {
          fs.unlinkSync(debugPath);
          return;
        }
      }
    } catch {
      // File doesn't exist yet — will be created
    }
    const entry = {
      ts: new Date().toISOString(),
      hook: 'UserPromptSubmit',
      keys: Object.keys(stdin).sort(),
      model_type: typeof stdin.model,
      model_value: stdin.model,
      has_agent_id: 'agent_id' in stdin,
      has_agent_type: 'agent_type' in stdin,
    };
    fs.appendFileSync(debugPath, JSON.stringify(entry) + '\n');
  } catch {
    // Debug must never break the hook
  }
}

async function main(): Promise<void> {
  const stdin = await readStdin<UserPromptSubmitStdin>();
  if (!stdin) return;

  debugDumpStdinKeys(stdin as unknown as Record<string, unknown>);

  const cwd = stdin.cwd;
  const prompt = stdin.prompt ?? '';
  if (!cwd) return;

  const sessionId = stdin.session_id ?? 'unknown';
  const agentKey = stdin.agent_id ?? 'main';
  const { fp, displayName } = resolveProjectIdentity(cwd);

  // Close previous active turn for THIS session+agent only (not others!)
  // Fixes defect 4: no cross-session flush
  const existing = getActiveTurn(fp, sessionId, agentKey);
  if (existing) {
    closeTurn(fp, sessionId, agentKey, 'replaced_by_new_prompt');
  }

  // Pick up recap from the last completed task (consume-once, v2 ephemeral)
  const lastCompleted = consumeLastCompletedV2(fp, sessionId);

  // Load completed turns for stats BEFORE creating the new turn
  const turns = loadCompletedTurnsCompat(cwd);
  const tasks = turnsToTaskEntries(turns);
  const stats = computeStats(tasks);

  // Get model from SessionMeta (source of truth, set in SessionStart)
  // Fixes defect 5: model no longer from UserPromptSubmit stdin
  const sessionMeta = getSession(fp, sessionId);
  // Model comes from SessionMeta only (set in SessionStart).
  // UserPromptSubmit stdin does not include model per official spec.
  const model = sessionMeta?.model ?? null;

  // Classify and summarize prompt
  const classification = classifyPrompt(prompt);
  const promptSummary = summarizePrompt(prompt);
  const complexity = scorePromptComplexity(prompt);

  // Create new turn via event-store (replaces addTask + setActiveTask)
  const now = Date.now();
  const turnId = crypto.randomUUID();
  const state: ActiveTurnState = {
    turn_id: turnId,
    work_item_id: turnId, // For now, 1:1 with turn
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
  };

  startTurn(state);

  // ── Build context injection ────────────────────────────────
  const contextParts: string[] = [];

  if (lastCompleted) {
    contextParts.push(formatTaskRecap(lastCompleted));
  }

  if (stats) {
    const estimate = estimateTask(stats, classification, complexity);
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
      const etaAccuracy = toAutoEtaAccuracy(meta?.eta_accuracy ?? null);

      const decision = evaluateAutoEta({
        prefs,
        stats,
        etaAccuracy,
        classification,
        prompt,
        taskId: turnId,
      });

      switch (decision.action) {
        case 'inject':
          contextParts.push(decision.injection);
          setLastEtaV2(fp, sessionId, decision.prediction);
          prefs.prompts_since_last_eta = 0;
          prefs.last_eta_task_id = turnId;
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
