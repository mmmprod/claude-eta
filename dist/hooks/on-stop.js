import { readStdin } from '../stdin.js';
import { resolveProjectIdentity } from '../identity.js';
import { getActiveTurn, closeTurn, setActiveTurn } from '../event-store.js';
import { setLastCompletedV2, consumeLastEtaV2 } from '../ephemeral.js';
import { fmtSec } from '../stats.js';
import { getProjectStats } from '../stats-cache.js';
import { extractDurations, findBullshitEstimate, resolveDetectorReference } from '../detector.js';
import { updateEtaAccuracy } from '../project-meta.js';
import { detectRepairLoop } from '../loop-detector.js';
import { isEtaUpperBoundHit } from '../eta-accuracy.js';
import { appendProjectDebugLog } from '../debug-log.js';
function blockWithCorrection(reason) {
    process.stdout.write(JSON.stringify({ decision: 'block', reason }));
}
async function main() {
    const stdin = await readStdin();
    if (!stdin)
        return;
    const cwd = stdin.cwd;
    const sessionId = stdin.session_id;
    if (!cwd || !sessionId) {
        // Fallback: if no cwd/session, nothing to do
        return;
    }
    const agentKey = stdin.agent_id ?? 'main';
    const { fp } = resolveProjectIdentity(cwd);
    const active = getActiveTurn(fp, sessionId, agentKey);
    if (!active)
        return;
    // If stop hook already fired (correction delivered) or turn already in stop_blocked,
    // just close and return — prevents infinite loop.
    // MUST NOT throw here — an exception would re-trigger Stop, causing infinite loop.
    if (stdin.stop_hook_active || active.status === 'stop_blocked') {
        try {
            const savedFingerprints = active.error_fingerprints;
            const completed = closeTurn(fp, sessionId, agentKey, 'stop');
            if (completed) {
                recordRecap(fp, sessionId, completed, savedFingerprints);
            }
            consumeLastEtaV2(fp, sessionId);
        }
        catch (error) {
            appendProjectDebugLog(fp, 'stop-hook-errors.log', JSON.stringify({
                ts: new Date().toISOString(),
                session_id: sessionId,
                agent_key: agentKey,
                phase: 'stop_hook_active',
                error: error instanceof Error ? (error.stack ?? error.message) : String(error),
            }));
            // Swallow — loop prevention is more important than clean close
        }
        return;
    }
    // Store last_assistant_message on the active state
    if (stdin.last_assistant_message) {
        active.last_assistant_message = stdin.last_assistant_message;
    }
    if (stdin.transcript_path) {
        active.transcript_path = stdin.transcript_path;
    }
    // ── Loop detector (≥5 same errors → block) ─────────────────
    const loopResult = detectRepairLoop(active.error_fingerprints, 5);
    if (loopResult) {
        const reason = `[claude-eta] Repair loop detected: same error ${loopResult.count} times.\n` +
            `Error: "${loopResult.preview}"\n` +
            `Step back. Try a fundamentally different approach.`;
        active.status = 'stop_blocked';
        setActiveTurn(active);
        blockWithCorrection(reason);
        return;
    }
    // ── Bullshit detector ──────────────────────────────────────
    const message = stdin.last_assistant_message ?? '';
    if (message) {
        const stats = getProjectStats(cwd);
        if (stats) {
            // Resolve reference: classification-specific first, then global
            const ref = resolveDetectorReference(stats, active.classification);
            if (ref) {
                const durations = extractDurations(message, { estimatesOnly: true });
                const bullshit = findBullshitEstimate(durations, ref.p75, ref.median);
                if (bullshit) {
                    const reason = `[claude-eta] Time estimate correction: you said "${bullshit.raw}" ` +
                        `but project history shows ${ref.source} tasks take ${fmtSec(ref.p25)}–${fmtSec(ref.p75)} ` +
                        `(median ${fmtSec(ref.median)}, based on ${ref.count} tasks). ` +
                        `Please correct your time estimate to match the real data.`;
                    // Mark as stop_blocked to prevent infinite loop on next Stop
                    active.status = 'stop_blocked';
                    setActiveTurn(active);
                    blockWithCorrection(reason);
                    return;
                }
            }
        }
    }
    // ── Normal close ───────────────────────────────────────────
    const savedFingerprints = active.error_fingerprints;
    setActiveTurn(active);
    const completed = closeTurn(fp, sessionId, agentKey, 'stop');
    if (completed) {
        recordRecap(fp, sessionId, completed, savedFingerprints);
    }
    // Self-check Auto-ETA accuracy
    if (completed) {
        const lastEta = consumeLastEtaV2(fp, sessionId);
        if (lastEta && lastEta.task_id === completed.work_item_id) {
            const hit = isEtaUpperBoundHit(completed.wall_seconds, lastEta);
            updateEtaAccuracy(fp, completed.classification, hit);
        }
    }
}
/** Record a recap from the completed turn for the next prompt to pick up */
function recordRecap(projectFp, sessionId, completed, errorFingerprints) {
    setLastCompletedV2(projectFp, sessionId, {
        classification: completed.classification,
        duration_seconds: completed.wall_seconds,
        tool_calls: completed.tool_calls,
        files_read: completed.files_read,
        files_edited: completed.files_edited,
        files_created: completed.files_created,
        loop_error_fingerprints: errorFingerprints?.length ? errorFingerprints : undefined,
    });
}
void main();
//# sourceMappingURL=on-stop.js.map