import * as path from 'node:path';

type AppLike = {
  isPackaged: boolean;
};

export function resourceRootDir(app: AppLike): string {
  if (app.isPackaged) {
    const electronProcess = process as NodeJS.Process & { resourcesPath?: string };
    if (electronProcess.resourcesPath) {
      return electronProcess.resourcesPath;
    }
  }
  return path.resolve(__dirname, '..', '..', '..', '..');
}

export function resourcePath(app: AppLike, ...segments: string[]): string {
  return path.join(resourceRootDir(app), ...segments);
}

export function resourceDir(app: AppLike): string {
  return resourceRootDir(app);
}
