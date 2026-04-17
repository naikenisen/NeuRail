import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import type { SafeVaultPath, VaultEdge, VaultGraph, VaultNode } from '@domain/vault/vault-graph.types';

const WIKILINK_RE = /\[\[([^\]|]+?)(?:\|[^\]]*)?\]\]/g;
const DATE_RE = /\*\*.*Date.*:\*\*\s*(\d{4}-\d{2}-\d{2})/;
const ATTACHMENT_EXTS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.svg', '.pdf', '.docx', '.xlsx', '.pptx', '.odt', '.csv', '.zip']);

export function getVaultPath(): string {
  const fromEnv = String(process.env.ISENAPP_VAULT_PATH ?? '').trim();
  if (fromEnv) return path.resolve(fromEnv);
  return path.resolve(path.join(os.homedir(), 'mails'));
}

export function sanitizeVaultRelativePath(relpath: string): string {
  return path.normalize(String(relpath || ''));
}

export function safeVaultFullPath(relpath: string): SafeVaultPath | null {
  const vaultPath = getVaultPath();
  const safe = sanitizeVaultRelativePath(relpath);
  const fullPath = path.resolve(path.join(vaultPath, safe));
  if (!(fullPath === vaultPath || fullPath.startsWith(vaultPath + path.sep))) return null;
  return { safe, fullPath };
}

export function scanVaultGraph(): VaultGraph {
  const vaultPath = getVaultPath();
  const nodes: Record<string, VaultNode> = {};
  const edges: VaultEdge[] = [];

  function walk(dir: string): void {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (entry.name === '.obsidian' || entry.name === '.trash') continue;
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
        continue;
      }

      const relpath = path.relative(vaultPath, fullPath);
      const ext = path.extname(entry.name).toLowerCase();
      const nameNoExt = path.basename(entry.name, path.extname(entry.name));

      if (ext === '.md') {
        let tags: string[] = [];
        let date: string | null = null;

        try {
          const content = fs.readFileSync(fullPath, 'utf-8').slice(0, 4096);
          if (content.startsWith('---')) {
            const end = content.indexOf('---', 3);
            if (end !== -1) {
              for (const line of content.slice(3, end).split('\n')) {
                const trimmed = line.trim();
                if (trimmed.startsWith('- ')) tags.push(trimmed.slice(2).trim());
              }
            }
          }
          const dateMatch = DATE_RE.exec(content);
          if (dateMatch) date = dateMatch[1] ?? null;
        } catch {
          tags = [];
          date = null;
        }

        const group = relpath.includes('mails/') ? 'mail' : 'md';
        nodes[nameNoExt] = {
          id: nameNoExt,
          label: nameNoExt,
          path: relpath,
          type: 'md',
          tags,
          group,
          date,
        };
      } else if (ATTACHMENT_EXTS.has(ext)) {
        nodes[entry.name] = {
          id: entry.name,
          label: entry.name,
          path: relpath,
          type: 'attachment',
          tags: [],
          group: 'attachment',
        };
      }
    }
  }

  walk(vaultPath);

  for (const [name, node] of Object.entries(nodes)) {
    if (node.type !== 'md') continue;
    try {
      const content = fs.readFileSync(path.join(vaultPath, node.path), 'utf-8');
      let match: RegExpExecArray | null;
      WIKILINK_RE.lastIndex = 0;
      while ((match = WIKILINK_RE.exec(content)) !== null) {
        const link = (match[1] ?? '').trim();
        if (!link) continue;

        if (!(link in nodes)) {
          nodes[link] = {
            id: link,
            label: link,
            path: '',
            type: 'orphan',
            tags: [],
            group: 'orphan',
          };
        }

        edges.push({ source: name, target: link });
      }
    } catch {
      continue;
    }
  }

  return {
    nodes: Object.values(nodes),
    edges,
  };
}
