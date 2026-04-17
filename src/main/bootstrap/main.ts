import { app, BrowserWindow } from 'electron';
import { isPortOpen, waitForServer } from '@main/bootstrap/server-health';

export type MainBootstrapOptions = {
  port: number;
  createWindow: () => BrowserWindow;
  startBackend: () => void;
  onBackendStartFailure: (message: string) => void;
};

export async function bootstrapMainProcess(options: MainBootstrapOptions): Promise<void> {
  const backendAlreadyRunning = await isPortOpen(options.port);
  if (!backendAlreadyRunning) {
    options.startBackend();
  }

  try {
    await waitForServer(options.port);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    options.onBackendStartFailure(message);
    throw error;
  }

  options.createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      options.createWindow();
    }
  });
}
