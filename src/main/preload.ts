// @ts-nocheck
const { contextBridge, ipcRenderer } = require('electron');
const { createElectronApiBridge } = require('./preload/preload-bridge');

contextBridge.exposeInMainWorld('electronAPI', createElectronApiBridge(ipcRenderer));
