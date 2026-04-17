import type { ElectronApiContract } from '@shared/contracts/ipc/electron-api.dto';

type ContextMenuChannel = 'context-menu:toggle-task' | 'context-menu:delete-task';

type IpcRendererLike = {
  send: (channel: string, payload?: unknown) => void;
  invoke: (channel: string, payload?: unknown) => Promise<unknown>;
  on: (channel: string, listener: (event: unknown, ...args: unknown[]) => void) => void;
};

export function createElectronApiBridge(ipcRenderer: IpcRendererLike): ElectronApiContract {
  return {
    minimize: () => ipcRenderer.send('window:minimize'),
    maximize: () => ipcRenderer.send('window:maximize'),
    close: () => ipcRenderer.send('window:close'),
    isMaximized: () => ipcRenderer.invoke('window:isMaximized') as Promise<boolean>,
    zoomIn: () => ipcRenderer.invoke('window:zoomIn') as Promise<number>,
    zoomOut: () => ipcRenderer.invoke('window:zoomOut') as Promise<number>,
    zoomReset: () => ipcRenderer.invoke('window:zoomReset') as Promise<number>,

    openFileDialog: (options) => ipcRenderer.invoke('dialog:openFile', options),
    saveFileDialog: (options) => ipcRenderer.invoke('dialog:saveFile', options),
    messageDialog: (options) => ipcRenderer.invoke('dialog:message', options),
    openExternal: (url) => ipcRenderer.invoke('shell:openExternal', url) as Promise<void>,

    writeTempFileFromBase64: (payload) => ipcRenderer.invoke('drag:writeTempFileFromBase64', payload) as Promise<{ ok: boolean; filePath?: string; error?: string }>,
    startDragOut: (filePath) => ipcRenderer.send('drag:startFile', { filePath }),
    copyTempFileTo: (payload) => ipcRenderer.invoke('drag:copyFileToDestination', payload) as Promise<{ ok: boolean; error?: string }>,
    launchDragHelper: (payload) => ipcRenderer.invoke('drag:launchHelper', payload) as Promise<{ ok: boolean; error?: string }>,

    showContextMenu: (params) => ipcRenderer.send('context-menu:show', params),
    onContextMenuAction: (channel, callback) => {
      const validChannels: ContextMenuChannel[] = ['context-menu:toggle-task', 'context-menu:delete-task'];
      if (validChannels.includes(channel as ContextMenuChannel)) {
        ipcRenderer.on(channel, (_event, ...args) => callback(...args));
      }
    },

    scanVaultGraph: () => ipcRenderer.invoke('vault:scanGraph'),
    readVaultFile: (relpath) => ipcRenderer.invoke('vault:readFile', relpath),
    getVaultFileUrl: (relpath) => ipcRenderer.invoke('vault:getFileUrl', relpath),
    openVaultExternal: (relpath) => ipcRenderer.invoke('vault:openExternal', relpath),

    browserCreateTab: (payload) => ipcRenderer.invoke('browser:createTab', payload),
    browserActivateTab: (tabId) => ipcRenderer.invoke('browser:activateTab', tabId),
    browserCloseTab: (tabId) => ipcRenderer.invoke('browser:closeTab', tabId),
    browserNavigate: (payload) => ipcRenderer.invoke('browser:navigate', payload),
    browserGoBack: (tabId) => ipcRenderer.invoke('browser:goBack', tabId),
    browserGoForward: (tabId) => ipcRenderer.invoke('browser:goForward', tabId),
    browserReload: (tabId) => ipcRenderer.invoke('browser:reload', tabId),
    browserSetVisible: (visible) => ipcRenderer.invoke('browser:setVisible', visible),
    browserSetBounds: (bounds) => ipcRenderer.invoke('browser:setBounds', bounds),
    browserAutofillGithub: (payload) => ipcRenderer.invoke('browser:autofillGithub', payload),
    browserAutofillSavedCredential: (payload) => ipcRenderer.invoke('browser:autofillSavedCredential', payload),
    onBrowserTabUpdated: (callback) => {
      ipcRenderer.on('browser:tab-updated', (_event, payload) => callback(payload as Parameters<typeof callback>[0]));
    },

    passwordVaultStatus: () => ipcRenderer.invoke('passwordVault:status'),
    passwordVaultList: () => ipcRenderer.invoke('passwordVault:list'),
    passwordVaultUpsert: (payload) => ipcRenderer.invoke('passwordVault:upsert', payload),
    passwordVaultDelete: (credentialId) => ipcRenderer.invoke('passwordVault:delete', credentialId),
    passwordVaultFindByOrigin: (origin) => ipcRenderer.invoke('passwordVault:findByOrigin', origin),
  };
}
