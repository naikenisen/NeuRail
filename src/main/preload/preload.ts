import { contextBridge, ipcRenderer } from 'electron';
import { createElectronApiBridge } from '@main/preload/preload-bridge';

export function exposeElectronApi(): void {
  contextBridge.exposeInMainWorld('electronAPI', createElectronApiBridge(ipcRenderer));
}

exposeElectronApi();
