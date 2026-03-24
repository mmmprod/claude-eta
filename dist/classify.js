/** Ordered by specificity — first match wins.
 *  Patterns include English + French to support multilingual prompts. */
const PATTERNS = [
    [
        'bugfix',
        /\b(fix(e[ds]|ing)?|bugs?|issues?|errors?|broken|crash(e[ds]|ing)?|wrong|fail(ed|ing|ure|s)?|patch(e[ds]|ing)?|hotfix|regression|corrig(e[rs]?|é[es]?)|répare[rs]?|cassé[es]?|erreurs?|plantage|souci|problème|marche pas|fonctionne pas)\b/i,
    ],
    [
        'test',
        /\b(tests?|testing|specs?|jest|vitest|playwright|e2e|coverage|assertions?|mocks?|mocking|tester|vérifie[rs]?)\b/i,
    ],
    [
        'debug',
        /\b(debug(ging|ged)?|logging|trace|investigate|diagnose|pkoi|pourquoi.*(marche|fonctionne|affiche|vois)|je ne vois pas|ça (marche|affiche|fonctionne) pas)\b/i,
    ],
    [
        'refactor',
        /\b(refactor(ing|ed)?|rename[ds]?|extract(ing|ed)?|move[ds]?|split|merge[ds]?|clean(ing|ed|up)?|simplif(y|ied|ying)|reorganize[ds]?|restructure[ds]?|réorganise[rs]?|simplifi(e[rs]?|é)|nettoy(e[rs]?|é)|déplac(e[rs]?|é))\b/i,
    ],
    ['docs', /\b(docs?|readme|comments?|jsdoc|typedoc|changelog|documentation|documente[rs]?)\b/i],
    [
        'config',
        /\b(config(ure)?|setup|install(ing|ed|s)?|deps?|dependenc(y|ies)|eslint|prettier|tsconfig|package\.json|ci|cd|pipeline|docker|env|installe[rs]?|configure[rs]?|mise en place)\b/i,
    ],
    [
        'review',
        /\b(review(ing|ed|s)?|pr|pull.?request|audit(ing|ed)?|inspect(ing)?|relis|vérifie|regarde.*(code|changement))\b/i,
    ],
    [
        'feature',
        /\b(add(ing|ed|s)?|creat(e[ds]?|ing)|implement(ing|ed|s)?|build(ing|s)?|new|feature|component|page|endpoint|api|hook|integrat(e[ds]?|ing)|ajout(e[rs]?|é)?|crée[rs]?|implémente[rs]?|construi[ts]?|fai[ts]? (un|une|le|la|des|les|moi)|génère|développe[rs]?|met[ts]?\s+(en place|un |une ))\b/i,
    ],
];
const SLASH_COMMAND_UTILITY_PATTERNS = [
    /^\/eta(?:\s|$)/i,
    /^\/using-superpowers(?:\s|$)/i,
    /^\/superpowers(?:\s|$)/i,
    /^\/bmad-help(?:\s|$)/i,
];
const SLASH_COMMAND_TOKEN_FALLBACKS = [
    [
        'review',
        /(?:^|[-/])(review|audit|validate|validation|readiness|check-implementation-readiness|check-readiness)(?:$|[-/])/i,
    ],
    ['refactor', /(?:^|[-/])(simplify|refactor|cleanup|clean-up)(?:$|[-/])/i],
    ['test', /(?:^|[-/])(test|tests|qa|e2e|tdd|atdd)(?:$|[-/])/i],
    ['debug', /(?:^|[-/])(debug|diagnose|diagnostic|investigate|investigation)(?:$|[-/])/i],
    ['bugfix', /(?:^|[-/])(bugfix|hotfix|fix|patch|repair)(?:$|[-/])/i],
    [
        'feature',
        /(?:^|[-/])(batch|dev|quick-dev|dev-story|implement|implementation|build|builder|agent-builder|workflow-builder|create|generate|workflow)(?:$|[-/])/i,
    ],
    [
        'docs',
        /(?:^|[-/])(prd|architecture|architect|ux|design|epics|stories|story|planning|plan|sprint-planning|retrospective|retro|context|brief|spec|specs|docs|documentation|research|analysis|strategy|roadmap|market|product)(?:$|[-/])/i,
    ],
];
function extractSlashCommandToken(prompt) {
    const token = prompt.trim().split(/\s+/, 1)[0]?.toLowerCase() ?? '';
    return token.startsWith('/') ? token : null;
}
function classifySlashCommandFallback(prompt) {
    const token = extractSlashCommandToken(prompt);
    if (!token)
        return null;
    if (SLASH_COMMAND_UTILITY_PATTERNS.some((pattern) => pattern.test(token)))
        return null;
    for (const [classification, pattern] of SLASH_COMMAND_TOKEN_FALLBACKS) {
        if (pattern.test(token))
            return classification;
    }
    return null;
}
export function classifyPrompt(prompt) {
    for (const [classification, pattern] of PATTERNS) {
        if (pattern.test(prompt)) {
            return classification;
        }
    }
    const slashFallback = classifySlashCommandFallback(prompt);
    if (slashFallback)
        return slashFallback;
    return 'other';
}
/** Recover useful classifications from stored prompt summaries when older data was persisted as "other". */
export function normalizeStoredClassification(classification, promptSummary) {
    if (classification !== 'other')
        return classification;
    const inferred = classifyPrompt(promptSummary);
    return inferred === 'other' ? classification : inferred;
}
/** Conversational / continuation patterns — short acknowledgements, not new tasks.
 *  Also used by auto-eta.ts to skip ETA injection on conversational prompts. */
export const CONTINUATION_PATTERNS = /^(merci|thanks|thank you|ok|oui|yes|non|no|continue|go|go ahead|sure|d'accord|parfait|cool|nice|got it|understood|proceed|do it|vas-?y|c'est bon|exactement|exactly|right|correct|yep|yup|ouais|ça marche|good|great|bien|super|entendu|compris|allez|let's go|on y va|fais[- ]le|make it so|ship it|lgtm)[\s!.]*$/i;
// Weak patterns — conversational additive hints. They should never decide alone.
const WEAK_SAME_PATTERNS = [
    /^(continue(?:\s+(?:et|with))?|poursuis|keep going|still on|same\b|m[eê]me\b|also\b|ajoute aussi|add also|and also)/i,
];
// Strong patterns — always bypass scoring (explicit "same task/fix" intent)
const STRONG_SAME_PATTERNS = [
    /\b(for the same (?:fix|task|issue)|same (?:fix|task|scope|issue|feature)|m[eê]me (?:fix|bug|scope|t[aâ]che|feature)|sur le m[eê]me (?:fix|bug|scope)|without changing (?:the )?scope|sans changer le scope|cas limites|edge cases)\b/i,
];
const EXPLICIT_RESET_PATTERNS = /^(new task|another task|something else|switch to|let'?s switch|on passe [àa]|passe [àa]|nouvelle? t[âa]che|autre sujet|change de sujet|nouveau sujet)\b/i;
const SAME_WORK_ITEM_THRESHOLD = 0.5;
const WEAK_PATTERN_SCORE_BONUS = 0.1;
const CROSS_CLASSIFICATION_SCORE_PENALTY = 0.1;
/** Detect if a prompt is a continuation of the current work item (not a new task).
 *  Returns true only when there's an existing active turn AND the prompt looks
 *  like an acknowledgement / clarification rather than a new instruction. */
export function isContinuation(prompt, classification, existingActive) {
    if (!existingActive)
        return false;
    const trimmed = prompt.trim();
    // Short conversational acknowledgements
    if (CONTINUATION_PATTERNS.test(trimmed))
        return true;
    // Very short prompt classified as 'other' — likely a clarification, not a new task
    if (classification === 'other' && trimmed.length < 40)
        return true;
    return false;
}
export function decidePromptTransition(prompt, classification, existingActive) {
    if (!existingActive)
        return 'new_work_item';
    if (isContinuation(prompt, classification, existingActive))
        return 'continuation';
    const trimmed = prompt.trim();
    // Explicit reset always wins
    if (EXPLICIT_RESET_PATTERNS.test(trimmed))
        return 'new_work_item';
    // Strong same-work-item patterns always bypass scoring
    if (STRONG_SAME_PATTERNS.some((p) => p.test(trimmed)))
        return 'same_work_item';
    const hasWeakSameSignal = WEAK_SAME_PATTERNS.some((p) => p.test(trimmed));
    // Similarity fallback: weak patterns are only a score bonus, never a verdict.
    let score = computeSimilarityScore(prompt, classification, existingActive.classification, existingActive.prompt_summary ?? '');
    if (hasWeakSameSignal)
        score += WEAK_PATTERN_SCORE_BONUS;
    if (classification !== existingActive.classification)
        score -= CROSS_CLASSIFICATION_SCORE_PENALTY;
    score = Math.max(0, Math.min(score, 1));
    if (score >= SAME_WORK_ITEM_THRESHOLD)
        return 'same_work_item';
    // Different classification → new work item
    return 'new_work_item';
}
// ── Similarity scoring ────────────────────────────────────────
const ADDITIVE_MARKERS = /\b(also|aussi|ensuite|and also|ajoute aussi|même fix|same fix|for this fix|pour ce fix|sur le même)\b/i;
/** Common short words that inflate Jaccard similarity without indicating topic overlap.
 *  Classification markers (fix, bug) are excluded because they match across unrelated tasks. */
const SIMILARITY_STOP_WORDS = new Set([
    'the',
    'and',
    'for',
    'not',
    'but',
    'can',
    'has',
    'was',
    'are',
    'all',
    'any',
    'its',
    'fix',
    'bug',
    'les',
    'des',
    'une',
    'par',
    'sur',
    'que',
    'qui',
    'est',
    'dans',
]);
/** Extract content words (>2 chars, lowercased, excluding stop words) as a Set for Jaccard comparison.
 *  Threshold of 2 keeps short technical terms (api, css, sql, tsx, url). */
function contentWords(text) {
    return new Set(text
        .toLowerCase()
        .split(/\W+/)
        .filter((w) => w.length > 2 && !SIMILARITY_STOP_WORDS.has(w)));
}
/** Compute similarity between a new prompt and an existing turn (0 to 1).
 *  Used as a fallback when regex patterns don't match in decidePromptTransition. */
export function computeSimilarityScore(prompt, promptClassification, existingClassification, existingPromptSummary) {
    let score = 0;
    // Same classification: +0.15
    if (promptClassification === existingClassification)
        score += 0.15;
    // Word overlap (Jaccard on content words 3+ chars, lowercased, stop words excluded): up to +0.5
    const wordsA = contentWords(prompt);
    const wordsB = contentWords(existingPromptSummary);
    if (wordsA.size > 0 && wordsB.size > 0) {
        let intersection = 0;
        for (const w of wordsA)
            if (wordsB.has(w))
                intersection++;
        const union = new Set([...wordsA, ...wordsB]).size;
        score += (intersection / union) * 0.5;
    }
    // Additive markers: +0.2
    if (ADDITIVE_MARKERS.test(prompt))
        score += 0.2;
    return Math.min(score, 1.0);
}
export function summarizePrompt(prompt, maxLength = 80) {
    const firstLine = prompt.split('\n')[0].trim();
    if (!firstLine)
        return '(empty prompt)';
    if (firstLine.length <= maxLength)
        return firstLine;
    return firstLine.slice(0, maxLength - 3) + '...';
}
//# sourceMappingURL=classify.js.map