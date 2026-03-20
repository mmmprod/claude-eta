/**
 * Ephemeral state v2 — scoped by (project_fp, session_id).
 *
 * Replaces v1 _last_eta.json and _last_completed.json from store.ts.
 * Each session gets its own ephemeral file under projects/<fp>/cache/.
 */
import * as fs from 'node:fs';
import { getCacheDir, ensureDir, atomicWrite } from './paths.js';
import type { LastCompleted, LastEtaPrediction } from './types.js';

interface EphemeralState {
  last_eta: LastEtaPrediction | null;
  last_completed: LastCompleted | null;
  updated_at: string;
}

function getEphemeralPath(fp: string, sessionId: string): string {
  return `${getCacheDir(fp)}/ephemeral-${sessionId}.json`;
}

function readEphemeral(fp: string, sessionId: string): EphemeralState {
  try {
    const content = fs.readFileSync(getEphemeralPath(fp, sessionId), 'utf-8');
    return JSON.parse(content) as EphemeralState;
  } catch {
    return { last_eta: null, last_completed: null, updated_at: new Date().toISOString() };
  }
}

function writeEphemeral(fp: string, sessionId: string, state: EphemeralState): void {
  ensureDir(getCacheDir(fp));
  atomicWrite(getEphemeralPath(fp, sessionId), JSON.stringify(state));
}

// ── Last ETA ──────────────────────────────────────────────────

export function setLastEtaV2(fp: string, sessionId: string, prediction: LastEtaPrediction): void {
  const state = readEphemeral(fp, sessionId);
  state.last_eta = prediction;
  state.updated_at = new Date().toISOString();
  writeEphemeral(fp, sessionId, state);
}

/** Read and consume (clear) the last ETA prediction */
export function consumeLastEtaV2(fp: string, sessionId: string): LastEtaPrediction | null {
  const state = readEphemeral(fp, sessionId);
  if (!state.last_eta) return null;
  const eta = state.last_eta;
  state.last_eta = null;
  state.updated_at = new Date().toISOString();
  writeEphemeral(fp, sessionId, state);
  return eta;
}

// ── Last Completed ────────────────────────────────────────────

export function setLastCompletedV2(fp: string, sessionId: string, info: LastCompleted): void {
  const state = readEphemeral(fp, sessionId);
  state.last_completed = info;
  state.updated_at = new Date().toISOString();
  writeEphemeral(fp, sessionId, state);
}

/** Read and consume (clear) the last completed recap. Stale entries (>30min) are discarded. */
export function consumeLastCompletedV2(fp: string, sessionId: string, maxAgeMs = 30 * 60 * 1000): LastCompleted | null {
  const state = readEphemeral(fp, sessionId);
  if (!state.last_completed) return null;
  // Use updated_at from the JSON (not filesystem mtime) to avoid TOCTOU
  const age = Date.now() - new Date(state.updated_at).getTime();
  if (age > maxAgeMs) {
    // Clear stale recap so it doesn't resurface if another write refreshes updated_at
    state.last_completed = null;
    state.updated_at = new Date().toISOString();
    writeEphemeral(fp, sessionId, state);
    return null;
  }
  const completed = state.last_completed;
  state.last_completed = null;
  state.updated_at = new Date().toISOString();
  writeEphemeral(fp, sessionId, state);
  return completed;
}
