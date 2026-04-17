# Migration Manifest (OLD -> NEW)

This file tracks each legacy module relocation into the new TypeScript structure.
Status values: planned, in-progress, done, removed.

## Main Process

- src/main/main.js -> src/main/main.ts (done)
- src/main/preload.js -> src/main/preload.ts (done)
- src/main/lib/password-vault.js -> src/main/lib/password-vault.ts (done)
- src/main/lib/resource-paths.js -> src/main/lib/resource-paths.ts (done)
- src/main/lib/storage-paths.js -> src/main/lib/storage-paths.ts (done)
- src/main/lib/vault-graph.js -> src/main/lib/vault-graph.ts (done)
- src/main/bootstrap/server-health.js -> src/main/bootstrap/server-health.ts (done)

## Renderer

- src/renderer/renderer.js -> src/renderer/renderer.ts (done)
- src/renderer/index.html -> src/renderer/index.html (runtime script switched to TS asset) (done)
- src/renderer/styles.css -> src/renderer/styles/*.css (planned)
- src/renderer/features/inbox/date-buckets.js -> src/renderer/features/inbox/date-buckets.ts (done)
- src/renderer/app/state-api.js -> src/renderer/app/state-api.ts (done)

## Backend (Python -> TypeScript)

- src/backend/*.py -> src/infrastructure/http/server/runtime-backend.ts + domain/infrastructure TS services (done, Python sources removed)

## Tools

- tools/drag_helper.py -> scripts/drag-helper.ts (done)
- tools/drop_diagnostic.py -> scripts/drop-diagnostic.ts (done)

## Tests

- tests/node/*.test.js -> tests/node/*.test.ts (done)
- tests/python/*.py -> tests/unit|integration/**/*.test.ts (done, Python tests removed)

## Completion Checklist

- [x] JS source count in src/tests/tools equals 0
- [x] Python source count in src/tests/tools equals 0
- [x] TypeScript source is the only implementation language in src/tests/tools
- [x] `npm run typecheck` passes
- [x] tests pass on migrated stack
