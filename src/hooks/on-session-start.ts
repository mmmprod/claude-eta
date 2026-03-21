/**
 * SessionStart hook — v2: upserts session, runs migration, injects velocity context.
 * Fires on startup/resume/clear/compact.
 */
import { readStdin } from '../stdin.js';
import { resolveProjectIdentity } from '../identity.js';
import { upsertSession } from '../event-store.js';
import { extractModelId } from '../hook-model.js';
import { needsMigration, migrateLegacyProject, legacySlug } from '../migrate.js';
import { loadCompletedTurnsCompat, turnsToAnalyticsTasks } from '../compat.js';
import { computeStats, formatStatsContext, CALIBRATION_THRESHOLD } from '../stats.js';
import { getRepoMetrics } from '../repo-metrics.js';
import { upsertProjectMeta } from '../project-meta.js';
import { loadPreferencesV2, savePreferencesV2 } from '../preferences.js';
import type { SessionMeta, SessionStartStdin } from '../types.js';

const COMMUNITY_ONBOARDING_NOTE =
  'Privacy: local-only by default. If community features matter later, choose `/eta community off` to stay private or `/eta community on` to allow manual anonymized uploads. `/eta compare` is read-only.';

function consumeCommunityOnboardingNote(): string | null {
  const prefs = loadPreferencesV2();
  if (prefs.community_onboarding_seen) return null;

  prefs.community_onboarding_seen = true;
  prefs.updated_at = new Date().toISOString();
  savePreferencesV2(prefs);
  return COMMUNITY_ONBOARDING_NOTE;
}

async function main(): Promise<void> {
  const stdin = await readStdin<SessionStartStdin>();
  const cwd = stdin?.cwd;
  if (!cwd) return;

  const sessionId = stdin.session_id ?? 'unknown';
  const identity = resolveProjectIdentity(cwd);
  const { fp, displayName, resolvedPath } = identity;

  // Model source of truth: SessionStart (official spec: model is string)
  const model = extractModelId(stdin.model);

  // Upsert session metadata (v2)
  const now = new Date().toISOString();
  const meta: SessionMeta = {
    session_id: sessionId,
    project_fp: fp,
    project_display_name: displayName,
    cwd_realpath: resolvedPath,
    model,
    source: stdin.source ?? null,
    session_agent_type: stdin.agent_type ?? null,
    started_at: now,
    last_seen_at: now,
  };
  upsertSession(meta);

  // Run migration if legacy data exists
  const slug = legacySlug(displayName);
  if (needsMigration(fp, slug)) {
    migrateLegacyProject(fp, slug, displayName, resolvedPath);
  }

  // Load completed turns via compat layer
  const turns = loadCompletedTurnsCompat(cwd);
  const completed = turns.length;

  // Compute repo metrics (cached 24h per project) and persist to meta.json
  const repoMetrics = getRepoMetrics(cwd, fp);
  if (repoMetrics) {
    upsertProjectMeta(fp, {
      project_fp: fp,
      display_name: displayName,
      cwd_realpath: resolvedPath,
      legacy_slug: slug,
      file_count: repoMetrics.fileCount,
      file_count_bucket: repoMetrics.fileCountBucket,
      loc_bucket: repoMetrics.locBucketValue,
      repo_metrics_updated_at: repoMetrics.computedAt,
    });
  }

  const communityOnboardingNote = consumeCommunityOnboardingNote();

  if (completed === 0) {
    let message =
      `[claude-eta] Plugin active — tracking task durations. Data is 100% local.\n` +
      `Calibration: 0/${CALIBRATION_THRESHOLD} tasks. Estimates unlock after a few completed tasks.`;
    if (communityOnboardingNote) message += `\n${communityOnboardingNote}`;
    process.stdout.write(message);
    return;
  }

  if (completed < CALIBRATION_THRESHOLD) {
    let message = `[claude-eta] Calibration: ${completed}/${CALIBRATION_THRESHOLD} tasks recorded. Estimates improving with each task.`;
    if (communityOnboardingNote) message += `\n${communityOnboardingNote}`;
    process.stdout.write(message);
    return;
  }

  // Calibrated — inject velocity context
  const tasks = turnsToAnalyticsTasks(turns);
  const stats = computeStats(tasks);
  if (!stats) return;

  let context = formatStatsContext(stats);

  if (communityOnboardingNote) {
    context += `\n${communityOnboardingNote}`;
  }

  if (completed >= CALIBRATION_THRESHOLD && completed <= CALIBRATION_THRESHOLD + 2) {
    context +=
      '\nTip: run `/eta compare` to see how your pace compares to the community, or `/eta help` for all commands.';
  }

  process.stdout.write(context);
}

void main();
