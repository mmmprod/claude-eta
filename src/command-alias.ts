import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

const ETA_COMMAND = '/eta';
const ETA_FALLBACK_COMMAND = '/claude-eta:eta';
const ALIAS_MARKER = '<!-- claude-eta-managed-alias v1 -->';

export type EtaAliasStatus = 'created' | 'updated' | 'unchanged' | 'skipped';

function shellPath(p: string): string {
  return p.replace(/\\/g, '/');
}

export function getEtaCommandPath(homeDir = os.homedir()): string {
  return path.join(homeDir, '.claude', 'commands', 'eta.md');
}

export function buildEtaCommandAlias(pluginRoot: string): string {
  const runtimePath = shellPath(path.resolve(pluginRoot, 'dist', 'cli', 'eta.js'));

  return `---
description: Show task duration stats — global shortcut installed by claude-eta
argument-hint: [session|history|stats|inspect|compare|export|contribute|help]
allowed-tools: [Bash]
disable-model-invocation: true
---

${ALIAS_MARKER}

# ${ETA_COMMAND} — claude-eta global shortcut

This shortcut forwards to the installed claude-eta plugin runtime.

If this shortcut is unavailable in the current session, use \`${ETA_FALLBACK_COMMAND}\`.

\`\`\`bash
ETA_RUNTIME="${runtimePath}"
if [ ! -f "$ETA_RUNTIME" ]; then
  echo "claude-eta runtime not found at $ETA_RUNTIME"
  echo "Try ${ETA_FALLBACK_COMMAND} or reinstall/update the plugin."
  exit 1
fi
node "$ETA_RUNTIME" $ARGUMENTS "$(pwd)"
\`\`\`
`;
}

export function isManagedEtaCommand(content: string): boolean {
  return content.includes(ALIAS_MARKER);
}

export function ensureEtaCommandAlias(pluginRoot: string, homeDir = os.homedir()): EtaAliasStatus {
  const aliasPath = getEtaCommandPath(homeDir);
  const aliasDir = path.dirname(aliasPath);
  const desired = buildEtaCommandAlias(pluginRoot);

  let current: string | null = null;
  try {
    current = fs.readFileSync(aliasPath, 'utf-8');
  } catch {
    current = null;
  }

  if (current != null && !isManagedEtaCommand(current)) {
    return 'skipped';
  }

  if (current === desired) {
    return 'unchanged';
  }

  fs.mkdirSync(aliasDir, { recursive: true });
  fs.writeFileSync(aliasPath, desired, 'utf-8');
  return current == null ? 'created' : 'updated';
}
