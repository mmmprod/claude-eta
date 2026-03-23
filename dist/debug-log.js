import * as fs from 'node:fs';
import * as path from 'node:path';
import { getCacheDir, ensureDir } from './paths.js';
export function appendProjectDebugLog(projectFp, filename, message) {
    try {
        const dir = getCacheDir(projectFp);
        ensureDir(dir);
        fs.appendFileSync(path.join(dir, filename), message + '\n');
    }
    catch {
        // Debug logging must never break the caller.
    }
}
//# sourceMappingURL=debug-log.js.map