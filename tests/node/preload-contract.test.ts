const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('preload bridge does not expose generic fs read/write', () => {
  const preloadPath = path.resolve(__dirname, '../../src/main/preload.ts');
  const content = fs.readFileSync(preloadPath, 'utf-8');

  assert.equal(content.includes('readFile:'), false);
  assert.equal(content.includes('writeFile:'), false);
});

export {};
