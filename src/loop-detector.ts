/**
 * Loop detector — fingerprints bash errors and detects repair loops.
 * Pure functions, no I/O.
 */
import { createHash } from 'node:crypto';
import type { ErrorFingerprint } from './types.js';

/**
 * Normalize error text for fingerprinting.
 * Strips variable parts (paths, numbers, quoted values) so structurally
 * identical errors produce the same fingerprint.
 */
export function normalizeError(text: string): string {
  // Truncate BEFORE regex to avoid processing 100KB+ stderr through 4 regex passes
  return text
    .slice(0, 1500)
    .toLowerCase()
    .replace(/['"][^'"]*['"]/g, '<val>') // quoted values (types, paths, names)
    .replace(/\S+[/\\]\S+/g, '<path>') // anything with / or \ (file paths)
    .replace(/\b\d+\b/g, '<N>') // all bare numbers
    .replace(/\s+/g, ' ') // collapse whitespace
    .trim()
    .slice(0, 150);
}

/** Hash normalized error text into an 8-char fingerprint */
export function extractErrorFingerprint(text: string): string {
  const normalized = normalizeError(text);
  return createHash('sha256').update(normalized).digest('hex').slice(0, 8);
}

/** Build an ErrorFingerprint record from raw error text */
export function buildErrorFingerprint(text: string): ErrorFingerprint {
  return {
    fp: extractErrorFingerprint(text),
    preview: normalizeError(text).slice(0, 100),
  };
}

export interface LoopDetection {
  fingerprint: string;
  count: number;
  preview: string;
}

/**
 * Detect a repair loop in the accumulated error fingerprints.
 * Returns the most frequent fingerprint if it appears >= threshold times.
 */
export function detectRepairLoop(fingerprints: ErrorFingerprint[], threshold = 3): LoopDetection | null {
  if (fingerprints.length < threshold) return null;

  const counts = new Map<string, { count: number; preview: string }>();
  for (const { fp, preview } of fingerprints) {
    const existing = counts.get(fp);
    if (existing) {
      existing.count++;
    } else {
      counts.set(fp, { count: 1, preview });
    }
  }

  let best: LoopDetection | null = null;
  for (const [fp, { count, preview }] of counts) {
    if (count >= threshold && (!best || count > best.count)) {
      best = { fingerprint: fp, count, preview };
    }
  }

  return best;
}
