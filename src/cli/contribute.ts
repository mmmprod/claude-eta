/**
 * /eta contribute — Preview, confirm, and upload anonymized records.
 * Opt-in only. Shows exactly what will be sent before sending.
 * Deduplicates: only sends tasks not previously contributed.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { loadProject } from '../store.js';
import { anonymizeTask, type AnonymizedRecord } from './export.js';
import { insertVelocityRecords } from '../supabase.js';

const STATE_PATH = path.join(os.homedir(), '.claude', 'plugins', 'claude-eta', 'data', '_contribute_state.json');

interface ContributeState {
  last_contributed_at: string;
  last_contributed_count: number;
  contributed_task_ids: string[];
}

function loadState(): ContributeState | null {
  try {
    const raw = JSON.parse(fs.readFileSync(STATE_PATH, 'utf-8')) as Partial<ContributeState>;
    // Backward compat: old state files lack contributed_task_ids
    return {
      last_contributed_at: raw.last_contributed_at ?? '',
      last_contributed_count: raw.last_contributed_count ?? 0,
      contributed_task_ids: raw.contributed_task_ids ?? [],
    };
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
  fs.writeFileSync(STATE_PATH, JSON.stringify(state, null, 2), 'utf-8');
}

function getNewRecords(projName: string, pluginVersion: string): { records: AnonymizedRecord[]; taskIds: string[] } {
  const state = loadState();
  const excludeIds = new Set(state?.contributed_task_ids ?? []);
  const data = loadProject(projName);
  const meta = { file_count: data.file_count, loc_bucket: data.loc_bucket };

  const records: AnonymizedRecord[] = [];
  const taskIds: string[] = [];

  for (const task of data.tasks) {
    if (excludeIds.has(task.task_id)) continue;
    const record = anonymizeTask(task, projName, pluginVersion, meta);
    if (record) {
      records.push(record);
      taskIds.push(task.task_id);
    }
  }

  return { records, taskIds };
}

export async function showContribute(projName: string, pluginVersion: string): Promise<void> {
  const { records } = getNewRecords(projName, pluginVersion);

  if (records.length === 0) {
    console.log('No new tasks to contribute (all previously contributed or no completed tasks).');
    return;
  }

  const state = loadState();

  console.log(`## Contribute to Community Baselines\n`);
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

export async function executeContribute(projName: string, pluginVersion: string): Promise<void> {
  const { records, taskIds } = getNewRecords(projName, pluginVersion);

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
