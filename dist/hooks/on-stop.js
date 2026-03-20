import { readStdin } from '../stdin.js';
import { resolveProjectIdentity } from '../identity.js';
import { getActiveTurn, closeTurn, setActiveTurn } from '../event-store.js';
import { loadCompletedTurnsCompat, turnsToTaskEntries } from '../compat.js';
import { setLastCompleted, consumeLastEta } from '../store.js';
import { computeStats, fmtSec } from '../stats.js';
import { extractDurations, findBullshitEstimate, resolveDetectorReference } from '../detector.js';
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
            const completed = closeTurn(fp, sessionId, agentKey, 'stop');
            if (completed) {
                recordRecap(completed);
            }
            consumeLastEta();
        }
        catch {
            // Swallow — loop prevention is more important than clean close
        }
        return;
    }
    // Store last_assistant_message on the active state
    if (stdin.last_assistant_message) {
        active.last_assistant_message = stdin.last_assistant_message;
    }
    // ── Bullshit detector ──────────────────────────────────────
    const message = stdin.last_assistant_message ?? '';
    if (message) {
        const turns = loadCompletedTurnsCompat(cwd);
        const tasks = turnsToTaskEntries(turns);
        const stats = computeStats(tasks);
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
    const completed = closeTurn(fp, sessionId, agentKey, 'stop');
    if (completed) {
        recordRecap(completed);
    }
    // Self-check Auto-ETA accuracy
    if (completed) {
        const lastEta = consumeLastEta();
        if (lastEta && lastEta.task_id === completed.turn_id) {
            const hit = completed.wall_seconds >= lastEta.low && completed.wall_seconds <= lastEta.high;
            // TODO: migrate eta_accuracy to v2 cache in Phase 9
            // For now we just consume the prediction
            void hit;
        }
    }
}
/** Record a recap from the completed turn for the next prompt to pick up */
function recordRecap(completed) {
    setLastCompleted({
        classification: completed.classification,
        duration_seconds: completed.wall_seconds,
        tool_calls: completed.tool_calls,
        files_read: completed.files_read,
        files_edited: completed.files_edited,
        files_created: completed.files_created,
    });
}
void main();
//# sourceMappingURL=on-stop.js.map