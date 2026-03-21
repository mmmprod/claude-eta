import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { classifyPrompt, summarizePrompt, decidePromptTransition, computeSimilarityScore } from '../dist/classify.js';

function makeActiveTurn(overrides = {}) {
  const now = Date.now();
  return {
    turn_id: 'turn-1',
    work_item_id: 'wi-1',
    session_id: 'sess-1',
    agent_key: 'main',
    agent_id: null,
    agent_type: null,
    runner_kind: 'main',
    project_fp: 'fp-1',
    project_display_name: 'test-project',
    classification: 'bugfix',
    prompt_summary: 'fix auth bug',
    prompt_complexity: 2,
    started_at: new Date(now).toISOString(),
    started_at_ms: now,
    tool_calls: 0,
    files_read: 0,
    files_edited: 0,
    files_created: 0,
    unique_files: 0,
    bash_calls: 0,
    bash_failures: 0,
    grep_calls: 0,
    glob_calls: 0,
    errors: 0,
    first_tool_at_ms: null,
    first_edit_at_ms: null,
    first_bash_at_ms: null,
    last_event_at_ms: null,
    last_assistant_message: null,
    model: null,
    source: null,
    status: 'active',
    path_fps: [],
    error_fingerprints: [],
    ...overrides,
  };
}

describe('classifyPrompt', () => {
  it('classifies bugfix prompts', () => {
    assert.equal(classifyPrompt('fix the login bug'), 'bugfix');
    assert.equal(classifyPrompt('this button is broken'), 'bugfix');
    assert.equal(classifyPrompt('patch the auth issue'), 'bugfix');
    assert.equal(classifyPrompt('the build is failing'), 'bugfix');
  });

  it('classifies feature prompts', () => {
    assert.equal(classifyPrompt('add a new search component'), 'feature');
    assert.equal(classifyPrompt('create a user dashboard'), 'feature');
    assert.equal(classifyPrompt('implement pagination'), 'feature');
    assert.equal(classifyPrompt('build the API endpoint'), 'feature');
  });

  it('classifies refactor prompts', () => {
    assert.equal(classifyPrompt('refactor the auth module'), 'refactor');
    assert.equal(classifyPrompt('rename this function'), 'refactor');
    assert.equal(classifyPrompt('extract this into a helper'), 'refactor');
    assert.equal(classifyPrompt('simplify the logic'), 'refactor');
  });

  it('classifies test prompts', () => {
    assert.equal(classifyPrompt('write tests for the API'), 'test');
    assert.equal(classifyPrompt('add jest coverage'), 'test');
    assert.equal(classifyPrompt('run the e2e suite'), 'test');
  });

  it('classifies debug prompts', () => {
    assert.equal(classifyPrompt('debug this function'), 'debug');
    assert.equal(classifyPrompt('investigate the memory leak'), 'debug');
    assert.equal(classifyPrompt('add some logging'), 'debug');
  });

  it('does not classify bare "why" as debug (F-10)', () => {
    assert.equal(classifyPrompt('why is the sky blue'), 'other');
    assert.equal(classifyPrompt('why is this slow'), 'other');
  });

  it('does not classify "look at" as review (F-11)', () => {
    assert.equal(classifyPrompt('look at this feature'), 'feature');
    assert.equal(classifyPrompt('look at this'), 'other');
  });

  it('classifies config prompts', () => {
    assert.equal(classifyPrompt('update the eslint config'), 'config');
    assert.equal(classifyPrompt('setup docker'), 'config');
    assert.equal(classifyPrompt('install new deps'), 'config');
  });

  it('classifies docs prompts', () => {
    assert.equal(classifyPrompt('update the readme'), 'docs');
    assert.equal(classifyPrompt('add documentation'), 'docs');
    assert.equal(classifyPrompt('write a changelog entry'), 'docs');
  });

  it('classifies review prompts', () => {
    assert.equal(classifyPrompt('review this PR'), 'review');
    assert.equal(classifyPrompt('audit the security code'), 'review');
  });

  it('does not classify bare "check" as review (F-12)', () => {
    assert.equal(classifyPrompt('check the deployment'), 'other');
    assert.equal(classifyPrompt('check if this works'), 'other');
  });

  it('falls back to other', () => {
    assert.equal(classifyPrompt('hello'), 'other');
    assert.equal(classifyPrompt('what time is it'), 'other');
    assert.equal(classifyPrompt(''), 'other');
  });

  it('uses first match priority (bugfix > feature for "fix")', () => {
    // "fix" matches bugfix before feature's "add"
    assert.equal(classifyPrompt('fix and add something'), 'bugfix');
  });
});

describe('summarizePrompt', () => {
  it('returns short prompts as-is', () => {
    assert.equal(summarizePrompt('fix the bug'), 'fix the bug');
  });

  it('truncates long prompts', () => {
    const long = 'a'.repeat(100);
    const result = summarizePrompt(long);
    assert.equal(result.length, 80);
    assert.ok(result.endsWith('...'));
  });

  it('takes only the first line', () => {
    assert.equal(summarizePrompt('first line\nsecond line\nthird'), 'first line');
  });

  it('handles empty prompts', () => {
    assert.equal(summarizePrompt(''), '(empty prompt)');
  });

  it('trims whitespace', () => {
    assert.equal(summarizePrompt('  hello  '), 'hello');
  });

  it('respects custom maxLength', () => {
    const result = summarizePrompt('a'.repeat(50), 20);
    assert.equal(result.length, 20);
    assert.ok(result.endsWith('...'));
  });
});

describe('decidePromptTransition', () => {
  it('returns continuation for short acknowledgements', () => {
    const existing = makeActiveTurn();
    assert.equal(decidePromptTransition('ok', classifyPrompt('ok'), existing), 'continuation');
  });

  it('reuses the same work item for long additive continuations', () => {
    const existing = makeActiveTurn();
    const prompt = 'continue et gere aussi les cas limites du parser sans casser les hooks existants';
    assert.equal(decidePromptTransition(prompt, classifyPrompt(prompt), existing), 'same_work_item');
  });

  it('reuses the same work item for same-fix follow-ups', () => {
    const existing = makeActiveTurn();
    const prompt = 'ajoute aussi les tests pour le meme fix sans changer le scope';
    assert.equal(decidePromptTransition(prompt, classifyPrompt(prompt), existing), 'same_work_item');
  });

  it('starts a new work item for explicit topic switches', () => {
    const existing = makeActiveTurn();
    const prompt = 'switch to the billing issue';
    assert.equal(decidePromptTransition(prompt, classifyPrompt(prompt), existing), 'new_work_item');
  });

  it('starts a new work item when no active turn exists', () => {
    const prompt = 'continue et gere aussi les cas limites';
    assert.equal(decidePromptTransition(prompt, classifyPrompt(prompt), null), 'new_work_item');
  });

  it('same classification defaults to same_work_item', () => {
    const existing = makeActiveTurn({ classification: 'bugfix' });
    assert.equal(
      decidePromptTransition('tu peux aussi couvrir le cas où session_id manque dans Stop ?', 'bugfix', existing),
      'same_work_item',
    );
  });

  it('follow-up bugfix prompt stays same work item', () => {
    const existing = makeActiveTurn({ classification: 'bugfix' });
    assert.equal(
      decidePromptTransition('gère aussi les erreurs réseau dans compare', 'bugfix', existing),
      'same_work_item',
    );
  });

  it('follow-up with SQL migration stays same work item', () => {
    const existing = makeActiveTurn({ classification: 'bugfix' });
    assert.equal(
      decidePromptTransition('ensuite fais la migration SQL correspondante pour ce fix', 'bugfix', existing),
      'same_work_item',
    );
  });

  it('different classification triggers new work item', () => {
    const existing = makeActiveTurn({ classification: 'bugfix' });
    assert.equal(
      decidePromptTransition('add a new dashboard page for user metrics', 'feature', existing),
      'new_work_item',
    );
  });

  it('explicit reset overrides same classification', () => {
    const existing = makeActiveTurn({ classification: 'bugfix' });
    assert.equal(decidePromptTransition('new task: fix the other unrelated bug', 'bugfix', existing), 'new_work_item');
  });

  it('same classification works across non-bugfix types', () => {
    const existing = makeActiveTurn({ classification: 'feature' });
    assert.equal(decidePromptTransition('also add a sidebar to the dashboard', 'feature', existing), 'same_work_item');
  });
});

describe('computeSimilarityScore', () => {
  it('scores same classification + additive marker high', () => {
    const score = computeSimilarityScore('gère aussi les erreurs réseau dans compare', 'bugfix', 'bugfix', 'fix auth bug');
    assert.ok(score >= 0.5, `expected >= 0.5 but got ${score}`);
  });

  it('scores different classification + no overlap low', () => {
    const score = computeSimilarityScore('completely unrelated new feature', 'feature', 'bugfix', 'fix auth bug');
    assert.ok(score < 0.5, `expected < 0.5 but got ${score}`);
  });

  it('scores same classification + high word overlap high', () => {
    const score = computeSimilarityScore(
      'fix the remaining auth validation errors',
      'bugfix',
      'bugfix',
      'fix auth validation bug',
    );
    assert.ok(score >= 0.5, `expected >= 0.5 but got ${score}`);
  });

  it('caps at 1.0', () => {
    const score = computeSimilarityScore(
      'also fix the same auth validation bug in the same module',
      'bugfix',
      'bugfix',
      'fix the same auth validation bug in the same module',
    );
    assert.ok(score <= 1.0, `expected <= 1.0 but got ${score}`);
  });
});

describe('decidePromptTransition — similarity fallback', () => {
  it('additive marker + same classification → same_work_item', () => {
    const existing = makeActiveTurn({ classification: 'bugfix', prompt_summary: 'fix compare command' });
    const prompt = 'gère aussi les erreurs réseau dans compare';
    assert.equal(decidePromptTransition(prompt, classifyPrompt(prompt), existing), 'same_work_item');
  });

  it('ensuite + pour ce fix → same_work_item', () => {
    const existing = makeActiveTurn({ classification: 'bugfix', prompt_summary: 'fix database schema' });
    const prompt = 'ensuite fais la migration SQL correspondante pour ce fix';
    assert.equal(decidePromptTransition(prompt, classifyPrompt(prompt), existing), 'same_work_item');
  });

  it('completely unrelated prompt → new_work_item', () => {
    const existing = makeActiveTurn({ classification: 'bugfix', prompt_summary: 'fix auth bug' });
    const prompt = 'create a brand new analytics dashboard page with charts';
    assert.equal(decidePromptTransition(prompt, classifyPrompt(prompt), existing), 'new_work_item');
  });

  it('same classification + high word overlap without additive markers → same_work_item', () => {
    const existing = makeActiveTurn({
      classification: 'bugfix',
      prompt_summary: 'fix auth validation errors in login handler',
    });
    const prompt = 'handle the remaining auth validation errors in the login handler';
    assert.equal(decidePromptTransition(prompt, classifyPrompt(prompt), existing), 'same_work_item');
  });
});
