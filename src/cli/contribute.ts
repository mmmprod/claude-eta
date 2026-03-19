/**
 * /eta contribute — Preview, confirm, and upload anonymized records.
 * Opt-in only. Shows exactly what will be sent before sending.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { anonymizeProject } from './export.js';
import { insertVelocityRecords } from '../supabase.js';

const STATE_PATH = path.join(os.homedir(), '.claude', 'plugins', 'claude-eta', 'data', '_contribute_state.json');

interface ContributeState {
  last_contributed_at: string;
  last_contributed_count: number;
}

function loadState(): ContributeState | null {
  try {
    return JSON.parse(fs.readFileSync(STATE_PATH, 'utf-8')) as ContributeState;
  } catch {
    return null;
  }
}

function saveState(count: number): void {
  const state: ContributeState = {
    last_contributed_at: new Date().toISOString(),
    last_contributed_count: count,
  };
  fs.writeFileSync(STATE_PATH, JSON.stringify(state, null, 2), 'utf-8');
}

export async function showContribute(projName: string, pluginVersion: string): Promise<void> {
  const records = anonymizeProject(projName, pluginVersion);

  if (records.length === 0) {
    console.log('No completed tasks to contribute.');
    return;
  }

  const state = loadState();

  console.log(`## Contribute to Community Baselines\n`);
  console.log(`**${records.length}** anonymized records ready to contribute.`);

  if (state) {
    console.log(`Last contribution: ${state.last_contributed_at} (${state.last_contributed_count} records)`);
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
  const records = anonymizeProject(projName, pluginVersion);

  if (records.length === 0) {
    console.log('No completed tasks to contribute.');
    return;
  }

  console.log(`Uploading ${records.length} anonymized records...`);

  const { error } = await insertVelocityRecords(records);

  if (error) {
    console.log(`\nUpload failed: ${error}`);
    console.log('Your data has not been sent. Try again later.');
    return;
  }

  saveState(records.length);
  console.log(`\nDone. ${records.length} records contributed. Thank you!`);
}
