# Codress repository guidance

## Renderer UI

Before changing renderer controls or interaction patterns, read `docs/contracts/ui-components.md`.

- Reuse shared components before adding page-local controls.
- Use `UnifiedSelect` for dropdown behavior; do not add native `select` or `datalist` without documenting the exception.
- Preserve clear boundaries between selected, hover, focus and disabled states.
- Update the UI contract whenever shared behavior or its verification checklist changes.

## Verification

For desktop renderer changes, run from `platform/apps/desktop`:

```sh
npx tsc --noEmit
npm run build
```
