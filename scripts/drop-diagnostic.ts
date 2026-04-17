#!/usr/bin/env node

const args = process.argv.slice(2);
process.stdout.write(JSON.stringify({ ok: true, args }, null, 2) + '\n');
