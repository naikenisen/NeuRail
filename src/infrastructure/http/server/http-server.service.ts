import * as http from 'node:http';
import type { IncomingMessage, ServerResponse } from 'node:http';

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export type JsonRouteResponse = {
  status?: number;
  body: unknown;
};

export type JsonRouteHandler = (payload: unknown, request: IncomingMessage) => Promise<JsonRouteResponse | unknown> | JsonRouteResponse | unknown;

export type JsonHttpServer = {
  registerJsonRoute: (method: HttpMethod, routePath: string, handler: JsonRouteHandler) => void;
  start: () => Promise<void>;
  stop: () => Promise<void>;
};

export type CreateJsonHttpServerOptions = {
  host: string;
  port: number;
};

function routeKey(method: HttpMethod, routePath: string): string {
  return `${method} ${routePath}`;
}

function sendJson(response: ServerResponse, status: number, payload: unknown): void {
  const body = Buffer.from(JSON.stringify(payload), 'utf8');
  response.statusCode = status;
  response.setHeader('Content-Type', 'application/json');
  response.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  response.setHeader('Content-Length', String(body.length));
  response.end(body);
}

async function readJsonBody(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  if (!chunks.length) return {};
  const raw = Buffer.concat(chunks).toString('utf8').trim();
  if (!raw) return {};

  const parsed = JSON.parse(raw) as unknown;
  return parsed ?? {};
}

export function createJsonHttpServer(options: CreateJsonHttpServerOptions): JsonHttpServer {
  const routes = new Map<string, JsonRouteHandler>();

  const server = http.createServer(async (request: IncomingMessage, response: ServerResponse) => {
    const method = (request.method || 'GET').toUpperCase() as HttpMethod;
    const routePath = String(request.url || '/').split('?')[0] || '/';
    const handler = routes.get(routeKey(method, routePath));

    if (!handler) {
      sendJson(response, 404, { error: 'Route not found' });
      return;
    }

    try {
      const payload = method === 'GET' ? {} : await readJsonBody(request);
      const result = await handler(payload, request);
      if (result && typeof result === 'object' && 'body' in (result as Record<string, unknown>)) {
        const typed = result as JsonRouteResponse;
        sendJson(response, typed.status ?? 200, typed.body);
        return;
      }
      sendJson(response, 200, result);
    } catch (error) {
      sendJson(response, 500, { error: error instanceof Error ? error.message : String(error) });
    }
  });

  return {
    registerJsonRoute(method, routePath, handler) {
      routes.set(routeKey(method, routePath), handler);
    },
    async start() {
      await new Promise<void>((resolve, reject) => {
        server.once('error', (error: Error) => {
          reject(error);
        });
        server.listen(options.port, options.host, () => {
          server.removeAllListeners('error');
          resolve();
        });
      });
    },
    async stop() {
      await new Promise<void>((resolve, reject) => {
        server.close((error?: Error) => {
          if (error) {
            reject(error);
            return;
          }
          resolve();
        });
      });
    },
  };
}
