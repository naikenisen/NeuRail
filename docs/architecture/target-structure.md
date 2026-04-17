# NeuRail Target Architecture (TypeScript-only)

## Scope

This document defines the mandatory repository architecture for the full migration to TypeScript.
Business behavior must remain unchanged while modules are relocated and typed.

## Layer Strategy

Top-level organization is layer-first to enforce strict runtime boundaries in Electron:

- main: Electron main process only
- renderer: UI process only
- domain: framework-agnostic business logic
- infrastructure: I/O adapters and external integrations
- shared: cross-process contracts and constants
- types: global and ambient type declarations

## Canonical Source Tree

- src
  - main
    - bootstrap
    - windows
    - ipc
    - preload
    - security
  - renderer
    - app
    - ipc
    - features
    - styles
  - domain
  - infrastructure
  - shared
  - types
- tests
  - unit
  - integration
  - e2e
  - fixtures
- config
  - tsconfig
  - eslint
  - vitest
  - electron-builder
- scripts
- assets

## Naming Conventions

- files: kebab-case
- types/interfaces: PascalCase
- suffixes:
  - *.service.ts
  - *.controller.ts
  - *.ipc.ts
  - *.types.ts
  - *.dto.ts

## Dependency Rules

1. renderer must not use Node APIs directly.
2. renderer communicates with main only through typed preload bridge and shared IPC DTOs.
3. domain must not depend on Electron, DOM, Node process APIs, or external frameworks.
4. infrastructure may depend on domain and shared.
5. main and renderer may depend on domain and shared, not on each other directly.
6. circular imports are forbidden.

## Type Rules

1. strict mode is mandatory for all TypeScript projects.
2. noImplicitAny must remain true.
3. cross-boundary payloads must be declared as DTOs.
4. global window augmentation must live in src/types/global-window.d.ts.

## Migration Constraints

1. no business logic changes.
2. no duplicate module implementation in JS and TS after migration is complete.
3. all JavaScript and Python sources must be removed at end-state.
4. tests must be migrated to TypeScript and grouped by layer.

## Transitional Rule

During migration, JS/Python files can temporarily coexist only while equivalent TS modules are being introduced and validated.
Each transitional duplicate must be tracked in docs/architecture/migration-manifest.md.
