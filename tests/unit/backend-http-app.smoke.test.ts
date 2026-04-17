import { createBackendHttpApp } from '@infrastructure/http/server/backend-http-app.service';

const app = createBackendHttpApp({ host: '127.0.0.1', port: 8080 });

if (!app.server) {
  throw new Error('Backend HTTP app server should be initialized');
}
