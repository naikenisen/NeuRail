import { registerAiRoutes } from '@infrastructure/http/server/ai-routes.service';
import {
  createJsonHttpServer,
  type CreateJsonHttpServerOptions,
  type JsonHttpServer,
} from '@infrastructure/http/server/http-server.service';

export type BackendHttpApp = {
  server: JsonHttpServer;
};

export function createBackendHttpApp(options: CreateJsonHttpServerOptions): BackendHttpApp {
  const server = createJsonHttpServer(options);
  registerAiRoutes(server);
  return { server };
}
