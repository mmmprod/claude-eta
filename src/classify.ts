import type { TaskClassification } from './types.js';

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

export function summarizePrompt(prompt: string, maxLength = 80): string {
  const firstLine = prompt.split('\n')[0].trim();
  if (!firstLine) return '(empty prompt)';
  if (firstLine.length <= maxLength) return firstLine;
  return firstLine.slice(0, maxLength - 3) + '...';
}
