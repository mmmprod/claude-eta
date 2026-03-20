/**
 * UserPromptSubmit hook — marks the start of a new task.
 * Reads the user's prompt, classifies it, creates a task entry.
 * Injects project velocity stats as additionalContext to calibrate Claude.
 */
import * as crypto from 'node:crypto';
import * as path from 'node:path';
import { readStdin } from '../stdin.js';
import { loadProject, addTask, setActiveTask, flushActiveTask, consumeLastCompleted, loadPreferences, savePreferences, setLastEta, } from '../store.js';
import { checkDisableRequest, evaluateAutoEta } from '../auto-eta.js';
import { classifyPrompt, summarizePrompt } from '../classify.js';
import { computeStats, formatStatsContext, estimateTask, scorePromptComplexity, getDefaultEstimate, formatColdStartContext, formatTaskRecap, } from '../stats.js';
function projectName(cwd) {
    if (!cwd)
        return 'unknown';
    return path.basename(cwd);
}
/** Output hook response with optional additionalContext */
function respond(additionalContext) {
    if (!additionalContext)
        return;
    const response = {
        hookSpecificOutput: {
            hookEventName: 'UserPromptSubmit',
            additionalContext,
        },
    };
    process.stdout.write(JSON.stringify(response));
}
async function main() {
    const stdin = await readStdin();
    if (!stdin)
        return;
    const project = projectName(stdin.cwd);
    const prompt = stdin.prompt ?? '';
    // Close previous active task if any
    flushActiveTask();
    // Pick up recap from the last completed task (consume-once)
    const lastCompleted = consumeLastCompleted();
    // Load project data for stats BEFORE adding the new task
    const data = loadProject(project);
    const stats = computeStats(data.tasks);
    // Create new task
    const taskId = crypto.randomUUID();
    const task = {
        task_id: taskId,
        session_id: stdin.session_id ?? 'unknown',
        project,
        timestamp_start: new Date().toISOString(),
        timestamp_end: null,
        duration_seconds: null,
        prompt_summary: summarizePrompt(prompt),
        classification: classifyPrompt(prompt),
        tool_calls: 0,
        files_read: 0,
        files_edited: 0,
        files_created: 0,
        errors: 0,
        model: stdin.model?.display_name ?? stdin.model?.id ?? 'unknown',
    };
    addTask(project, task);
    setActiveTask(project, taskId);
    // Build context: optional recap + stats or cold-start baselines
    const contextParts = [];
    if (lastCompleted) {
        contextParts.push(formatTaskRecap(lastCompleted));
    }
    const complexity = scorePromptComplexity(prompt);
    if (stats) {
        // Calibrated path — real project data
        const estimate = estimateTask(stats, task.classification, complexity);
        contextParts.push(formatStatsContext(stats, estimate));
    }
    else {
        // Cold start — generic baselines
        const completedCount = data.tasks.filter((t) => t.duration_seconds != null).length;
        const estimate = getDefaultEstimate(task.classification, complexity);
        contextParts.push(formatColdStartContext(estimate, completedCount));
    }
    // Auto-ETA evaluation (only when calibrated)
    if (stats) {
        const prefs = loadPreferences();
        if (checkDisableRequest(prompt)) {
            prefs.auto_eta = false;
            savePreferences(prefs);
            contextParts.push('[claude-eta] Auto-ETA disabled. Re-enable anytime with /eta auto on.');
        }
        else {
            const decision = evaluateAutoEta({
                prefs,
                stats,
                etaAccuracy: data.eta_accuracy ?? {},
                classification: task.classification,
                prompt,
                taskId,
            });
            switch (decision.action) {
                case 'inject':
                    contextParts.push(decision.injection);
                    setLastEta(decision.prediction);
                    prefs.prompts_since_last_eta = 0;
                    prefs.last_eta_task_id = taskId;
                    savePreferences(prefs);
                    break;
                case 'cooldown':
                    prefs.prompts_since_last_eta++;
                    savePreferences(prefs);
                    break;
                // 'skip': no action
            }
        }
    }
    respond(contextParts.join('\n'));
}
void main();
//# sourceMappingURL=on-prompt.js.map