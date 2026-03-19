/**
 * /eta export — Anonymize and export task records to a local JSON file.
 * Output: ~/.claude/plugins/claude-eta/export/velocity-YYYY-MM.json
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { loadProject } from '../store.js';
import { contributorHash, projectHash, normalizeModel } from '../anonymize.js';
const EXPORT_DIR = path.join(os.homedir(), '.claude', 'plugins', 'claude-eta', 'export');
function anonymizeTask(task, projName, pluginVersion) {
    if (task.duration_seconds == null || task.duration_seconds <= 0)
        return null;
    return {
        task_type: task.classification,
        duration_seconds: task.duration_seconds,
        tool_calls: task.tool_calls,
        files_read: task.files_read,
        files_edited: task.files_edited,
        files_created: task.files_created,
        errors: task.errors,
        model: normalizeModel(task.model),
        project_hash: projectHash(projName),
        plugin_version: pluginVersion,
        contributor_hash: contributorHash(),
    };
}
export function anonymizeProject(projName, pluginVersion) {
    const data = loadProject(projName);
    return data.tasks
        .map((t) => anonymizeTask(t, projName, pluginVersion))
        .filter((r) => r !== null);
}
export function exportToFile(projName, pluginVersion) {
    const records = anonymizeProject(projName, pluginVersion);
    if (records.length === 0)
        return { path: '', count: 0 };
    fs.mkdirSync(EXPORT_DIR, { recursive: true });
    const now = new Date();
    const filename = `velocity-${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}.json`;
    const filePath = path.join(EXPORT_DIR, filename);
    fs.writeFileSync(filePath, JSON.stringify(records, null, 2), 'utf-8');
    return { path: filePath, count: records.length };
}
export function showExport(projName, pluginVersion) {
    const result = exportToFile(projName, pluginVersion);
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