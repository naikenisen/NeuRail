import * as net from 'node:net';

export async function isPortOpen(port: number, host = '127.0.0.1', timeout = 700): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    let settled = false;

    const finish = (open: boolean): void => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(open);
    };

    socket.setTimeout(timeout);
    socket.once('connect', () => finish(true));
    socket.once('timeout', () => finish(false));
    socket.once('error', () => finish(false));
    socket.connect(port, host);
  });
}

export async function waitForServer(port: number, timeout = 10000, host = '127.0.0.1'): Promise<void> {
  return new Promise((resolve, reject) => {
    const start = Date.now();

    const tryConnect = (): void => {
      const socket = new net.Socket();
      socket.setTimeout(500);

      socket.once('connect', () => {
        socket.destroy();
        resolve();
      });

      socket.once('error', () => {
        socket.destroy();
        if (Date.now() - start > timeout) {
          reject(new Error('Server did not start in time'));
          return;
        }
        setTimeout(tryConnect, 200);
      });

      socket.once('timeout', () => {
        socket.destroy();
        if (Date.now() - start > timeout) {
          reject(new Error('Server did not start in time'));
          return;
        }
        setTimeout(tryConnect, 200);
      });

      socket.connect(port, host);
    };

    tryConnect();
  });
}
