import type { TaskClassification } from './types.js';

/** Ordered by specificity — first match wins */
const PATTERNS: [TaskClassification, RegExp][] = [
  [
    'bugfix',
    /\b(fix(e[ds]|ing)?|bugs?|issues?|errors?|broken|crash(e[ds]|ing)?|wrong|fail(ed|ing|ure|s)?|patch(e[ds]|ing)?|hotfix|regression)\b/i,
  ],
  ['test', /\b(tests?|testing|specs?|jest|vitest|playwright|e2e|coverage|assertions?|mocks?|mocking)\b/i],
  ['debug', /\b(debug(ging|ged)?|logging|trace|investigate|diagnose|why)\b/i],
  [
    'refactor',
    /\b(refactor(ing|ed)?|rename[ds]?|extract(ing|ed)?|move[ds]?|split|merge[ds]?|clean(ing|ed|up)?|simplif(y|ied|ying)|reorganize[ds]?|restructure[ds]?)\b/i,
  ],
  ['docs', /\b(docs?|readme|comments?|jsdoc|typedoc|changelog|documentation)\b/i],
  [
    'config',
    /\b(config(ure)?|setup|install(ing|ed|s)?|deps?|dependenc(y|ies)|eslint|prettier|tsconfig|package\.json|ci|cd|pipeline|docker|env)\b/i,
  ],
  ['review', /\b(review(ing|ed|s)?|pr|pull.?request|audit(ing|ed)?|check(ing)?|inspect(ing)?|look.?at)\b/i],
  [
    'feature',
    /\b(add(ing|ed|s)?|creat(e[ds]?|ing)|implement(ing|ed|s)?|build(ing|s)?|new|feature|component|page|endpoint|api|hook|integrat(e[ds]?|ing))\b/i,
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
