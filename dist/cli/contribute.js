/**
 * /eta contribute — Preview, confirm, and upload anonymized records.
 * Opt-in only. Shows exactly what will be sent before sending.
 * Deduplicates: only sends tasks not previously contributed.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { loadCompletedTurnsCompat, turnsToTaskEntries } from '../compat.js';
import { resolveProjectIdentity } from '../identity.js';
import { loadProjectMeta } from '../project-meta.js';
import { getCommunityDir } from '../paths.js';
import { loadPreferencesV2 } from '../preferences.js';
import { anonymizeTask } from './export.js';
import { insertVelocityRecords } from '../supabase.js';
const LEGACY_STATE_PATH = path.join(os.homedir(), '.claude', 'plugins', 'claude-eta', 'data', '_contribute_state.json');
const STATE_PATH = path.join(getCommunityDir(), '_contribute_state.json');
function parseState(raw) {
    const contributedTaskIds = Array.isArray(raw.contributed_task_ids)
        ? raw.contributed_task_ids.filter((id) => typeof id === 'string')
        : [];
    return {
        last_contributed_at: typeof raw.last_contributed_at === 'string' ? raw.last_contributed_at : '',
        last_contributed_count: typeof raw.last_contributed_count === 'number' && Number.isFinite(raw.last_contributed_count)
            ? raw.last_contributed_count
            : 0,
        contributed_task_ids: contributedTaskIds,
    };
}
function loadState() {
    // Try new path first
    try {
        const raw = JSON.parse(fs.readFileSync(STATE_PATH, 'utf-8'));
        return parseState(raw);
    }
    catch {
        // New path doesn't exist — try legacy path and auto-migrate
    }
    try {
        const raw = JSON.parse(fs.readFileSync(LEGACY_STATE_PATH, 'utf-8'));
        const state = parseState(raw);
        // Silent migration: write to new location
        try {
            fs.mkdirSync(path.dirname(STATE_PATH), { recursive: true });
            fs.writeFileSync(STATE_PATH, JSON.stringify(state, null, 2), 'utf-8');
        }
        catch {
            // Migration write failed — not critical, will retry next time
        }
        return state;
    }
    catch {
        return null;
    }
}
const MAX_CONTRIBUTED_IDS = 10_000;
function saveState(count, newTaskIds) {
    const existing = loadState();
    const existingIds = existing?.contributed_task_ids ?? [];
    const existingSet = new Set(existingIds);
    const uniqueNew = newTaskIds.filter((id) => !existingSet.has(id));
    const allIds = [...existingIds, ...uniqueNew];
    // Cap to prevent unbounded growth; oldest IDs dropped (re-contribute is harmless)
    const cappedIds = allIds.length > MAX_CONTRIBUTED_IDS ? allIds.slice(-MAX_CONTRIBUTED_IDS) : allIds;
    const state = {
        last_contributed_at: new Date().toISOString(),
        last_contributed_count: count,
        contributed_task_ids: cappedIds,
    };
    fs.mkdirSync(path.dirname(STATE_PATH), { recursive: true });
    fs.writeFileSync(STATE_PATH, JSON.stringify(state, null, 2), 'utf-8');
}
function getNewRecords(cwd, pluginVersion) {
    const state = loadState();
    const excludeIds = new Set(state?.contributed_task_ids ?? []);
    const { fp } = resolveProjectIdentity(cwd);
    const turns = loadCompletedTurnsCompat(cwd);
    const tasks = turnsToTaskEntries(turns);
    const meta = loadProjectMeta(fp);
    const projectMeta = { file_count: meta?.file_count ?? undefined, loc_bucket: meta?.loc_bucket ?? undefined };
    const records = [];
    const taskIds = [];
    for (const task of tasks) {
        if (excludeIds.has(task.task_id))
            continue;
        const record = anonymizeTask(task, fp, pluginVersion, projectMeta);
        if (record) {
            records.push(record);
            taskIds.push(task.task_id);
        }
    }
    return { records, taskIds };
}
function ensureCommunitySharingEnabled() {
    const prefs = loadPreferencesV2();
    if (prefs.community_sharing)
        return true;
    console.log('Community sharing is disabled.');
    console.log('Local estimates still learn from your private data only.');
    console.log('Enable uploads with `/eta community on`, then run `/eta contribute` to preview what would be sent.');
    return false;
}
export async function showContribute(cwd, pluginVersion) {
    if (!ensureCommunitySharingEnabled())
        return;
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
export async function executeContribute(cwd, pluginVersion) {
    if (!ensureCommunitySharingEnabled())
        return;
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
//# sourceMappingURL=contribute.js.map