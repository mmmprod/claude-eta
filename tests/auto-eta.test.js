import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { checkDisableRequest, evaluateAutoEta, MIN_TYPE_TASKS, COOLDOWN_INTERVAL } from '../dist/auto-eta.js';
import { fmtSec } from '../dist/stats.js';

// -- Helpers --

function makeStats(cls, count, volatility = 'medium') {
  return {
    totalCompleted: count + 10,
    overall: { median: 60, p25: 50, p75: 80 },
    byClassification: [{ classification: cls, count, median: 60, p25: 50, p75: 80, volatility }],
  };
}

function baseParams(overrides = {}) {
  return {
    prefs: { auto_eta: true, prompts_since_last_eta: 0, last_eta_task_id: 'old-task' },
    stats: makeStats('bugfix', 10),
    etaAccuracy: {},
    classification: 'bugfix',
    prompt: 'fix the authentication bug in login handler',
    taskId: 'new-task',
    ...overrides,
  };
}

// -- checkDisableRequest (tests 1-6) --

describe('checkDisableRequest', () => {
  it('detects "stop auto-eta"', () => {
    assert.equal(checkDisableRequest('stop auto-eta'), true);
  });
  it('detects French disable', () => {
    assert.equal(checkDisableRequest("désactive l'auto eta"), true);
  });
  it('ignores "explain what eta means"', () => {
    assert.equal(checkDisableRequest('explain what eta means'), false);
  });
  it('ignores "what is the eta for this"', () => {
    assert.equal(checkDisableRequest('what is the eta for this'), false);
  });
  it('rejects coding task with auto-eta mention', () => {
    assert.equal(checkDisableRequest('remove the auto-eta module from the codebase'), false);
  });
  it('accepts simple disable request', () => {
    assert.equal(checkDisableRequest('stop auto-eta please'), true);
  });
});

// -- evaluateAutoEta conditions (tests 7-16) --

describe('evaluateAutoEta conditions', () => {
  it('skips when master switch off', () => {
    const r = evaluateAutoEta(baseParams({ prefs: { auto_eta: false, prompts_since_last_eta: 0 } }));
    assert.equal(r.action, 'skip');
  });
  it('skips when < MIN_TYPE_TASKS', () => {
    const r = evaluateAutoEta(baseParams({ stats: makeStats('bugfix', 3) }));
    assert.equal(r.action, 'skip');
  });
  it('does not skip when >= MIN_TYPE_TASKS', () => {
    const r = evaluateAutoEta(baseParams({ stats: makeStats('bugfix', MIN_TYPE_TASKS) }));
    assert.notEqual(r.action, 'skip');
  });
  it('injects for high volatility (not skip)', () => {
    const r = evaluateAutoEta(baseParams({ stats: makeStats('bugfix', 10, 'high') }));
    assert.equal(r.action, 'inject');
  });
  it('skips for classification "other"', () => {
    const r = evaluateAutoEta(baseParams({ classification: 'other', stats: makeStats('other', 10) }));
    assert.equal(r.action, 'skip');
  });
  it('skips for short prompt', () => {
    const r = evaluateAutoEta(baseParams({ prompt: 'fix it' }));
    assert.equal(r.action, 'skip');
  });
  it('skips for conversational prompt', () => {
    const r = evaluateAutoEta(baseParams({ prompt: 'merci beaucoup pour ton aide' }));
    assert.equal(r.action, 'skip');
  });
  it('skips when interval too wide', () => {
    const r = evaluateAutoEta(baseParams({
      stats: { totalCompleted: 20, overall: { median: 30, p25: 1, p75: 100 },
        byClassification: [{ classification: 'bugfix', count: 10, median: 30, p25: 1, p75: 100, volatility: 'high' }] },
    }));
    assert.equal(r.action, 'skip');
  });
  it('skips when type auto-disabled by accuracy', () => {
    const r = evaluateAutoEta(baseParams({ etaAccuracy: { bugfix: { hits: 4, misses: 7 } } }));
    assert.equal(r.action, 'skip');
  });
  it('injects when all conditions pass', () => {
    const r = evaluateAutoEta(baseParams());
    assert.equal(r.action, 'inject');
    assert.ok(r.injection.includes('[claude-eta auto-eta]'));
  });
});

// -- High volatility values (test 17) --

describe('high volatility adjustment', () => {
  it('uses 60% confidence and widens interval', () => {
    const r = evaluateAutoEta(baseParams({ stats: makeStats('bugfix', 10, 'high') }));
    assert.equal(r.action, 'inject');
    assert.ok(r.injection.includes('60%'));
  });
});

// -- Cooldown (tests 18-21) --

describe('cooldown', () => {
  it('injects on first prompt of new task', () => {
    const r = evaluateAutoEta(baseParams({
      prefs: { auto_eta: true, prompts_since_last_eta: 3, last_eta_task_id: 'old' }, taskId: 'new' }));
    assert.equal(r.action, 'inject');
  });
  it('returns cooldown on 2nd prompt same task', () => {
    const r = evaluateAutoEta(baseParams({
      prefs: { auto_eta: true, prompts_since_last_eta: 1, last_eta_task_id: 'same' }, taskId: 'same' }));
    assert.equal(r.action, 'cooldown');
  });
  it('injects when cooldown reached', () => {
    const r = evaluateAutoEta(baseParams({
      prefs: { auto_eta: true, prompts_since_last_eta: COOLDOWN_INTERVAL, last_eta_task_id: 'same' }, taskId: 'same' }));
    assert.equal(r.action, 'inject');
  });
  it('resets cooldown when task changes', () => {
    const r = evaluateAutoEta(baseParams({
      prefs: { auto_eta: true, prompts_since_last_eta: 2, last_eta_task_id: 'a' }, taskId: 'b' }));
    assert.equal(r.action, 'inject');
  });
});

// -- Format (test 22) --

describe('injection format', () => {
  it('contains formatted low, high, type, count', () => {
    const stats = makeStats('config', 8, 'low');
    const r = evaluateAutoEta(baseParams({ stats, classification: 'config' }));
    assert.equal(r.action, 'inject');
    assert.ok(r.injection.includes('config'));
    assert.ok(r.injection.includes('8 similar'));
    assert.ok(r.injection.includes(fmtSec(r.prediction.low)));
    assert.ok(r.injection.includes(fmtSec(r.prediction.high)));
  });
});
