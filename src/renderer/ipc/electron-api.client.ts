import type { ElectronApiContract } from '@shared/contracts/ipc/electron-api.dto';

export function getElectronApi(): ElectronApiContract {
  if (!window.electronAPI) {
    throw new Error('electronAPI bridge unavailable in renderer context');
  }
  return window.electronAPI;
}
