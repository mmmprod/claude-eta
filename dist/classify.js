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
export function classifyPrompt(prompt) {
    for (const [classification, pattern] of PATTERNS) {
        if (pattern.test(prompt)) {
            return classification;
        }
    }
    return 'other';
}
/** Conversational / continuation patterns — short acknowledgements, not new tasks.
 *  Also used by auto-eta.ts to skip ETA injection on conversational prompts. */
export const CONTINUATION_PATTERNS = /^(merci|thanks|thank you|ok|oui|yes|non|no|continue|go|go ahead|sure|d'accord|parfait|cool|nice|got it|understood|proceed|do it|vas-?y|c'est bon|exactement|exactly|right|correct|yep|yup|ouais|ça marche|good|great|bien|super|entendu|compris|allez|let's go|on y va|fais[- ]le|make it so|ship it|lgtm)[\s!.]*$/i;
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
export function summarizePrompt(prompt, maxLength = 80) {
    const firstLine = prompt.split('\n')[0].trim();
    if (!firstLine)
        return '(empty prompt)';
    if (firstLine.length <= maxLength)
        return firstLine;
    return firstLine.slice(0, maxLength - 3) + '...';
}
//# sourceMappingURL=classify.js.map