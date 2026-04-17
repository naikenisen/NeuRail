const test = require('node:test');
const assert = require('node:assert/strict');

const { buildRuntimeStoragePaths } = require('../../src/main/lib/storage-paths');

test('buildRuntimeStoragePaths uses Electron app paths', () => {
  const fakeApp = {
    getPath(name: string) {
      if (name === 'userData') return '/home/test/.config/NeuRail';
      if (name === 'cache') return '/home/test/.cache/NeuRail';
      if (name === 'appData') return '/home/test/.config';
      throw new Error(`unexpected path key: ${name}`);
    },
  };

  const paths = buildRuntimeStoragePaths(fakeApp);

  assert.equal(paths.dataDir, '/home/test/.config/NeuRail');
  assert.equal(paths.mailsDir, '/home/test/.config/NeuRail/mails');
  assert.equal(paths.cacheDir, '/home/test/.cache/NeuRail');
  assert.equal(paths.logsDir, '/home/test/.config/NeuRail/logs');
});

export {};
