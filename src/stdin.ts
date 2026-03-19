/**
 * Shared stdin reader for all hooks.
 * Claude Code sends JSON on stdin for every hook event.
 */
export async function readStdin<T>(): Promise<T | null> {
  if (process.stdin.isTTY) return null;

  const chunks: string[] = [];
  process.stdin.setEncoding('utf8');

  try {
    for await (const chunk of process.stdin) {
      chunks.push(chunk as string);
    }
    const raw = chunks.join('');
    return raw.trim() ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}
