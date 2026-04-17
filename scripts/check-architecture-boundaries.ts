import fs from 'node:fs';
import path from 'node:path';

type Violation = {
  file: string;
  line: number;
  message: string;
};

const repoRoot = path.resolve(__dirname, '..');
const srcRoot = path.join(repoRoot, 'src');

function walkTsFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name.startsWith('.')) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...walkTsFiles(full));
      continue;
    }
    if (entry.isFile() && full.endsWith('.ts')) out.push(full);
  }
  return out;
}

function checkBoundaries(): Violation[] {
  const violations: Violation[] = [];
  const files = walkTsFiles(srcRoot);

  for (const file of files) {
    const rel = path.relative(repoRoot, file).replace(/\\/g, '/');
    const content = fs.readFileSync(file, 'utf-8');
    const lines = content.split('\n');

    lines.forEach((line, idx) => {
      const isDomainFile = rel.startsWith('src/domain/');
      const isRendererFile = rel.startsWith('src/renderer/');

      if (isDomainFile && /from\s+['"]@infrastructure\//.test(line)) {
        violations.push({
          file: rel,
          line: idx + 1,
          message: 'Domain layer must not import infrastructure modules.',
        });
      }

      if (isRendererFile && /from\s+['"](node:|fs|path|child_process|os)['"]/.test(line)) {
        violations.push({
          file: rel,
          line: idx + 1,
          message: 'Renderer must not import Node APIs directly.',
        });
      }
    });
  }

  return violations;
}

function main(): void {
  const violations = checkBoundaries();
  if (!violations.length) {
    console.log('Architecture boundary check passed.');
    return;
  }

  console.error('Architecture boundary violations detected:');
  for (const v of violations) {
    console.error(`- ${v.file}:${v.line} ${v.message}`);
  }
  process.exitCode = 1;
}

main();
