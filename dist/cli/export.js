/**
 * /eta export — Anonymize and export task records to a local JSON file.
 * Output: <pluginDataDir>/export/velocity-YYYY-MM.json
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { loadCompletedTurnsCompat, turnsToAnalyticsTasks } from '../compat.js';
import { resolveProjectIdentity } from '../identity.js';
import { loadProjectMeta } from '../project-meta.js';
import { getPluginDataDir } from '../paths.js';
import { contributorHash, projectHash, normalizeModel, dedupKey } from '../anonymize.js';
const EXPORT_DIR = path.join(getPluginDataDir(), 'export');
export function anonymizeTask(task, projIdentifier, pluginVersion, projectMeta) {
    if (task.duration_seconds == null || task.duration_seconds <= 0)
        return null;
    const contribHash = contributorHash();
    return {
        task_type: task.classification,
        duration_seconds: task.duration_seconds,
        tool_calls: task.tool_calls,
        files_read: task.files_read,
        files_edited: task.files_edited,
        files_created: task.files_created,
        errors: task.errors,
        model: normalizeModel(task.model),
        project_hash: projectHash(projIdentifier),
        project_file_count: projectMeta?.file_count ?? null,
        project_loc_bucket: projectMeta?.loc_bucket ?? null,
        plugin_version: pluginVersion,
        contributor_hash: contribHash,
        dedup_key: dedupKey(contribHash, task.analytics_id),
    };
}
export function anonymizeProject(cwd, pluginVersion) {
    const { fp } = resolveProjectIdentity(cwd);
    const turns = loadCompletedTurnsCompat(cwd);
    const tasks = turnsToAnalyticsTasks(turns);
    const meta = loadProjectMeta(fp);
    const projectMeta = { file_count: meta?.file_count ?? undefined, loc_bucket: meta?.loc_bucket ?? undefined };
    return tasks
        .map((t) => anonymizeTask(t, fp, pluginVersion, projectMeta))
        .filter((r) => r !== null);
}
export function exportToFile(cwd, pluginVersion) {
    const records = anonymizeProject(cwd, pluginVersion);
    if (records.length === 0)
        return { path: '', count: 0 };
    fs.mkdirSync(EXPORT_DIR, { recursive: true });
    const now = new Date();
    const filename = `velocity-${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}.json`;
    const filePath = path.join(EXPORT_DIR, filename);
    fs.writeFileSync(filePath, JSON.stringify(records, null, 2), 'utf-8');
    return { path: filePath, count: records.length };
}
export function showExport(cwd, pluginVersion) {
    const result = exportToFile(cwd, pluginVersion);
    if (result.count === 0) {
        console.log('No completed tasks to export.');
        return;
    }
    console.log(`## Export\n`);
    console.log(`Exported **${result.count}** anonymized records to:`);
    console.log(`\`${result.path}\`\n`);
    const records = JSON.parse(fs.readFileSync(result.path, 'utf-8'));
    console.log('### Sample record\n');
    console.log('```json');
    console.log(JSON.stringify(records[0], null, 2));
    console.log('```');
    console.log('\n**Not included**: prompt text, file paths, project name, any PII.');
}
//# sourceMappingURL=export.js.map