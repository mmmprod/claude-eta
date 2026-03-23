import * as fs from 'node:fs';
import * as path from 'node:path';
import { getCacheDir, ensureDir } from './paths.js';

export function appendProjectDebugLog(projectFp: string, filename: string, message: string): void {
  try {
    const dir = getCacheDir(projectFp);
    ensureDir(dir);
    fs.appendFileSync(path.join(dir, filename), message + '\n');
  } catch {
    // Debug logging must never break the caller.
  }
}
