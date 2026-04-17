export type WindowBoundsDto = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type BrowserTabPayloadDto = {
  tabId?: string;
  url?: string;
  label?: string;
};

export type BrowserTabUpdatedDto = {
  tabId: string;
  title?: string;
  url?: string;
  canGoBack?: boolean;
  canGoForward?: boolean;
  isLoading?: boolean;
};

export type ContextMenuParamsDto = {
  hasSelection?: boolean;
  isEditable?: boolean;
  isTask?: boolean;
  isTaskDone?: boolean;
  taskId?: string;
  sectionId?: string;
};

export type DialogOptionsDto = Record<string, unknown>;

export type DragTempFilePayloadDto = {
  base64: string;
  fileName?: string;
};

export type DragCopyPayloadDto = {
  sourcePath: string;
  destinationPath: string;
};

export type DragLaunchPayloadDto = {
  filePath: string;
  displayName?: string;
};

export type ElectronApiContract = {
  minimize: () => void;
  maximize: () => void;
  close: () => void;
  isMaximized: () => Promise<boolean>;
  zoomIn: () => Promise<number>;
  zoomOut: () => Promise<number>;
  zoomReset: () => Promise<number>;

  openFileDialog: (options?: DialogOptionsDto) => Promise<unknown>;
  saveFileDialog: (options?: DialogOptionsDto) => Promise<unknown>;
  messageDialog: (options?: DialogOptionsDto) => Promise<unknown>;
  openExternal: (url: string) => Promise<void>;

  writeTempFileFromBase64: (payload: DragTempFilePayloadDto) => Promise<{ ok: boolean; filePath?: string; error?: string }>;
  startDragOut: (filePath: string) => void;
  copyTempFileTo: (payload: DragCopyPayloadDto) => Promise<{ ok: boolean; error?: string }>;
  launchDragHelper: (payload: DragLaunchPayloadDto) => Promise<{ ok: boolean; error?: string }>;

  showContextMenu: (params: ContextMenuParamsDto) => void;
  onContextMenuAction: (channel: 'context-menu:toggle-task' | 'context-menu:delete-task', callback: (...args: unknown[]) => void) => void;

  scanVaultGraph: () => Promise<unknown>;
  readVaultFile: (relpath: string) => Promise<unknown>;
  getVaultFileUrl: (relpath: string) => Promise<unknown>;
  openVaultExternal: (relpath: string) => Promise<unknown>;

  browserCreateTab: (payload: BrowserTabPayloadDto) => Promise<unknown>;
  browserActivateTab: (tabId: string) => Promise<unknown>;
  browserCloseTab: (tabId: string) => Promise<unknown>;
  browserNavigate: (payload: BrowserTabPayloadDto) => Promise<unknown>;
  browserGoBack: (tabId: string) => Promise<unknown>;
  browserGoForward: (tabId: string) => Promise<unknown>;
  browserReload: (tabId: string) => Promise<unknown>;
  browserSetVisible: (visible: boolean) => Promise<unknown>;
  browserSetBounds: (bounds: WindowBoundsDto) => Promise<unknown>;
  browserAutofillGithub: (payload: BrowserTabPayloadDto) => Promise<unknown>;
  browserAutofillSavedCredential: (payload: BrowserTabPayloadDto & { credentialId: string }) => Promise<unknown>;
  onBrowserTabUpdated: (callback: (payload: BrowserTabUpdatedDto) => void) => void;

  passwordVaultStatus: () => Promise<unknown>;
  passwordVaultList: () => Promise<unknown>;
  passwordVaultUpsert: (payload: Record<string, unknown>) => Promise<unknown>;
  passwordVaultDelete: (credentialId: string) => Promise<unknown>;
  passwordVaultFindByOrigin: (origin: string) => Promise<unknown>;
};
