/**
 * User preferences v2 — stored under ${CLAUDE_PLUGIN_DATA}/config/preferences.json.
 *
 * Replaces v1 _preferences.json from store.ts.
 * Auto-migrates from v1 on first access if v2 file doesn't exist.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { getConfigDir, ensureDir, atomicWrite, findLegacyFile } from './paths.js';
const DEFAULTS = {
    auto_eta: false,
    prompts_since_last_eta: 0,
    last_eta_task_id: null,
    updated_at: new Date().toISOString(),
};
function getPrefsPath() {
    return path.join(getConfigDir(), 'preferences.json');
}
/** Try to read v1 preferences for one-shot migration */
function tryMigrateFromV1() {
    const v1Path = findLegacyFile('_preferences.json');
    if (!v1Path)
        return null;
    try {
        const content = fs.readFileSync(v1Path, 'utf-8');
        const v1 = JSON.parse(content);
        return {
            auto_eta: v1.auto_eta ?? false,
            prompts_since_last_eta: v1.prompts_since_last_eta ?? 0,
            last_eta_task_id: v1.last_eta_task_id ?? null,
            updated_at: new Date().toISOString(),
        };
    }
    catch {
        return null;
    }
}
export function loadPreferencesV2() {
    const p = getPrefsPath();
    try {
        const content = fs.readFileSync(p, 'utf-8');
        const prefs = JSON.parse(content);
        return {
            auto_eta: prefs.auto_eta ?? DEFAULTS.auto_eta,
            prompts_since_last_eta: prefs.prompts_since_last_eta ?? DEFAULTS.prompts_since_last_eta,
            last_eta_task_id: prefs.last_eta_task_id ?? DEFAULTS.last_eta_task_id,
            updated_at: prefs.updated_at ?? DEFAULTS.updated_at,
        };
    }
    catch {
        // v2 file doesn't exist — try v1 migration
        const migrated = tryMigrateFromV1();
        if (migrated) {
            savePreferencesV2(migrated);
            return migrated;
        }
        // Persist defaults so subsequent calls don't repeat double-ENOENT
        const defaultPrefs = { ...DEFAULTS, updated_at: new Date().toISOString() };
        savePreferencesV2(defaultPrefs);
        return defaultPrefs;
    }
}
export function savePreferencesV2(prefs) {
    ensureDir(getConfigDir());
    atomicWrite(getPrefsPath(), JSON.stringify(prefs, null, 2));
}
//# sourceMappingURL=preferences.js.map