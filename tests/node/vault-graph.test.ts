const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const {
  getVaultPath,
  safeVaultFullPath,
} = require('../../src/main/lib/vault-graph');

test('getVaultPath uses ISENAPP_VAULT_PATH when set', () => {
  const original = process.env.ISENAPP_VAULT_PATH;
  process.env.ISENAPP_VAULT_PATH = '/tmp/custom-vault';

  const result = getVaultPath();

  assert.equal(result, path.resolve('/tmp/custom-vault'));
  if (original === undefined) delete process.env.ISENAPP_VAULT_PATH;
  else process.env.ISENAPP_VAULT_PATH = original;
});

test('safeVaultFullPath blocks traversal outside vault path', () => {
  const original = process.env.ISENAPP_VAULT_PATH;
  process.env.ISENAPP_VAULT_PATH = '/tmp/custom-vault';

  const blocked = safeVaultFullPath('../../etc/passwd');

  assert.equal(blocked, null);
  if (original === undefined) delete process.env.ISENAPP_VAULT_PATH;
  else process.env.ISENAPP_VAULT_PATH = original;
});

test('safeVaultFullPath resolves valid relative path', () => {
  const original = process.env.ISENAPP_VAULT_PATH;
  process.env.ISENAPP_VAULT_PATH = '/tmp/custom-vault';

  const resolved = safeVaultFullPath('sub/note.md');

  assert.ok(resolved);
  assert.equal(resolved.safe, path.normalize('sub/note.md'));
  assert.equal(resolved.fullPath, path.join(path.resolve('/tmp/custom-vault'), 'sub/note.md'));
  if (original === undefined) delete process.env.ISENAPP_VAULT_PATH;
  else process.env.ISENAPP_VAULT_PATH = original;
});

export {};
