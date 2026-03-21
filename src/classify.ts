import type { TaskClassification, ActiveTurnState } from './types.js';

/** Ordered by specificity — first match wins.
 *  Patterns include English + French to support multilingual prompts. */
const PATTERNS: [TaskClassification, RegExp][] = [
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

export function classifyPrompt(prompt: string): TaskClassification {
  for (const [classification, pattern] of PATTERNS) {
    if (pattern.test(prompt)) {
      return classification;
    }
  }
  return 'other';
}

/** Conversational / continuation patterns — short acknowledgements, not new tasks.
 *  Also used by auto-eta.ts to skip ETA injection on conversational prompts. */
export const CONTINUATION_PATTERNS =
  /^(merci|thanks|thank you|ok|oui|yes|non|no|continue|go|go ahead|sure|d'accord|parfait|cool|nice|got it|understood|proceed|do it|vas-?y|c'est bon|exactement|exactly|right|correct|yep|yup|ouais|ça marche|good|great|bien|super|entendu|compris|allez|let's go|on y va|fais[- ]le|make it so|ship it|lgtm)[\s!.]*$/i;

const SAME_WORK_ITEM_PATTERNS = [
  /^(continue(?:\s+(?:et|with))?|poursuis|keep going|still on|same\b|m[eê]me\b|also\b|ajoute aussi|add also|and also|without changing (?:the )?scope|sans changer le scope)/i,
  /\b(for the same (?:fix|task|issue)|same (?:fix|task|scope|issue|feature)|m[eê]me (?:fix|bug|scope|t[aâ]che|feature)|sur le m[eê]me (?:fix|bug|scope)|without changing (?:the )?scope|sans changer le scope|cas limites|edge cases)\b/i,
];

const EXPLICIT_RESET_PATTERNS =
  /^(new task|another task|something else|switch to|let'?s switch|on passe [àa]|passe [àa]|nouvelle? t[âa]che|autre sujet|change de sujet|nouveau sujet)\b/i;

export type PromptTransition = 'continuation' | 'same_work_item' | 'new_work_item';

/** Detect if a prompt is a continuation of the current work item (not a new task).
 *  Returns true only when there's an existing active turn AND the prompt looks
 *  like an acknowledgement / clarification rather than a new instruction. */
export function isContinuation(
  prompt: string,
  classification: TaskClassification,
  existingActive: ActiveTurnState | null,
): boolean {
  if (!existingActive) return false;

  const trimmed = prompt.trim();

  // Short conversational acknowledgements
  if (CONTINUATION_PATTERNS.test(trimmed)) return true;

  // Very short prompt classified as 'other' — likely a clarification, not a new task
  if (classification === 'other' && trimmed.length < 40) return true;

  return false;
}

export function decidePromptTransition(
  prompt: string,
  classification: TaskClassification,
  existingActive: ActiveTurnState | null,
): PromptTransition {
  if (!existingActive) return 'new_work_item';

  if (isContinuation(prompt, classification, existingActive)) return 'continuation';

  const trimmed = prompt.trim();
  if (EXPLICIT_RESET_PATTERNS.test(trimmed)) return 'new_work_item';
  if (SAME_WORK_ITEM_PATTERNS.some((pattern) => pattern.test(trimmed))) return 'same_work_item';

  return 'new_work_item';
}

export function summarizePrompt(prompt: string, maxLength = 80): string {
  const firstLine = prompt.split('\n')[0].trim();
  if (!firstLine) return '(empty prompt)';
  if (firstLine.length <= maxLength) return firstLine;
  return firstLine.slice(0, maxLength - 3) + '...';
}
