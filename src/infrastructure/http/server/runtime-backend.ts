import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as http from 'node:http';
import * as os from 'node:os';
import * as path from 'node:path';
import { generateReminderController, generateReplyController, reformulateController, summarizeMailController } from '@infrastructure/http/controllers/ai.controller';

type JsonObject = Record<string, unknown>;

const HOST = String(process.env.ISENAPP_BACKEND_HOST || '127.0.0.1').trim() || '127.0.0.1';
const PORT = Number(process.env.ISENAPP_BACKEND_PORT || '8080') || 8080;
const RESOURCES_ROOT = String(process.env.ISENAPP_RESOURCES_ROOT || process.cwd()).trim() || process.cwd();
const DATA_DIR = path.resolve(String(process.env.ISENAPP_DATA_DIR || path.join(os.homedir(), '.local', 'share', 'neurail')));
const APP_NAME = 'neurail';

const RUNTIME_CONFIG_FILE = path.join(DATA_DIR, 'runtime_config.json');
const ENV_FILE = path.join(DATA_DIR, '.env');
const DATA_FILE = path.join(DATA_DIR, 'data.json');
const CONTACTS_FILE = path.join(DATA_DIR, 'contacts_complets_v2.csv');
const ACCOUNTS_FILE = path.join(DATA_DIR, 'accounts.json');
const INBOX_FILE = path.join(DATA_DIR, 'inbox_index.json');
const RENDERER_DIR = path.join(RESOURCES_ROOT, 'src', 'renderer');
const BUNDLED_DATA_DIR = path.join(RESOURCES_ROOT, 'data');

function ensureDir(dirPath: string): void {
  fs.mkdirSync(dirPath, { recursive: true });
}

function readJsonFile<T>(filePath: string, fallback: T): T {
  try {
    if (!fs.existsSync(filePath)) return fallback;
    const raw = fs.readFileSync(filePath, 'utf8');
    const parsed = JSON.parse(raw) as unknown;
    return (parsed as T) ?? fallback;
  } catch {
    return fallback;
  }
}

function writeJsonFile(filePath: string, payload: unknown): void {
  const tmpPath = `${filePath}.tmp`;
  fs.writeFileSync(tmpPath, JSON.stringify(payload, null, 2), 'utf8');
  fs.renameSync(tmpPath, filePath);
}

function bootstrapDataFile(fileName: string, fallbackPayload: unknown): void {
  const dst = path.join(DATA_DIR, fileName);
  if (fs.existsSync(dst)) return;

  const src = path.join(BUNDLED_DATA_DIR, fileName);
  try {
    if (fs.existsSync(src)) {
      fs.copyFileSync(src, dst);
      return;
    }
  } catch {
    // Fallback below.
  }

  if (typeof fallbackPayload === 'string') {
    fs.writeFileSync(dst, fallbackPayload, 'utf8');
  } else {
    writeJsonFile(dst, fallbackPayload);
  }
}

function ensureRuntimeFiles(): void {
  ensureDir(DATA_DIR);
  ensureDir(getMailsDir());
  bootstrapDataFile('data.json', { sections: [], settings: {} });
  bootstrapDataFile('contacts_complets_v2.csv', 'Display Name,First Name,Last Name,Primary Email\n');

  if (!fs.existsSync(RUNTIME_CONFIG_FILE)) {
    writeJsonFile(RUNTIME_CONFIG_FILE, {
      paths: {
        mails_dir: getMailsDir(),
        vault_dir: getMailsDir(),
      },
    });
  }

  if (!fs.existsSync(ENV_FILE)) {
    fs.writeFileSync(
      ENV_FILE,
      [
        '# NeuRail runtime environment',
        'GEMINI_API_KEY=',
        'GEMINI_MODEL=gemma-3-27b-it',
        'GEMINI_FALLBACK_MODELS=gemini-2.5-flash',
        'EMBEDDING_MODEL=intfloat/multilingual-e5-base',
        '',
      ].join('\n'),
      'utf8',
    );
  }
}

function readRuntimeConfig(): JsonObject {
  return readJsonFile<JsonObject>(RUNTIME_CONFIG_FILE, {});
}

function getMailsDir(): string {
  const runtime = readRuntimeConfig();
  const paths = runtime.paths as JsonObject | undefined;
  const configured = typeof paths?.mails_dir === 'string' ? paths.mails_dir.trim() : '';
  const mailsDir = configured || path.join(DATA_DIR, 'mails');
  ensureDir(mailsDir);
  return path.resolve(mailsDir);
}

function readRuntimeEnv(): Record<string, string> {
  const values: Record<string, string> = {};
  try {
    if (!fs.existsSync(ENV_FILE)) return values;
    const lines = fs.readFileSync(ENV_FILE, 'utf8').split(/\r?\n/);
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) continue;
      const [keyRaw, ...rest] = trimmed.split('=');
      const key = (keyRaw || '').trim();
      if (!key) continue;
      values[key] = rest.join('=').trim();
    }
  } catch {
    return {};
  }
  return values;
}

function writeRuntimeEnv(input: JsonObject): void {
  const current = readRuntimeEnv();
  const allowedKeys = ['GEMINI_API_KEY', 'GEMINI_MODEL', 'GEMINI_FALLBACK_MODELS', 'EMBEDDING_MODEL'];
  for (const key of allowedKeys) {
    if (typeof input[key] === 'string') {
      current[key] = String(input[key]);
      process.env[key] = current[key];
    }
  }

  const lines = ['# NeuRail runtime environment'];
  for (const key of allowedKeys) {
    lines.push(`${key}=${current[key] || ''}`);
  }
  lines.push('');
  fs.writeFileSync(ENV_FILE, lines.join('\n'), 'utf8');
}

async function readJsonBody(request: http.IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  if (!chunks.length) return {};
  const raw = Buffer.concat(chunks).toString('utf8').trim();
  if (!raw) return {};
  return JSON.parse(raw) as unknown;
}

function sendJson(response: http.ServerResponse, status: number, payload: unknown): void {
  const body = Buffer.from(JSON.stringify(payload), 'utf8');
  response.statusCode = status;
  response.setHeader('Content-Type', 'application/json');
  response.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  response.setHeader('Content-Length', String(body.length));
  response.end(body);
}

function sendText(response: http.ServerResponse, status: number, text: string, contentType = 'text/plain; charset=utf-8'): void {
  const body = Buffer.from(text, 'utf8');
  response.statusCode = status;
  response.setHeader('Content-Type', contentType);
  response.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  response.setHeader('Content-Length', String(body.length));
  response.end(body);
}

function contentTypeFor(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.html') return 'text/html; charset=utf-8';
  if (ext === '.css') return 'text/css; charset=utf-8';
  if (ext === '.js') return 'application/javascript; charset=utf-8';
  if (ext === '.ts') return 'application/javascript; charset=utf-8';
  if (ext === '.json') return 'application/json; charset=utf-8';
  if (ext === '.svg') return 'image/svg+xml';
  if (ext === '.png') return 'image/png';
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg';
  if (ext === '.gif') return 'image/gif';
  return 'application/octet-stream';
}

function parseContactsCsv(csvContent: string): Array<{ name: string; email: string }> {
  const lines = csvContent.split(/\r?\n/).filter((line) => line.trim().length > 0);
  if (lines.length < 2) return [];

  const headerLine = lines[0];
  if (!headerLine) return [];
  const headers = headerLine.split(',').map((header) => header.trim());
  const idxDisplay = headers.indexOf('Display Name');
  const idxFirst = headers.indexOf('First Name');
  const idxLast = headers.indexOf('Last Name');
  const idxEmail = headers.indexOf('Primary Email');
  if (idxEmail < 0) return [];

  const out: Array<{ name: string; email: string }> = [];
  for (let i = 1; i < lines.length; i += 1) {
    const line = lines[i];
    if (!line) continue;
    const cols = line.split(',').map((value) => value.trim());
    const email = cols[idxEmail] || '';
    if (!email) continue;
    const display = idxDisplay >= 0 ? cols[idxDisplay] || '' : '';
    const first = idxFirst >= 0 ? cols[idxFirst] || '' : '';
    const last = idxLast >= 0 ? cols[idxLast] || '' : '';
    const name = display || `${first} ${last}`.trim();
    out.push({ name, email });
  }
  return out;
}

function buildAppConfigPayload(): JsonObject {
  const env = readRuntimeEnv();
  const mailsDir = getMailsDir();
  return {
    ok: true,
    paths: {
      app_data_dir: DATA_DIR,
      runtime_config_file: RUNTIME_CONFIG_FILE,
      runtime_env_file: ENV_FILE,
      data_json: DATA_FILE,
      accounts_file: ACCOUNTS_FILE,
      inbox_index_file: INBOX_FILE,
      contacts_csv: CONTACTS_FILE,
      mails_dir: mailsDir,
      vault_dir: mailsDir,
      log_file: path.join(DATA_DIR, 'api_errors.log'),
    },
    env: {
      GEMINI_API_KEY: env.GEMINI_API_KEY || process.env.GEMINI_API_KEY || '',
      GEMINI_MODEL: env.GEMINI_MODEL || process.env.GEMINI_MODEL || 'gemma-3-27b-it',
      GEMINI_FALLBACK_MODELS: env.GEMINI_FALLBACK_MODELS || process.env.GEMINI_FALLBACK_MODELS || 'gemini-2.5-flash',
      EMBEDDING_MODEL: env.EMBEDDING_MODEL || process.env.EMBEDDING_MODEL || 'intfloat/multilingual-e5-base',
    },
  };
}

function computeMailId(input: string): string {
  return crypto.createHash('sha1').update(input).digest('hex').slice(0, 24);
}

function loadInbox(): JsonObject[] {
  const payload = readJsonFile<unknown>(INBOX_FILE, []);
  return Array.isArray(payload) ? (payload as JsonObject[]) : [];
}

function saveInbox(items: JsonObject[]): void {
  writeJsonFile(INBOX_FILE, items);
}

function isPathInside(baseDir: string, candidatePath: string): boolean {
  const rel = path.relative(baseDir, candidatePath);
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
}

function resolveAssetPath(urlPath: string): string | null {
  const normalized = urlPath === '/' ? '/index.html' : urlPath;
  const clean = normalized.split('?')[0] || '/index.html';
  const rel = clean.startsWith('/') ? clean.slice(1) : clean;
  const full = path.resolve(path.join(RENDERER_DIR, rel));
  if (!isPathInside(RENDERER_DIR, full)) return null;
  if (!fs.existsSync(full) || !fs.statSync(full).isFile()) return null;
  return full;
}

async function handleApiRequest(request: http.IncomingMessage, response: http.ServerResponse): Promise<boolean> {
  const method = String(request.method || 'GET').toUpperCase();
  const pathname = new URL(request.url || '/', `http://${HOST}:${PORT}`).pathname;

  if (!pathname.startsWith('/api/')) return false;

  try {
    if (method === 'GET' && pathname === '/api/state') {
      sendJson(response, 200, readJsonFile<JsonObject>(DATA_FILE, { sections: [], settings: {} }));
      return true;
    }

    if (method === 'POST' && pathname === '/api/state') {
      const body = (await readJsonBody(request)) as JsonObject;
      writeJsonFile(DATA_FILE, body);
      sendJson(response, 200, { ok: true });
      return true;
    }

    if (method === 'GET' && pathname === '/api/contacts') {
      const csv = fs.existsSync(CONTACTS_FILE) ? fs.readFileSync(CONTACTS_FILE, 'utf8') : '';
      sendJson(response, 200, parseContactsCsv(csv));
      return true;
    }

    if (method === 'POST' && pathname === '/api/contacts/import') {
      const body = (await readJsonBody(request)) as JsonObject;
      const csv = typeof body.csv === 'string' ? body.csv : '';
      if (!csv.trim()) {
        sendJson(response, 400, { error: 'Aucun contenu CSV' });
        return true;
      }
      fs.writeFileSync(CONTACTS_FILE, csv, 'utf8');
      sendJson(response, 200, { ok: true, count: parseContactsCsv(csv).length });
      return true;
    }

    if (method === 'GET' && pathname === '/api/app-config') {
      sendJson(response, 200, buildAppConfigPayload());
      return true;
    }

    if (method === 'POST' && pathname === '/api/app-config') {
      const body = (await readJsonBody(request)) as JsonObject;
      const paths = typeof body.paths === 'object' && body.paths ? (body.paths as JsonObject) : {};
      const env = typeof body.env === 'object' && body.env ? (body.env as JsonObject) : {};

      const requestedMailsDir = typeof paths.mails_dir === 'string' ? paths.mails_dir.trim() : '';
      const mailsDir = path.resolve(requestedMailsDir || getMailsDir());
      ensureDir(mailsDir);

      writeJsonFile(RUNTIME_CONFIG_FILE, {
        paths: {
          mails_dir: mailsDir,
          vault_dir: mailsDir,
        },
        updated_at: new Date().toISOString(),
      });
      writeRuntimeEnv(env);

      sendJson(response, 200, { ok: true, requires_restart: true });
      return true;
    }

    if (method === 'GET' && pathname === '/api/system/check') {
      sendJson(response, 200, {
        ok: true,
        platform: process.platform,
        checks: [
          { id: 'node', ok: true, details: process.version },
          { id: 'data-dir', ok: fs.existsSync(DATA_DIR), details: DATA_DIR },
        ],
        backend: 'typescript',
      });
      return true;
    }

    if (method === 'GET' && pathname === '/api/accounts') {
      const accounts = readJsonFile<unknown>(ACCOUNTS_FILE, []);
      sendJson(response, 200, Array.isArray(accounts) ? accounts : []);
      return true;
    }

    if (method === 'POST' && pathname === '/api/accounts/save') {
      const body = (await readJsonBody(request)) as JsonObject;
      const accounts = Array.isArray(body.accounts) ? body.accounts : [];
      writeJsonFile(ACCOUNTS_FILE, accounts);
      sendJson(response, 200, { ok: true });
      return true;
    }

    if (method === 'GET' && pathname === '/api/inbox') {
      const inbox = loadInbox();
      const visible = inbox.filter((mail) => !mail.deleted && mail.folder !== 'sent');
      visible.sort((a, b) => Number(b.date_ts || 0) - Number(a.date_ts || 0));
      sendJson(response, 200, visible);
      return true;
    }

    if (method === 'GET' && pathname === '/api/inbox/sent') {
      const inbox = loadInbox();
      const sent = inbox.filter((mail) => mail.folder === 'sent' && !mail.deleted);
      sent.sort((a, b) => Number(b.date_ts || 0) - Number(a.date_ts || 0));
      sendJson(response, 200, sent);
      return true;
    }

    if (method === 'GET' && pathname.startsWith('/api/mail/attachment')) {
      sendJson(response, 404, { error: 'Attachment not found' });
      return true;
    }

    if (method === 'GET' && pathname.startsWith('/api/mail/')) {
      const mailId = decodeURIComponent(pathname.replace('/api/mail/', ''));
      const inbox = loadInbox();
      const found = inbox.find((mail) => String(mail.id || '') === mailId);
      if (!found) {
        sendJson(response, 404, { error: 'Mail introuvable' });
        return true;
      }
      sendJson(response, 200, found);
      return true;
    }

    if (method === 'POST' && pathname === '/api/mail/mark-processed') {
      const body = (await readJsonBody(request)) as JsonObject;
      const mailId = String(body.id || '');
      const processed = Boolean(body.processed ?? true);
      const inbox = loadInbox();
      const found = inbox.find((mail) => String(mail.id || '') === mailId);
      if (!found) {
        sendJson(response, 404, { error: 'Mail introuvable' });
        return true;
      }
      found.processed = processed;
      saveInbox(inbox);
      sendJson(response, 200, { ok: true });
      return true;
    }

    if (method === 'POST' && pathname === '/api/mail/delete') {
      const body = (await readJsonBody(request)) as JsonObject;
      const mailId = String(body.id || '');
      const inbox = loadInbox();
      const found = inbox.find((mail) => String(mail.id || '') === mailId);
      if (!found) {
        sendJson(response, 404, { error: 'Mail introuvable' });
        return true;
      }
      found.deleted = true;
      saveInbox(inbox);
      sendJson(response, 200, { ok: true, remote: { already_missing: false, error: null } });
      return true;
    }

    if (method === 'POST' && pathname === '/api/mail/delete-batch') {
      const body = (await readJsonBody(request)) as JsonObject;
      const ids = Array.isArray(body.ids) ? body.ids.map((id) => String(id)) : [];
      const inbox = loadInbox();
      let deleted = 0;
      for (const mail of inbox) {
        if (ids.includes(String(mail.id || ''))) {
          mail.deleted = true;
          deleted += 1;
        }
      }
      saveInbox(inbox);
      sendJson(response, 200, { ok: true, deleted, errors: [], remote: { already_missing: 0, failed: [] } });
      return true;
    }

    if (method === 'POST' && pathname === '/api/fetch-emails') {
      sendJson(response, 200, { ok: true, new_count: 0, errors: [] });
      return true;
    }

    if (method === 'POST' && pathname === '/api/send-email') {
      const body = (await readJsonBody(request)) as JsonObject;
      const from = String(body.from || '');
      const to = String(body.to || '');
      const subject = String(body.subject || '');
      const textBody = String(body.body || '');
      const now = Date.now();
      const mailId = computeMailId(`${from}|${to}|${subject}|${now}`);
      const emlFile = `SENT_${mailId}.eml`;

      const lines = [
        `From: ${from}`,
        `To: ${to}`,
        `Subject: ${subject}`,
        `Date: ${new Date(now).toUTCString()}`,
        '',
        textBody,
      ];

      const inbox = loadInbox();
      inbox.unshift({
        id: mailId,
        subject,
        from_name: '',
        from_email: from,
        to,
        cc: String(body.cc || ''),
        date: new Date(now).toISOString().replace('T', ' ').slice(0, 16),
        date_ts: now,
        message_id: `<${mailId}@${APP_NAME}>`,
        body: textBody,
        body_html: String(body.html_body || ''),
        attachments: Array.isArray(body.attachments) ? body.attachments : [],
        account: from,
        folder: 'sent',
        processed: true,
        deleted: false,
        eml_file: emlFile,
      });
      saveInbox(inbox);

      const sentPath = path.join(getMailsDir(), emlFile);
      fs.writeFileSync(sentPath, lines.join('\n'), 'utf8');

      sendJson(response, 200, { ok: true });
      return true;
    }

    if (method === 'POST' && pathname === '/api/save-eml') {
      const body = (await readJsonBody(request)) as JsonObject;
      const now = Date.now();
      const fileName = `MAIL_${now}.eml`;
      const target = path.join(getMailsDir(), fileName);
      const content = [
        `From: ${String(body.from || '')}`,
        `To: ${String(body.to || '')}`,
        `Subject: ${String(body.subject || '')}`,
        `Date: ${new Date(now).toUTCString()}`,
        '',
        String(body.body || ''),
      ].join('\n');
      fs.writeFileSync(target, content, 'utf8');
      sendJson(response, 200, { ok: true, path: target });
      return true;
    }

    if (method === 'POST' && pathname === '/api/oauth/google/start') {
      sendJson(response, 501, { error: 'OAuth flow not implemented in TS backend yet' });
      return true;
    }

    if (method === 'GET' && pathname === '/api/oauth/google/callback') {
      sendText(response, 501, 'OAuth callback not implemented in TS backend yet', 'text/html; charset=utf-8');
      return true;
    }

    if (method === 'POST' && pathname === '/api/autoconfig') {
      sendJson(response, 501, { error: 'Autoconfig not implemented in TS backend yet' });
      return true;
    }

    if (method === 'POST' && pathname === '/api/mail/summarize') {
      const body = (await readJsonBody(request)) as JsonObject;
      sendJson(response, 200, await summarizeMailController(body));
      return true;
    }

    if (method === 'POST' && pathname === '/api/reformulate') {
      const body = (await readJsonBody(request)) as JsonObject;
      sendJson(response, 200, await reformulateController(body));
      return true;
    }

    if (method === 'POST' && pathname === '/api/generate-reply') {
      const body = (await readJsonBody(request)) as JsonObject;
      sendJson(response, 200, await generateReplyController(body));
      return true;
    }

    if (method === 'POST' && pathname === '/api/generate-reminder') {
      const body = (await readJsonBody(request)) as JsonObject;
      sendJson(response, 200, await generateReminderController(body));
      return true;
    }

    if (method === 'GET' && pathname === '/api/annuaire') {
      const contacts = fs.existsSync(CONTACTS_FILE) ? parseContactsCsv(fs.readFileSync(CONTACTS_FILE, 'utf8')) : [];
      sendJson(response, 200, contacts.map((contact) => ({ ...contact, sources: ['import'], mail_count: 0 })));
      return true;
    }

    sendJson(response, 404, { error: 'Route not found' });
    return true;
  } catch (error) {
    sendJson(response, 500, { error: error instanceof Error ? error.message : String(error) });
    return true;
  }
}

function handleStaticRequest(request: http.IncomingMessage, response: http.ServerResponse): void {
  const reqUrl = new URL(request.url || '/', `http://${HOST}:${PORT}`);
  const assetPath = resolveAssetPath(reqUrl.pathname);
  if (!assetPath) {
    sendText(response, 404, 'Not found');
    return;
  }

  try {
    const content = fs.readFileSync(assetPath);
    response.statusCode = 200;
    response.setHeader('Content-Type', contentTypeFor(assetPath));
    response.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    response.setHeader('Content-Length', String(content.length));
    response.end(content);
  } catch {
    sendText(response, 500, 'Internal server error');
  }
}

async function main(): Promise<void> {
  ensureRuntimeFiles();

  const server = http.createServer(async (request, response) => {
    const handled = await handleApiRequest(request, response);
    if (handled) return;
    handleStaticRequest(request, response);
  });

  server.listen(PORT, HOST, () => {
    // eslint-disable-next-line no-console
    console.log(`Starting NeuRail TS backend at http://${HOST}:${PORT}`);
  });

  const shutdown = () => {
    server.close(() => {
      process.exit(0);
    });
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

void main();