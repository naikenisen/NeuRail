import * as path from 'node:path';

export type RuntimeStoragePaths = {
  dataDir: string;
  cacheDir: string;
  logsDir: string;
  mailsDir: string;
};

export type AppLike = {
  getPath: (name: 'userData' | 'cache' | 'appData') => string;
};

export function buildRuntimeStoragePaths(app: AppLike): RuntimeStoragePaths {
  const dataDir = path.resolve(app.getPath('userData'));
  const cacheDir = path.resolve(app.getPath('cache'));
  const logsDir = path.join(dataDir, 'logs');
  const mailsDir = path.join(dataDir, 'mails');

  return {
    dataDir,
    cacheDir,
    logsDir,
    mailsDir,
  };
}
