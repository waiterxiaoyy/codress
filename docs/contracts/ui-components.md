# Codress UI component contracts

This document defines reusable renderer UI behavior. Treat it as an implementation contract, not a visual suggestion.

## Shared-component rule

- Search `platform/apps/desktop/src/renderer/src/components` before creating a new control.
- Repeated interaction patterns must be implemented once as a shared component. Page-local copies are not acceptable.
- A shared component change must be checked in every existing consumer, not only on the page that requested the change.
- When a reusable behavior changes, update this contract in the same patch.

## Dropdowns

Use `components/UnifiedSelect.tsx` for renderer dropdowns, including form selection and store filters. Do not introduce native `<select>` or `<datalist>` controls unless a documented platform constraint requires them.

### Data contract

- Every option has a stable `value` and user-facing `label`; `description` is optional.
- Remote results and local defaults must remain distinguishable. Do not merge a local default into a remotely fetched list and present it as a remote result.
- Counts such as “8 available” describe the actual source result, not local fallbacks.
- When remote discovery is unavailable, preserve an explicit manual-entry path.

### Visual-state contract

- `selected` and `hover` are independent states and must remain visually distinguishable.
- Adjacent selected and hovered rows must never form one uninterrupted background block.
- The menu keeps at least a 2 px gap between rows and each interactive row owns a transparent/default border.
- Selected rows use a persistent border plus background; hovered rows use their own border plus background.
- `selected:hover` must have a deliberate combined style rather than relying on CSS source order.
- Trigger height, border radius, typography and chevron alignment stay consistent between filter and form contexts.
- Long labels truncate in the trigger and option rows; the menu scrolls instead of expanding past the viewport.

### Interaction and accessibility contract

- Clicking outside and pressing Escape close the menu.
- Selecting an option calls `onChange` once and closes the menu.
- Disabled controls close any open menu and cannot be activated.
- The trigger exposes `aria-haspopup="listbox"` and `aria-expanded`; options expose `role="option"` and `aria-selected`.
- The selected option has a persistent non-color-only check indicator.

### Dropdown QA checklist

Verify all of the following whenever `UnifiedSelect` or its styles change:

1. Closed, open, disabled and empty states.
2. Selected row alone.
3. Row immediately above and below the selected row on hover.
4. Selected row on hover.
5. Long option names and an overflowing option list.
6. Store category filters, creator model selection and creator target-app selection.
7. Remote option counts and manual fallback labeling.

## Source locations

- Component: `platform/apps/desktop/src/renderer/src/components/UnifiedSelect.tsx`
- Shared styles: `platform/apps/desktop/src/renderer/src/global.css`
- Store wrapper: `platform/apps/desktop/src/renderer/src/components/StoreControls.tsx`

## Async action feedback

- Buttons that start installation, activation, removal or another visible asynchronous mutation must disable conflicting actions immediately and show `ButtonLoadingLabel` until completion.
- Loading copy describes the active operation, for example `安装中…`, `上桌中…` or `收起中…`; changing only the disabled state is not sufficient feedback.
- Infinite-scroll sentinels stay visually silent while idle. Show a loading row only while the next page request is actually in flight.

## Color themes

- Renderer surfaces support `auto`, `light` and `dark`; `auto` reacts to `prefers-color-scheme` changes without restart.
- Theme selection uses the three-option capsule control in Settings and persists through `renderer/src/theme.ts`; use this pattern for small, fixed, mutually exclusive view choices.
- Use semantic CSS variables (`--bg`, `--canvas`, `--fg`, `--muted`, `--line`, `--soft`, `--soft2`) instead of page-local light-only colors.
- Status colors may remain semantic red, green or accent colors, but their background and contrast must be checked in both themes.
- New components must be checked in forced light, forced dark and automatic modes.
- Do not infer a remote content image's theme or recolor user/store artwork globally.

## Page lifetime and animated media

- Sidebar pages mount lazily on first visit and remain mounted when the user changes sections; filters, detail state and scroll containers must survive navigation.
- Each kept-alive page owns its scroll container. Code that observes scrolling or intersections must use `.page-keepalive` as its root rather than the shared `.content` shell.
- Hidden pages must pause animation, polling and other continuous visual work. Keeping component state alive does not authorize background rendering.
- Realtime application-status events may refresh local status, but must not implicitly refetch an unrelated remote store list.
- Animated store previews load lazily and run only while their card is near the visible viewport and the document is visible.

## Desktop pet interaction

- A single primary-button gesture is reserved for dragging the desktop pet; a click without movement does not open Codress.
- Double-clicking the pet opens or focuses the Codress main window. A gesture that crossed the drag threshold must not also open the app.
- “上桌中…” completes with the pet window's visible state: settings and asset preparation happen before the final show operation, so the UI must not remain loading after the pet is already visible.
