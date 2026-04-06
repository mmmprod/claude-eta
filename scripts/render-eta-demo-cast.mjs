#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';

const outputPath = process.argv[2] ?? path.join(process.cwd(), 'docs', 'eta-demo.cast');

const events = [];
let t = 0;

const CRLF = '\r\n';

function roundTime(value) {
  return Math.round(value * 1_000_000) / 1_000_000;
}

function emit(text) {
  events.push([roundTime(t), 'o', text]);
}

function pause(seconds) {
  t += seconds;
}

function typeText(text, delay = 0.04) {
  for (const char of text) {
    emit(char);
    pause(delay);
  }
}

emit('\u001b[2J\u001b[H' + CRLF);
emit('\u001b[1mclaude-eta demo\u001b[0m — real project, real data' + CRLF);
emit('─────────────────────────────────────────────────' + CRLF + CRLF);
pause(1);

emit('\u001b[0;32m❯\u001b[0m ');
typeText('add pagination to the /api/tasks endpoint');
pause(0.5);
emit(CRLF + CRLF);
pause(0.3);

emit('\u001b[0;36m⏱ Estimated: 4m–12m\u001b[0m \u001b[2m(75%, based on 14 similar feature tasks)\u001b[0m' + CRLF + CRLF);
pause(1.5);

emit('\u001b[2m  Reading src/api/tasks.ts...\u001b[0m' + CRLF);
pause(0.3);
emit('\u001b[2m  Reading src/types/pagination.ts...\u001b[0m' + CRLF);
pause(0.3);
emit('\u001b[2m  Editing src/api/tasks.ts (+28 lines)...\u001b[0m' + CRLF);
pause(0.4);
emit('\u001b[2m  Editing src/api/tasks.test.ts (+45 lines)...\u001b[0m' + CRLF);
pause(0.4);
emit('\u001b[2m  Running npm test...\u001b[0m' + CRLF);
pause(0.8);
emit('\u001b[0;32m  ✓ 12 tests passed\u001b[0m' + CRLF + CRLF);
pause(1.8);

emit('\u001b[0;32m❯\u001b[0m ');
typeText('/eta stats');
emit(CRLF + CRLF);
pause(0.5);

emit('\u001b[1mStats by Task Type (47 total)\u001b[0m' + CRLF + CRLF);
emit('  Type       Count   Median   Range' + CRLF);
emit('  ─────────  ─────   ──────   ──────────' + CRLF);
emit('  feature       14   \u001b[1m8m\u001b[0m       4m–12m' + CRLF);
emit('  bugfix        15   \u001b[1m4m\u001b[0m       1m–9m' + CRLF);
emit('  refactor       8   \u001b[1m11m\u001b[0m      5m–22m' + CRLF);
emit('  config         6   \u001b[1m2m\u001b[0m       30s–5m' + CRLF);
emit('  docs           4   \u001b[1m3m\u001b[0m       1m–8m' + CRLF + CRLF);
pause(2);

emit('─────────────────────────────────────────────────' + CRLF);
emit('\u001b[1mClaude guesses. claude-eta measures.\u001b[0m' + CRLF + CRLF);
pause(2);

const header = {
  version: 2,
  width: 80,
  height: 24,
  timestamp: 0,
  env: {
    SHELL: '/bin/bash',
    TERM: 'xterm-256color',
  },
};

const lines = [JSON.stringify(header), ...events.map((event) => JSON.stringify(event))];
fs.writeFileSync(outputPath, lines.join('\n') + '\n');
