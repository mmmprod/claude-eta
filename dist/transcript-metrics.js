import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { ensureDir, getCacheDir, getSessionMetaPath } from './paths.js';
const TRANSCRIPT_CACHE_VERSION = 2;
const TRANSCRIPT_MATCH_WINDOW_MS = 15_000;
const transcriptPathCache = new Map();
const transcriptSummaryCache = new Map();
function readJsonFile(filePath) {
    try {
        return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    }
    catch {
        return null;
    }
}
function isReadableFile(filePath) {
    if (!filePath)
        return false;
    try {
        return fs.statSync(filePath).isFile();
    }
    catch {
        return false;
    }
}
function parseTimestampMs(value) {
    if (typeof value !== 'string' || !value)
        return null;
    const ms = Date.parse(value);
    return Number.isFinite(ms) ? ms : null;
}
function isToolResultMessage(value) {
    if (!Array.isArray(value))
        return false;
    return value.some((item) => item != null && typeof item === 'object' && item.type === 'tool_result');
}
function isPromptStartRecord(entry) {
    if (entry.type !== 'user' || entry.isMeta === true)
        return null;
    const message = entry.message;
    if (message == null || typeof message !== 'object')
        return null;
    if (message.role !== 'user')
        return null;
    const content = message.content;
    if (isToolResultMessage(content))
        return null;
    const ts = typeof entry.timestamp === 'string' ? entry.timestamp : null;
    const tsMs = parseTimestampMs(ts);
    if (!ts || tsMs === null)
        return null;
    return {
        ts,
        tsMs,
    };
}
function isAssistantRecord(entry) {
    if (entry.type === 'assistant')
        return true;
    const message = entry.message;
    return !!(message && typeof message === 'object' && message.role === 'assistant');
}
function hasThinkingBlock(entry) {
    const message = entry.message;
    if (message == null || typeof message !== 'object')
        return false;
    const content = message.content;
    if (!Array.isArray(content))
        return false;
    return content.some((item) => item != null && typeof item === 'object' && item.type === 'thinking');
}
function extractToolDurationMs(entry) {
    const raw = entry.toolUseResult;
    if (!raw || typeof raw !== 'object')
        return null;
    const duration = raw.durationMs;
    return typeof duration === 'number' && Number.isFinite(duration) && duration >= 0 ? duration : null;
}
function isTurnDurationRecord(entry) {
    return entry.type === 'system' && entry.subtype === 'turn_duration';
}
function extractTurnDurationMs(entry) {
    const duration = entry.durationMs;
    return typeof duration === 'number' && Number.isFinite(duration) && duration >= 0 ? duration : null;
}
function hasTranscriptActivity(turn) {
    return turn.has_activity || turn.duration_ms != null;
}
function toSummary(turn) {
    if (!hasTranscriptActivity(turn))
        return null;
    return {
        started_at: turn.started_at,
        started_at_ms: turn.started_at_ms,
        ended_at: turn.ended_at,
        duration_seconds: typeof turn.duration_ms === 'number' && Number.isFinite(turn.duration_ms)
            ? Math.max(0, Math.round(turn.duration_ms / 1000))
            : null,
        duration_source: turn.duration_source,
        prompt_to_first_assistant_seconds: typeof turn.prompt_to_first_assistant_ms === 'number' && Number.isFinite(turn.prompt_to_first_assistant_ms)
            ? Math.max(0, Math.round(turn.prompt_to_first_assistant_ms / 1000))
            : null,
        tool_seconds: Math.max(0, Math.round(turn.tool_ms / 1000)),
        thinking_seconds: Math.max(0, Math.round(turn.thinking_ms / 1000)),
    };
}
function finalizeDerivedTurn(turn) {
    if (!turn || !hasTranscriptActivity(turn))
        return null;
    if (turn.duration_ms == null) {
        turn.duration_ms = Math.max(0, turn.last_relevant_ms - turn.started_at_ms);
        turn.duration_source = 'derived';
        turn.ended_at = new Date(turn.last_relevant_ms).toISOString();
    }
    return toSummary(turn);
}
function parseTranscriptTurns(transcriptPath) {
    const turns = [];
    let current = null;
    let content;
    try {
        content = fs.readFileSync(transcriptPath, 'utf-8');
    }
    catch {
        return turns;
    }
    for (const line of content.split('\n')) {
        if (!line.trim())
            continue;
        let entry;
        try {
            entry = JSON.parse(line);
        }
        catch {
            continue;
        }
        const promptStart = isPromptStartRecord(entry);
        if (promptStart) {
            const finalized = finalizeDerivedTurn(current);
            if (finalized)
                turns.push(finalized);
            current = {
                started_at: promptStart.ts,
                started_at_ms: promptStart.tsMs,
                ended_at: null,
                duration_ms: null,
                duration_source: null,
                prompt_to_first_assistant_ms: null,
                tool_ms: 0,
                thinking_ms: 0,
                last_input_ms: promptStart.tsMs,
                last_thinking_ts_ms: null,
                last_relevant_ms: promptStart.tsMs,
                has_activity: false,
            };
            continue;
        }
        if (!current)
            continue;
        const tsMs = parseTimestampMs(entry.timestamp);
        if (isAssistantRecord(entry)) {
            if (tsMs !== null) {
                current.has_activity = true;
                current.last_relevant_ms = Math.max(current.last_relevant_ms, tsMs);
                if (current.prompt_to_first_assistant_ms == null) {
                    current.prompt_to_first_assistant_ms = Math.max(0, tsMs - current.started_at_ms);
                }
                if (hasThinkingBlock(entry)) {
                    const thinkingStartMs = current.last_thinking_ts_ms ?? current.last_input_ms;
                    if (tsMs >= thinkingStartMs) {
                        current.thinking_ms += tsMs - thinkingStartMs;
                    }
                    current.last_thinking_ts_ms = tsMs;
                }
                else {
                    current.last_thinking_ts_ms = null;
                }
            }
            continue;
        }
        if (isToolResultMessage(entry.message?.content) && tsMs !== null) {
            current.has_activity = true;
            current.last_input_ms = tsMs;
            current.last_thinking_ts_ms = null;
            current.last_relevant_ms = Math.max(current.last_relevant_ms, tsMs);
            const durationMs = extractToolDurationMs(entry);
            if (durationMs !== null)
                current.tool_ms += durationMs;
            continue;
        }
        if (isTurnDurationRecord(entry)) {
            const durationMs = extractTurnDurationMs(entry);
            if (durationMs !== null) {
                current.duration_ms = durationMs;
                current.duration_source = 'turn_duration';
            }
            if (typeof entry.timestamp === 'string')
                current.ended_at = entry.timestamp;
            const finalized = toSummary(current);
            if (finalized)
                turns.push(finalized);
            current = null;
        }
    }
    const finalized = finalizeDerivedTurn(current);
    if (finalized)
        turns.push(finalized);
    return turns;
}
function getTranscriptCachePath(projectFp, sessionId) {
    return path.join(getCacheDir(projectFp), 'transcript-turns', `${sessionId}.json`);
}
function loadTranscriptSummaryFromCache(projectFp, sessionId, transcriptPath) {
    let mtimeMs;
    try {
        mtimeMs = fs.statSync(transcriptPath).mtimeMs;
    }
    catch {
        return null;
    }
    const cacheKey = `${projectFp}:${sessionId}:${transcriptPath}`;
    const inMemory = transcriptSummaryCache.get(cacheKey);
    if (inMemory && inMemory.transcript_mtime_ms === mtimeMs)
        return inMemory;
    const cachePath = getTranscriptCachePath(projectFp, sessionId);
    const cached = readJsonFile(cachePath);
    if (cached &&
        cached.version === TRANSCRIPT_CACHE_VERSION &&
        cached.transcript_path === transcriptPath &&
        cached.transcript_mtime_ms === mtimeMs &&
        Array.isArray(cached.turns)) {
        transcriptSummaryCache.set(cacheKey, cached);
        return cached;
    }
    const payload = {
        version: TRANSCRIPT_CACHE_VERSION,
        session_id: sessionId,
        transcript_path: transcriptPath,
        transcript_mtime_ms: mtimeMs,
        generated_at: new Date().toISOString(),
        turns: parseTranscriptTurns(transcriptPath),
    };
    ensureDir(path.dirname(cachePath));
    try {
        fs.writeFileSync(cachePath, JSON.stringify(payload));
    }
    catch {
        // Cache write failure is non-fatal.
    }
    transcriptSummaryCache.set(cacheKey, payload);
    return payload;
}
function loadSessionTranscriptPath(projectFp, sessionId) {
    const meta = readJsonFile(getSessionMetaPath(projectFp, sessionId));
    return isReadableFile(meta?.transcript_path) ? meta.transcript_path : null;
}
function findTranscriptPathBySessionId(sessionId) {
    if (transcriptPathCache.has(sessionId))
        return transcriptPathCache.get(sessionId) ?? null;
    const root = path.join(os.homedir(), '.claude', 'projects');
    let resolved = null;
    try {
        const entries = fs.readdirSync(root, { withFileTypes: true });
        for (const entry of entries) {
            if (!entry.isDirectory())
                continue;
            const candidate = path.join(root, entry.name, `${sessionId}.jsonl`);
            if (isReadableFile(candidate)) {
                resolved = candidate;
                break;
            }
        }
    }
    catch {
        resolved = null;
    }
    transcriptPathCache.set(sessionId, resolved);
    return resolved;
}
export function resolveTranscriptPathForSession(projectFp, sessionId, preferredPath) {
    if (isReadableFile(preferredPath))
        return preferredPath;
    const fromMeta = loadSessionTranscriptPath(projectFp, sessionId);
    if (fromMeta)
        return fromMeta;
    return findTranscriptPathBySessionId(sessionId);
}
export function loadTranscriptTurnSummaries(projectFp, sessionId, transcriptPath) {
    if (!isReadableFile(transcriptPath))
        return [];
    return loadTranscriptSummaryFromCache(projectFp, sessionId, transcriptPath)?.turns ?? [];
}
function compareCompletedTurns(left, right) {
    if (left.started_at !== right.started_at)
        return left.started_at.localeCompare(right.started_at);
    if (left.ended_at !== right.ended_at)
        return left.ended_at.localeCompare(right.ended_at);
    return left.turn_id.localeCompare(right.turn_id);
}
function applyTranscriptSummary(turn, transcriptPath, summary) {
    turn.transcript_path = turn.transcript_path ?? transcriptPath;
    turn.transcript_duration_seconds = summary.duration_seconds;
    turn.transcript_duration_source = summary.duration_source;
    turn.transcript_prompt_to_first_assistant_seconds = summary.prompt_to_first_assistant_seconds;
    turn.transcript_tool_seconds = summary.tool_seconds;
    turn.transcript_thinking_seconds = summary.thinking_seconds;
}
function aggregateTranscriptSummaries(summaries) {
    if (summaries.length === 0)
        return null;
    let totalDurationSeconds = 0;
    let hasDuration = false;
    let allTurnDuration = true;
    let totalToolSeconds = 0;
    let totalThinkingSeconds = 0;
    for (const summary of summaries) {
        if (typeof summary.duration_seconds === 'number' && Number.isFinite(summary.duration_seconds)) {
            totalDurationSeconds += Math.max(0, Math.round(summary.duration_seconds));
            hasDuration = true;
            if (summary.duration_source !== 'turn_duration')
                allTurnDuration = false;
        }
        else {
            allTurnDuration = false;
        }
        if (typeof summary.tool_seconds === 'number' && Number.isFinite(summary.tool_seconds)) {
            totalToolSeconds += Math.max(0, Math.round(summary.tool_seconds));
        }
        if (typeof summary.thinking_seconds === 'number' && Number.isFinite(summary.thinking_seconds)) {
            totalThinkingSeconds += Math.max(0, Math.round(summary.thinking_seconds));
        }
    }
    const first = summaries[0];
    const last = summaries[summaries.length - 1];
    return {
        started_at: first.started_at,
        started_at_ms: first.started_at_ms,
        ended_at: last.ended_at,
        duration_seconds: hasDuration ? totalDurationSeconds : null,
        duration_source: hasDuration ? (allTurnDuration ? 'turn_duration' : 'derived') : null,
        prompt_to_first_assistant_seconds: first.prompt_to_first_assistant_seconds,
        tool_seconds: totalToolSeconds,
        thinking_seconds: totalThinkingSeconds,
    };
}
function resolveTranscriptUpperBoundMs(turn, nextTurn) {
    const nextTurnStartedAtMs = nextTurn ? parseTimestampMs(nextTurn.started_at) : null;
    const turnEndedAtMs = parseTimestampMs(turn.ended_at);
    if (nextTurnStartedAtMs !== null && turnEndedAtMs !== null) {
        return Math.min(nextTurnStartedAtMs, turnEndedAtMs + TRANSCRIPT_MATCH_WINDOW_MS);
    }
    if (nextTurnStartedAtMs !== null)
        return nextTurnStartedAtMs;
    if (turnEndedAtMs !== null)
        return turnEndedAtMs + TRANSCRIPT_MATCH_WINDOW_MS;
    return Number.POSITIVE_INFINITY;
}
export function enrichCompletedTurnsWithTranscriptMetrics(projectFp, turns) {
    const bySession = new Map();
    for (const turn of turns) {
        if (turn.runner_kind !== 'main')
            continue;
        const sessionTurns = bySession.get(turn.session_id) ?? [];
        sessionTurns.push(turn);
        bySession.set(turn.session_id, sessionTurns);
    }
    for (const [sessionId, sessionTurns] of bySession) {
        const preferredPath = sessionTurns.find((turn) => typeof turn.transcript_path === 'string')?.transcript_path ?? null;
        const transcriptPath = resolveTranscriptPathForSession(projectFp, sessionId, preferredPath);
        if (!transcriptPath)
            continue;
        const summaries = loadTranscriptTurnSummaries(projectFp, sessionId, transcriptPath);
        if (summaries.length === 0)
            continue;
        const orderedTurns = sessionTurns.slice().sort(compareCompletedTurns);
        let cursor = 0;
        for (let turnIndex = 0; turnIndex < orderedTurns.length; turnIndex += 1) {
            const turn = orderedTurns[turnIndex];
            const turnStartedAtMs = parseTimestampMs(turn.started_at);
            if (turnStartedAtMs === null)
                continue;
            const upperBoundMs = resolveTranscriptUpperBoundMs(turn, orderedTurns[turnIndex + 1]);
            if (upperBoundMs <= turnStartedAtMs)
                continue;
            while (cursor < summaries.length && summaries[cursor].started_at_ms < turnStartedAtMs) {
                cursor += 1;
            }
            let summaryIndex = cursor;
            const matchedSummaries = [];
            while (summaryIndex < summaries.length) {
                const summary = summaries[summaryIndex];
                if (summary.started_at_ms >= upperBoundMs)
                    break;
                matchedSummaries.push(summary);
                summaryIndex += 1;
            }
            const aggregate = aggregateTranscriptSummaries(matchedSummaries);
            if (!aggregate)
                continue;
            applyTranscriptSummary(turn, transcriptPath, aggregate);
            cursor = summaryIndex;
        }
    }
    return turns;
}
//# sourceMappingURL=transcript-metrics.js.map