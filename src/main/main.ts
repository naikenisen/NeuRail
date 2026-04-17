// @ts-nocheck
const { app, BrowserWindow, BrowserView, ipcMain, dialog, Menu, globalShortcut, shell, protocol, safeStorage, nativeImage } = require('electron');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');
const windowStateKeeper = require('electron-window-state');
const { resourcePath } = require('./lib/resource-paths');
const { buildRuntimeStoragePaths } = require('./lib/storage-paths');
const { isPortOpen, waitForServer } = require('./bootstrap/server-health');
const { registerPasswordVaultIpcHandlers, normalizeCredentialOrigin, readVaultRaw, autofillLoginFormScript } = require('./lib/password-vault');
const { handleVaultFileRequest, registerVaultGraphIpcHandlers } = require('./lib/vault-graph');

/* GPU tile-memory fix — prevents "tile memory limits exceeded" on large SVG graphs */
app.commandLine.appendSwitch('max-active-webgl-contexts', '16');
app.commandLine.appendSwitch('force-gpu-mem-available-mb', '512');

/* Register custom protocol for serving vault files securely */
protocol.registerSchemesAsPrivileged([
  { scheme: 'vault-file', privileges: { bypassCSP: true, stream: true, supportFetchAPI: true } }
]);

const PORT = 8080;
const BACKEND_MODE = 'ts';
let serverProcess = null;
let mainWindow = null;
let backendLastError = '';
let backendLogBuffer = [];
let browserVisible = false;
let activeBrowserTabId = null;
let browserBounds = { x: 0, y: 0, width: 0, height: 0 };
const browserViews = new Map();
const DRAG_TEMP_DIR = path.join(os.tmpdir(), 'neurail-drag');

function sanitizeFilenameForTemp(name) {
  const base = String(name || 'fichier').replace(/[\\/:*?"<>|]/g, '_').trim() || 'fichier';
  return base.slice(0, 180);
}

function ensureDragTempDir() {
  try {
    fs.mkdirSync(DRAG_TEMP_DIR, { recursive: true });
  } catch {}
}

function cleanupOldDragFiles(maxAgeMs = 24 * 60 * 60 * 1000) {
  try {
    ensureDragTempDir();
    const now = Date.now();
    for (const entry of fs.readdirSync(DRAG_TEMP_DIR, { withFileTypes: true })) {
      if (!entry.isFile()) continue;
      const p = path.join(DRAG_TEMP_DIR, entry.name);
      const st = fs.statSync(p);
      if (now - st.mtimeMs > maxAgeMs) {
        fs.unlinkSync(p);
      }
    }
  } catch {}
}

function getDragIcon() {
  const iconCandidates = [
    resourcePath(app, 'assets', 'logo.png'),
    resourcePath(app, 'build', 'icons', 'icon.png'),
  ];
  for (const p of iconCandidates) {
    try {
      if (fs.existsSync(p)) {
        const img = nativeImage.createFromPath(p);
        if (!img.isEmpty()) {
          // Resize to 32x32 — large icons cause SIGILL on X11 native drag
          return img.resize({ width: 32, height: 32 });
        }
      }
    } catch {}
  }
  // Minimal 1x1 fallback
  return nativeImage.createFromDataURL('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO5N8lQAAAAASUVORK5CYII=');
}

/* Decrypt a vault secret using safeStorage (available after app ready) */
function decryptVaultSecretMain(cipherB64) {
  try {
    if (!safeStorage || !safeStorage.isEncryptionAvailable()) return '';
    const plain = safeStorage.decryptString(Buffer.from(String(cipherB64 || ''), 'base64'));
    return String(plain || '');
  } catch {
    return '';
  }
}

const gotSingleInstanceLock = app.requestSingleInstanceLock();
if (!gotSingleInstanceLock) {
  app.quit();
}

/* ═══════════════════════════════════════════════════════
  Backend Server (TypeScript only)
  ═══════════════════════════════════════════════════════ */
function pushBackendLog(line) {
  if (!line) return;
  backendLogBuffer.push(String(line));
  if (backendLogBuffer.length > 80) {
    backendLogBuffer = backendLogBuffer.slice(-80);
  }
}

function buildBackendFailureMessage() {
  const logs = backendLogBuffer.slice(-12).join('\n').trim();
  const details = logs || 'Aucun log backend disponible.';
  return [
    'Le backend n\'a pas pu démarrer.',
    '',
    `Mode backend: ${BACKEND_MODE}`,
    '',
    'Mode TS: dépendances Node/tsx manquantes ou erreur au démarrage.',
    '',
    'Assure-toi que les dépendances Node sont installées.',
    'Commande: npm install',
    '',
    'Le backend Python n\'est plus utilisé dans cette version.',
    '',
    `Détail: ${backendLastError || 'timeout de démarrage'}`,
    '',
    'Derniers logs backend:',
    details,
  ].join('\n');
}

function detectTsxCommand() {
  const localBin = path.join(resourcePath(app), 'node_modules', '.bin', process.platform === 'win32' ? 'tsx.cmd' : 'tsx');
  if (fs.existsSync(localBin)) return localBin;
  return process.platform === 'win32' ? 'tsx.cmd' : 'tsx';
}

function startTypeScriptServer() {
  const tsxCmd = detectTsxCommand();
  const runtimePaths = buildRuntimeStoragePaths(app);
  const backendScript = resourcePath(app, 'src', 'infrastructure', 'http', 'server', 'runtime-backend.ts');

  backendLastError = '';
  backendLogBuffer = [];

  try {
    fs.mkdirSync(runtimePaths.dataDir, { recursive: true });
    fs.mkdirSync(runtimePaths.cacheDir, { recursive: true });
    fs.mkdirSync(runtimePaths.logsDir, { recursive: true });
    fs.mkdirSync(runtimePaths.mailsDir, { recursive: true });
  } catch {}

  process.env.ISENAPP_VAULT_PATH = runtimePaths.mailsDir;

  serverProcess = spawn(tsxCmd, [backendScript], {
    cwd: resourcePath(app),
    env: {
      ...process.env,
      ISENAPP_BACKEND_HOST: '127.0.0.1',
      ISENAPP_BACKEND_PORT: String(PORT),
      ISENAPP_DATA_DIR: runtimePaths.dataDir,
      ISENAPP_VAULT_PATH: runtimePaths.mailsDir,
      ISENAPP_RESOURCES_ROOT: resourcePath(app),
    },
    stdio: ['pipe', 'pipe', 'pipe'],
  });

  serverProcess.stdout.on('data', (data) => {
    const line = data.toString().trim();
    if (!line) return;
    pushBackendLog(line);
    console.log(`[server-ts] ${line}`);
  });

  serverProcess.stderr.on('data', (data) => {
    const line = data.toString().trim();
    if (!line) return;
    pushBackendLog(line);
    console.error(`[server-ts] ${line}`);
  });

  serverProcess.on('error', (err) => {
    backendLastError = err.message;
    pushBackendLog(`spawn error: ${err.message}`);
    console.error('Failed to start TS backend server:', err.message);
  });

  serverProcess.on('close', (code, signal) => {
    if (code && code !== 0) {
      backendLastError = `backend exited with code ${code}${signal ? ` (signal: ${signal})` : ''}`;
      console.error(`[server-ts] exited with code ${code}${signal ? ` (signal: ${signal})` : ''}`);
    }
    serverProcess = null;
  });
}

function startBackendServer() {
  startTypeScriptServer();
}

/* ═══════════════════════════════════════════════════════
   Window Creation
   ═══════════════════════════════════════════════════════ */
function createWindow() {
  const winState = windowStateKeeper({
    defaultWidth: 1100,
    defaultHeight: 800,
  });

  mainWindow = new BrowserWindow({
    x: winState.x,
    y: winState.y,
    width: winState.width,
    height: winState.height,
    minWidth: 800,
    minHeight: 550,
    title: 'NeuRail',
    icon: resourcePath(app, 'assets', 'logo.png'),
    frame: false,
    transparent: false,
    backgroundColor: '#1e1e2e',
    show: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
      experimentalFeatures: false,
      preload: path.join(__dirname, 'preload.ts'),
    },
  });

  // Multiple BrowserViews/tabs can register lifecycle listeners on the window.
  mainWindow.setMaxListeners(50);

  winState.manage(mainWindow);

  mainWindow.loadURL(`http://localhost:${PORT}`);
  mainWindow.setMenuBarVisibility(false);

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  mainWindow.on('closed', () => {
    for (const view of browserViews.values()) {
      try {
        if (!view.webContents.isDestroyed()) view.webContents.destroy();
      } catch {}
    }
    browserViews.clear();
    activeBrowserTabId = null;
    mainWindow = null;
  });

  mainWindow.on('resize', () => {
    applyBrowserViewLayout();
  });
}

/* ═══════════════════════════════════════════════════════
   BrowserView Tabs (native Electron browser areas)
   ═══════════════════════════════════════════════════════ */
function sanitizeBrowserUrl(rawUrl) {
  const url = String(rawUrl || '').trim();
  if (!url) return 'https://www.google.com';
  if (/^https?:\/\//i.test(url)) return url;
  return 'https://' + url;
}

function browserSessionPartitionForUrl(rawUrl) {
  const safeUrl = sanitizeBrowserUrl(rawUrl);
  try {
    const host = (new URL(safeUrl).hostname || 'default').toLowerCase();
    const slug = host.replace(/[^a-z0-9.-]/g, '-').slice(0, 80) || 'default';
    return `persist:site-${slug}`;
  } catch {
    return 'persist:site-default';
  }
}

function emitBrowserTabUpdate(tabId, payload = {}) {
  if (!mainWindow || !mainWindow.webContents || mainWindow.webContents.isDestroyed()) return;
  mainWindow.webContents.send('browser:tab-updated', { tabId, ...payload });
}

function getNavigationState(webContents) {
  const history = webContents && webContents.navigationHistory;
  const canGoBack = history && typeof history.canGoBack === 'function'
    ? history.canGoBack()
    : webContents.canGoBack();
  const canGoForward = history && typeof history.canGoForward === 'function'
    ? history.canGoForward()
    : webContents.canGoForward();
  return { canGoBack, canGoForward };
}

function detachAllBrowserViews() {
  if (!mainWindow) return;
  for (const view of browserViews.values()) {
    try {
      mainWindow.removeBrowserView(view);
    } catch {}
  }
}

function applyBrowserViewLayout() {
  if (!mainWindow || !browserVisible || !activeBrowserTabId) return;
  const active = browserViews.get(activeBrowserTabId);
  if (!active) return;

  const bounds = {
    x: Math.max(0, Math.floor(browserBounds.x || 0)),
    y: Math.max(0, Math.floor(browserBounds.y || 0)),
    width: Math.max(100, Math.floor(browserBounds.width || 0)),
    height: Math.max(100, Math.floor(browserBounds.height || 0)),
  };

  try {
    active.setBounds(bounds);
    active.setAutoResize({ width: false, height: false, horizontal: false, vertical: false });
  } catch {}
}

function ensureBrowserViewTab(tabId, initialUrl, partition) {
  if (browserViews.has(tabId)) return browserViews.get(tabId);

  const tabPartition = String(partition || '').trim() || browserSessionPartitionForUrl(initialUrl);
  const view = new BrowserView({
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
      experimentalFeatures: false,
      partition: tabPartition,
    },
  });
  browserViews.set(tabId, view);

  /* Allow OAuth / login popups: open them in a real BrowserWindow
     sharing the same session partition so auth cookies flow back. */
  view.webContents.setWindowOpenHandler(({ url }) => {
    const popupUrl = sanitizeBrowserUrl(url);
    const popup = new BrowserWindow({
      width: 600,
      height: 700,
      parent: mainWindow,
      modal: false,
      show: true,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: true,
        webSecurity: true,
        partition: tabPartition,
      },
    });
    popup.setMenuBarVisibility(false);
    popup.loadURL(popupUrl).catch(() => {});

    /* When the popup navigates back to the original site or closes,
       refresh the parent BrowserView so it picks up the new session. */
    popup.webContents.on('will-redirect', (_e, redirectUrl) => {
      try {
        const redirectHost = new URL(redirectUrl).hostname.toLowerCase();
        const originalHost = new URL(sanitizeBrowserUrl(view.webContents.getURL())).hostname.toLowerCase();
        if (redirectHost === originalHost) {
          popup.close();
          view.webContents.reload();
        }
      } catch {}
    });

    popup.on('closed', () => {
      /* After any auth popup closes, reload parent view to pick up session */
      try {
        if (!view.webContents.isDestroyed()) {
          emitBrowserTabUpdate(tabId, {
            url: view.webContents.getURL(),
            title: view.webContents.getTitle(),
          });
        }
      } catch {}
    });

    return { action: 'deny' };
  });

  view.webContents.on('did-start-loading', () => {
    emitBrowserTabUpdate(tabId, { loading: true });
  });
  view.webContents.on('did-stop-loading', async () => {
    const nav = getNavigationState(view.webContents);
    const url = view.webContents.getURL();
    emitBrowserTabUpdate(tabId, {
      loading: false,
      url,
      title: view.webContents.getTitle(),
      canGoBack: nav.canGoBack,
      canGoForward: nav.canGoForward,
    });

    // Check for saved credentials and login form, then auto-fill if possible
    try {
      const origin = normalizeCredentialOrigin(url);
      if (!origin) return;
      const vault = readVaultRaw(app);
      const found = vault.entries.find((e) => e.origin === origin) || null;

      const hasLoginForm = await view.webContents
        .executeJavaScript(`(() => {
          const passInputs = Array.from(document.querySelectorAll('input[type="password"]'))
            .filter(el => {
              const s = window.getComputedStyle(el);
              const r = el.getBoundingClientRect();
              return s.display !== 'none' && s.visibility !== 'hidden' && r.width > 0 && r.height > 0;
            });
          // A login form has exactly one visible password field
          // (registration/change-password forms typically have 2+)
          if (passInputs.length !== 1) return false;
          const userSelectors = [
            'input[type="email"]', 'input[type="text"]',
            'input[name="username"]', 'input[name="login"]',
            'input[autocomplete="username"]'
          ];
          const hasUserField = userSelectors.some(s => {
            const el = document.querySelector(s);
            if (!el) return false;
            const st = window.getComputedStyle(el);
            return st.display !== 'none' && st.visibility !== 'hidden';
          });
          return hasUserField || passInputs.length === 1;
        })()`, true)
        .catch(() => false);

      emitBrowserTabUpdate(tabId, {
        hasCredentials: !!found,
        credentialId: found ? found.id : null,
        hasLoginForm: !!hasLoginForm,
      });

      // Auto-fill when credentials are saved and a login form is present
      if (found && hasLoginForm) {
        try {
          const username = decryptVaultSecretMain(found.usernameEnc);
          const password = decryptVaultSecretMain(found.passwordEnc);
          if (username && password) {
            await view.webContents.executeJavaScript(autofillLoginFormScript(username, password), true);
          }
        } catch {}
      }
    } catch {}
  });
  view.webContents.on('did-navigate', (_event, url) => {
    const nav = getNavigationState(view.webContents);
    emitBrowserTabUpdate(tabId, {
      url,
      title: view.webContents.getTitle(),
      canGoBack: nav.canGoBack,
      canGoForward: nav.canGoForward,
    });
  });
  view.webContents.on('did-navigate-in-page', (_event, url) => {
    const nav = getNavigationState(view.webContents);
    emitBrowserTabUpdate(tabId, {
      url,
      title: view.webContents.getTitle(),
      canGoBack: nav.canGoBack,
      canGoForward: nav.canGoForward,
    });
  });
  view.webContents.on('page-title-updated', () => {
    emitBrowserTabUpdate(tabId, { title: view.webContents.getTitle() });
  });

  view.webContents.loadURL(sanitizeBrowserUrl(initialUrl || 'https://www.google.com')).catch(() => {});
  return view;
}

function activateBrowserViewTab(tabId) {
  if (!mainWindow) return false;
  const view = browserViews.get(tabId);
  if (!view) return false;

  activeBrowserTabId = tabId;
  detachAllBrowserViews();
  if (browserVisible) {
    try {
      mainWindow.addBrowserView(view);
    } catch {}
    applyBrowserViewLayout();
  }

  const nav = getNavigationState(view.webContents);
  emitBrowserTabUpdate(tabId, {
    url: view.webContents.getURL(),
    title: view.webContents.getTitle(),
    loading: view.webContents.isLoading(),
    canGoBack: nav.canGoBack,
    canGoForward: nav.canGoForward,
    active: true,
  });
  return true;
}

ipcMain.handle('browser:createTab', async (_event, payload = {}) => {
  const tabId = String(payload.tabId || '').trim();
  const url = sanitizeBrowserUrl(payload.url || 'https://www.google.com');
  const partition = String(payload.partition || '').trim() || browserSessionPartitionForUrl(url);
  const shouldActivate = payload.activate !== false;
  if (!tabId) return { ok: false, error: 'tabId manquant' };
  ensureBrowserViewTab(tabId, url, partition);
  if (shouldActivate) activateBrowserViewTab(tabId);
  return { ok: true };
});

ipcMain.handle('browser:activateTab', async (_event, tabId) => {
  const ok = activateBrowserViewTab(String(tabId || '').trim());
  return { ok, error: ok ? '' : 'onglet introuvable' };
});

ipcMain.handle('browser:closeTab', async (_event, tabIdRaw) => {
  const tabId = String(tabIdRaw || '').trim();
  const view = browserViews.get(tabId);
  if (!view) return { ok: false, error: 'onglet introuvable' };

  try {
    if (mainWindow) mainWindow.removeBrowserView(view);
  } catch {}
  browserViews.delete(tabId);
  try {
    if (!view.webContents.isDestroyed()) view.webContents.destroy();
  } catch {}

  if (activeBrowserTabId === tabId) {
    const next = browserViews.keys().next().value || null;
    activeBrowserTabId = next;
    if (next) activateBrowserViewTab(next);
    else detachAllBrowserViews();
  }
  return { ok: true, activeTabId: activeBrowserTabId };
});

ipcMain.handle('browser:navigate', async (_event, payload = {}) => {
  const tabId = String(payload.tabId || '').trim();
  const view = browserViews.get(tabId);
  if (!view) return { ok: false, error: 'onglet introuvable' };
  const url = sanitizeBrowserUrl(payload.url || view.webContents.getURL());
  try {
    await view.webContents.loadURL(url);
    return { ok: true, url };
  } catch (err) {
    return { ok: false, error: err.message || String(err) };
  }
});

ipcMain.handle('browser:goBack', async (_event, tabIdRaw) => {
  const view = browserViews.get(String(tabIdRaw || '').trim());
  if (!view) return { ok: false, error: 'onglet introuvable' };
  const history = view.webContents.navigationHistory;
  if (history && typeof history.canGoBack === 'function' && history.canGoBack()) {
    history.goBack();
  }
  return { ok: true };
});

ipcMain.handle('browser:goForward', async (_event, tabIdRaw) => {
  const view = browserViews.get(String(tabIdRaw || '').trim());
  if (!view) return { ok: false, error: 'onglet introuvable' };
  const history = view.webContents.navigationHistory;
  if (history && typeof history.canGoForward === 'function' && history.canGoForward()) {
    history.goForward();
  }
  return { ok: true };
});

ipcMain.handle('browser:reload', async (_event, tabIdRaw) => {
  const view = browserViews.get(String(tabIdRaw || '').trim());
  if (!view) return { ok: false, error: 'onglet introuvable' };
  view.webContents.reload();
  return { ok: true };
});

ipcMain.handle('browser:setVisible', async (_event, visibleRaw) => {
  browserVisible = !!visibleRaw;
  if (!browserVisible) {
    detachAllBrowserViews();
    return { ok: true };
  }
  if (activeBrowserTabId && browserViews.has(activeBrowserTabId) && mainWindow) {
    try {
      mainWindow.addBrowserView(browserViews.get(activeBrowserTabId));
    } catch {}
    applyBrowserViewLayout();
  }
  return { ok: true };
});

ipcMain.handle('browser:setBounds', async (_event, bounds = {}) => {
  browserBounds = {
    x: Number(bounds.x || 0),
    y: Number(bounds.y || 0),
    width: Number(bounds.width || 0),
    height: Number(bounds.height || 0),
  };
  applyBrowserViewLayout();
  return { ok: true };
});

ipcMain.handle('browser:autofillGithub', async (_event, payload = {}) => {
  const tabId = String(payload.tabId || '').trim();
  const username = String(payload.username || '');
  const password = String(payload.password || '');
  const view = browserViews.get(tabId);
  if (!view) return { ok: false, error: 'onglet introuvable' };

  const js = `(() => {
    const user = ${JSON.stringify(username)};
    const pass = ${JSON.stringify(password)};
    const userInput = document.querySelector('input[name="login"], input#login_field, input[type="email"]');
    const passInput = document.querySelector('input[name="password"], input#password');
    if (userInput) userInput.value = user;
    if (passInput) passInput.value = pass;
    return { ok: !!(userInput && passInput) };
  })();`;

  try {
    const result = await view.webContents.executeJavaScript(js, true);
    return { ok: true, filled: !!(result && result.ok) };
  } catch (err) {
    return { ok: false, error: err.message || String(err) };
  }
});

registerPasswordVaultIpcHandlers({
  ipcMain,
  browserViews,
  app,
  safeStorage,
});

/* ═══════════════════════════════════════════════════════
   IPC Handlers — Window Controls
   ═══════════════════════════════════════════════════════ */
ipcMain.on('window:minimize', () => {
  if (mainWindow) mainWindow.minimize();
});

ipcMain.on('window:maximize', () => {
  if (!mainWindow) return;
  if (mainWindow.isMaximized()) {
    mainWindow.unmaximize();
  } else {
    mainWindow.maximize();
  }
});

ipcMain.on('window:close', () => {
  if (mainWindow) mainWindow.close();
});

ipcMain.handle('window:isMaximized', () => {
  return mainWindow ? mainWindow.isMaximized() : false;
});

ipcMain.handle('window:zoomIn', () => {
  if (!mainWindow) return false;
  const wc = mainWindow.webContents;
  wc.setZoomLevel(wc.getZoomLevel() + 0.2);
  return true;
});

ipcMain.handle('window:zoomOut', () => {
  if (!mainWindow) return false;
  const wc = mainWindow.webContents;
  wc.setZoomLevel(wc.getZoomLevel() - 0.2);
  return true;
});

ipcMain.handle('window:zoomReset', () => {
  if (!mainWindow) return false;
  mainWindow.webContents.setZoomLevel(0);
  return true;
});

/* ═══════════════════════════════════════════════════════
   IPC Handlers — Native Dialogs
   ═══════════════════════════════════════════════════════ */
ipcMain.handle('dialog:openFile', async (_event, options) => {
  if (!mainWindow) return { canceled: true, filePaths: [] };
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile'],
    filters: options?.filters || [],
  });
  return result;
});

ipcMain.handle('dialog:saveFile', async (_event, options) => {
  if (!mainWindow) return { canceled: true, filePath: '' };
  const result = await dialog.showSaveDialog(mainWindow, {
    defaultPath: options?.defaultPath || '',
    filters: options?.filters || [],
  });
  return result;
});

ipcMain.handle('dialog:message', async (_event, options) => {
  if (!mainWindow) return { response: 0 };
  const result = await dialog.showMessageBox(mainWindow, {
    type: options?.type || 'info',
    title: options?.title || 'Todo & Mail',
    message: options?.message || '',
    buttons: options?.buttons || ['OK'],
  });
  return result;
});

ipcMain.handle('shell:openExternal', async (_event, url) => {
  try {
    if (typeof url !== 'string' || !/^https?:\/\//i.test(url)) return false;
    await shell.openExternal(url);
    return true;
  } catch {
    return false;
  }
});

ipcMain.handle('drag:writeTempFileFromBase64', async (_event, payload = {}) => {
  try {
    const rawName = sanitizeFilenameForTemp(payload.filename || 'document');
    const base64 = String(payload.base64 || '').trim();
    if (!base64) return { ok: false, error: 'Données vides' };

    ensureDragTempDir();
    cleanupOldDragFiles();

    const finalName = rawName;
    const filePath = path.join(DRAG_TEMP_DIR, finalName);

    const fileBuffer = Buffer.from(base64, 'base64');
    fs.writeFileSync(filePath, fileBuffer);
    return { ok: true, filePath };
  } catch (err) {
    return { ok: false, error: err.message || String(err) };
  }
});

ipcMain.on('drag:startFile', (event, payload = {}) => {
  try {
    const filePath = String(payload.filePath || '').trim();
    if (!filePath || !fs.existsSync(filePath)) {
      console.error('[drag:startFile] Fichier introuvable:', filePath);
      return;
    }
    const icon = getDragIcon();
    console.log('[drag:startFile] Starting native drag:', filePath, 'icon empty?', icon.isEmpty());
    event.sender.startDrag({
      file: filePath,
      icon,
    });
  } catch (err) {
    console.error('[drag:startFile] Error:', err);
  }
});

ipcMain.handle('drag:copyFileToDestination', async (_event, payload = {}) => {
  try {
    const sourcePath = String(payload.sourcePath || '').trim();
    const destinationPath = String(payload.destinationPath || '').trim();
    if (!sourcePath || !destinationPath) return { ok: false, error: 'Chemin manquant' };

    // Security: source must be inside the temp drag directory
    const resolvedSource = path.resolve(sourcePath);
    const resolvedTempDir = path.resolve(DRAG_TEMP_DIR);
    if (!resolvedSource.startsWith(resolvedTempDir + path.sep)) {
      return { ok: false, error: 'Source non autorisée' };
    }
    if (!fs.existsSync(resolvedSource)) {
      return { ok: false, error: 'Fichier source introuvable' };
    }

    fs.copyFileSync(resolvedSource, destinationPath);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message || String(err) };
  }
});

let dragHelperProcess = null;

ipcMain.handle('drag:launchHelper', async (_event, payload = {}) => {
  try {
    const filePath = String(payload.filePath || '').trim();
    const displayName = String(payload.displayName || '').trim();
    if (!filePath || !fs.existsSync(filePath)) {
      return { ok: false, error: 'Fichier introuvable' };
    }

    // Kill any previous helper
    if (dragHelperProcess && !dragHelperProcess.killed) {
      try { dragHelperProcess.kill(); } catch {}
    }

    const revealResult = await shell.openPath(path.dirname(filePath));
    if (revealResult) {
      return { ok: false, error: revealResult };
    }

    console.log('[drag:launchHelper] Opened file directory:', filePath, displayName ? `(label=${displayName})` : '');
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message || String(err) };
  }
});

/* ═══════════════════════════════════════════════════════
   IPC Handlers — File System (scoped to app directory)
   ═══════════════════════════════════════════════════════ */
registerVaultGraphIpcHandlers({ ipcMain, shell });

/* ═══════════════════════════════════════════════════════
   IPC Handlers — Context Menu
   ═══════════════════════════════════════════════════════ */
ipcMain.on('context-menu:show', (_event, params) => {
  if (!mainWindow) return;
  const template = [];

  if (params.hasSelection) {
    template.push(
      { label: 'Copier', role: 'copy', accelerator: 'CmdOrCtrl+C' },
      { label: 'Couper', role: 'cut', accelerator: 'CmdOrCtrl+X' },
    );
  }
  template.push(
    { label: 'Coller', role: 'paste', accelerator: 'CmdOrCtrl+V' },
    { label: 'Tout sélectionner', role: 'selectAll', accelerator: 'CmdOrCtrl+A' },
  );
  template.push({ type: 'separator' });

  if (params.isEditable) {
    template.push(
      { label: 'Annuler', role: 'undo', accelerator: 'CmdOrCtrl+Z' },
      { label: 'Rétablir', role: 'redo', accelerator: 'CmdOrCtrl+Shift+Z' },
      { type: 'separator' },
    );
  }

  if (params.isTask) {
    template.push(
      {
        label: params.isTaskDone ? '↩ Marquer non-fait' : '✓ Marquer fait',
        click: () => mainWindow.webContents.send('context-menu:toggle-task', params.taskId, params.sectionId),
      },
      {
        label: '🗑 Supprimer la tâche',
        click: () => mainWindow.webContents.send('context-menu:delete-task', params.taskId, params.sectionId),
      },
      { type: 'separator' },
    );
  }

  template.push(
    { label: 'Recharger', role: 'reload', accelerator: 'CmdOrCtrl+R' },
    { label: 'Outils de développement', role: 'toggleDevTools', accelerator: 'F12' },
  );

  const menu = Menu.buildFromTemplate(template);
  menu.popup({ window: mainWindow });
});


/* ═══════════════════════════════════════════════════════
   App Lifecycle
   ═══════════════════════════════════════════════════════ */
app.whenReady().then(async () => {
  protocol.handle('vault-file', handleVaultFileRequest);


  const backendAlreadyRunning = await isPortOpen(PORT);
  if (backendAlreadyRunning) {
    console.log(`[server] backend already running on port ${PORT}, reusing it`);
  } else {
    startBackendServer();
  }

  try {
    await waitForServer(PORT);
  } catch (e) {
    backendLastError = backendLastError || e.message;
    console.error(e.message);
    dialog.showErrorBox('NeuRail - Erreur de démarrage', buildBackendFailureMessage());
    app.quit();
    return;
  }

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('second-instance', () => {
  if (!mainWindow) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.focus();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('will-quit', () => {
  if (serverProcess) {
    serverProcess.kill();
    serverProcess = null;
  }
});
