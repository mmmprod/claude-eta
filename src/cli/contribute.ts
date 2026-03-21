/**
 * /eta contribute — Preview, confirm, and upload anonymized records.
 * Opt-in only. Shows exactly what will be sent before sending.
 * Deduplicates: only sends tasks not previously contributed.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { loadCompletedTurnsCompat, turnsToTaskEntries } from '../compat.js';
import { consumeCommunityConsentPrompt } from '../community-consent.js';
import { resolveProjectIdentity } from '../identity.js';
import { loadProjectMeta } from '../project-meta.js';
import { getCommunityDir } from '../paths.js';
import { loadPreferencesV2 } from '../preferences.js';
import { anonymizeTask, type AnonymizedRecord } from './export.js';
import { insertVelocityRecords } from '../supabase.js';

const LEGACY_STATE_PATH = path.join(os.homedir(), '.claude', 'plugins', 'claude-eta', 'data', '_contribute_state.json');
const STATE_PATH = path.join(getCommunityDir(), '_contribute_state.json');

interface ContributeState {
  last_contributed_at: string;
  last_contributed_count: number;
  contributed_task_ids: string[];
}

function parseState(raw: Partial<ContributeState>): ContributeState {
  const contributedTaskIds = Array.isArray(raw.contributed_task_ids)
    ? raw.contributed_task_ids.filter((id): id is string => typeof id === 'string')
    : [];
  return {
    last_contributed_at: typeof raw.last_contributed_at === 'string' ? raw.last_contributed_at : '',
    last_contributed_count:
      typeof raw.last_contributed_count === 'number' && Number.isFinite(raw.last_contributed_count)
        ? raw.last_contributed_count
        : 0,
    contributed_task_ids: contributedTaskIds,
  };
}

function loadState(): ContributeState | null {
  // Try new path first
  try {
    const raw = JSON.parse(fs.readFileSync(STATE_PATH, 'utf-8')) as Partial<ContributeState>;
    return parseState(raw);
  } catch {
    // New path doesn't exist — try legacy path and auto-migrate
  }
  try {
    const raw = JSON.parse(fs.readFileSync(LEGACY_STATE_PATH, 'utf-8')) as Partial<ContributeState>;
    const state = parseState(raw);
    // Silent migration: write to new location
    try {
      fs.mkdirSync(path.dirname(STATE_PATH), { recursive: true });
      fs.writeFileSync(STATE_PATH, JSON.stringify(state, null, 2), 'utf-8');
    } catch {
      // Migration write failed — not critical, will retry next time
    }
    return state;
  } catch {
    return null;
  }
}

const MAX_CONTRIBUTED_IDS = 10_000;

function saveState(count: number, newTaskIds: string[]): void {
  const existing = loadState();
  const existingIds = existing?.contributed_task_ids ?? [];
  const existingSet = new Set(existingIds);
  const uniqueNew = newTaskIds.filter((id) => !existingSet.has(id));
  const allIds = [...existingIds, ...uniqueNew];
  // Cap to prevent unbounded growth; oldest IDs dropped (re-contribute is harmless)
  const cappedIds = allIds.length > MAX_CONTRIBUTED_IDS ? allIds.slice(-MAX_CONTRIBUTED_IDS) : allIds;
  const state: ContributeState = {
    last_contributed_at: new Date().toISOString(),
    last_contributed_count: count,
    contributed_task_ids: cappedIds,
  };
  fs.mkdirSync(path.dirname(STATE_PATH), { recursive: true });
  fs.writeFileSync(STATE_PATH, JSON.stringify(state, null, 2), 'utf-8');
}

function getNewRecords(cwd: string, pluginVersion: string): { records: AnonymizedRecord[]; taskIds: string[] } {
  const state = loadState();
  const excludeIds = new Set(state?.contributed_task_ids ?? []);
  const { fp } = resolveProjectIdentity(cwd);
  const turns = loadCompletedTurnsCompat(cwd);
  const tasks = turnsToTaskEntries(turns);
  const meta = loadProjectMeta(fp);
  const projectMeta = { file_count: meta?.file_count ?? undefined, loc_bucket: meta?.loc_bucket ?? undefined };

  const records: AnonymizedRecord[] = [];
  const taskIds: string[] = [];

  for (const task of tasks) {
    if (excludeIds.has(task.task_id)) continue;
    const record = anonymizeTask(task, fp, pluginVersion, projectMeta);
    if (record) {
      records.push(record);
      taskIds.push(task.task_id);
    }
  }

  return { records, taskIds };
}

function ensureCommunitySharingEnabled(): boolean {
  const prefs = loadPreferencesV2();
  if (prefs.community_sharing) return true;
  const consentPrompt = consumeCommunityConsentPrompt();

  if (prefs.community_choice_made) {
    console.log('Community sharing is disabled.');
    console.log('You chose local-only mode. Local estimates still learn from your private data only.');
    console.log(
      'Enable uploads later with `/eta community on`, then run `/eta contribute` to preview what would be sent.',
    );
    return false;
  }

  console.log('Community sharing is disabled until you choose a mode.');
  console.log('Local estimates still learn from your private data only.');
  if (consentPrompt) {
    console.log(`\n${consentPrompt}`);
  } else {
    console.log('Review your options with `/eta community`, then run `/eta contribute` to preview what would be sent.');
  }
  return false;
}

export async function showContribute(cwd: string, pluginVersion: string): Promise<void> {
  if (!ensureCommunitySharingEnabled()) return;

  const { records } = getNewRecords(cwd, pluginVersion);

  if (records.length === 0) {
    console.log('No new tasks to contribute (all previously contributed or no completed tasks).');
    return;
  }

  const state = loadState();

  console.log(`## Contribute to Community Baselines\n`);
  console.log('Sharing status: enabled (manual upload mode).');
  console.log('Disable uploads anytime with `/eta community off`.\n');
  console.log(`**${records.length}** new anonymized records ready to contribute.`);

  if (state && state.last_contributed_at) {
    console.log(`Last contribution: ${state.last_contributed_at} (${state.last_contributed_count} records)`);
    console.log(`Previously contributed: ${state.contributed_task_ids.length} tasks`);
  }

  console.log('\n### Sample record\n');
  console.log('```json');
  console.log(JSON.stringify(records[0], null, 2));
  console.log('```');

  console.log('\n### What is sent');
  console.log('- Task type, duration, tool/file counts, model (normalized), project hash');
  console.log('\n### What is NOT sent');
  console.log('- Prompt text, file paths, project name, code, conversation content');

  console.log('\n**To confirm**, run this command again with `--confirm`:\n' + '`/eta contribute --confirm`');
}

export async function executeContribute(cwd: string, pluginVersion: string): Promise<void> {
  if (!ensureCommunitySharingEnabled()) return;

  const { records, taskIds } = getNewRecords(cwd, pluginVersion);

  if (records.length === 0) {
    console.log('No new tasks to contribute (all previously contributed or no completed tasks).');
    return;
  }

  console.log(`Uploading ${records.length} new anonymized records...`);

  const { error } = await insertVelocityRecords(records);

  if (error) {
    console.log(`\nUpload failed: ${error}`);
    console.log('Your data has not been sent. Try again later.');
    return;
  }

  saveState(records.length, taskIds);
  console.log(`\nDone. ${records.length} records contributed. Thank you!`);
}
