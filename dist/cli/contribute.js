/**
 * /eta contribute — Preview, confirm, and upload anonymized records.
 * Opt-in only. Shows exactly what will be sent before sending.
 * Deduplicates: only sends tasks not previously contributed.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { loadProject } from '../store.js';
import { anonymizeTask } from './export.js';
import { insertVelocityRecords } from '../supabase.js';
const STATE_PATH = path.join(os.homedir(), '.claude', 'plugins', 'claude-eta', 'data', '_contribute_state.json');
const ETA_COMMAND = '/eta';
const ETA_FALLBACK_COMMAND = '/claude-eta:eta';
function loadState() {
    try {
        const raw = JSON.parse(fs.readFileSync(STATE_PATH, 'utf-8'));
        // Backward compat: old state files lack contributed_task_ids
        return {
            last_contributed_at: raw.last_contributed_at ?? '',
            last_contributed_count: raw.last_contributed_count ?? 0,
            contributed_task_ids: raw.contributed_task_ids ?? [],
        };
    }
    catch {
        return null;
    }
}
function saveState(count, newTaskIds) {
    const existing = loadState();
    const allIds = [...(existing?.contributed_task_ids ?? []), ...newTaskIds];
    const state = {
        last_contributed_at: new Date().toISOString(),
        last_contributed_count: count,
        contributed_task_ids: allIds,
    };
    fs.writeFileSync(STATE_PATH, JSON.stringify(state, null, 2), 'utf-8');
}
function getNewRecords(projName, pluginVersion) {
    const state = loadState();
    const excludeIds = new Set(state?.contributed_task_ids ?? []);
    const data = loadProject(projName);
    const meta = { file_count: data.file_count, loc_bucket: data.loc_bucket };
    const records = [];
    const taskIds = [];
    for (const task of data.tasks) {
        if (excludeIds.has(task.task_id))
            continue;
        const record = anonymizeTask(task, projName, pluginVersion, meta);
        if (record) {
            records.push(record);
            taskIds.push(task.task_id);
        }
    }
    return { records, taskIds };
}
export async function showContribute(projName, pluginVersion) {
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
    console.log(`\n**To confirm**, run this command again with \`--confirm\`:\n\`${ETA_COMMAND} contribute --confirm\``);
    console.log(`If \`${ETA_COMMAND}\` is not available in this session yet, use \`${ETA_FALLBACK_COMMAND} contribute --confirm\`.`);
}
export async function executeContribute(projName, pluginVersion) {
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
//# sourceMappingURL=contribute.js.map