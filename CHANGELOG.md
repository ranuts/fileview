# Changelog

## 0.2.0

- Restore bubbling, composed `load` and `error` events; emit only for the current operation.
- Add passive, SSR-safe manual registration with an optional custom element name.
- Add opt-in Office read-only mode through the document embed API, retaining legacy editable renderer support.
- Isolate dialogs, network requests, Office connections and PDF workers per instance; cancel obsolete loads on source replacement, close and disconnect.
- Add accessible dialog controls, keyboard activation, focus restoration and mobile safe-area/dynamic viewport sizing.
- Upgrade ranui/ranuts to 0.5.0 and PDF.js to 6.4.299; correct PDF page numbering, completion, errors, pixel density and cleanup.
- Ship PDF workers, fonts, cMaps and WASM assets for local deployment.
- Update Node 24+ tooling, strict installed-package type checks, browser regressions and CI/trusted-publishing workflows.
- Document Vue registration, configurable Office hosts, offline deployment and migration limitations.

## 0.1.0-alpha-3 (2026-08-08)

### Changed

- Dependencies aligned with the ecosystem: `ranui` `0.2.0-alpha.5` → `0.4.2-alpha.2`, `ranuts` `0.2.0-alpha.0` → `0.4.0-alpha.2`. This package bundles its own copy of `ranui` (it self-registers `r-icon` / `r-message` via `customElements.define`, guarded so a duplicate registration is a silent no-op), so a consumer's own `ranui` import and this package's bundled one race to claim those tags — whichever wins was, until now, up to two feature releases behind. This bump does not remove the race, but it does mean both sides are current code either way. `md5` / `isSafari` / `Client` / `MessageCodec` / `noop` (from `ranuts/utils`) and `View` / `Div` / `Slot` / `Span` / `Style` (from `ranui/builder`) — the only symbols this package imports — are unchanged across the jump; `tsc --noEmit` and both build targets (`build:es`, `build:umd`) pass with no new errors.
- Not verified in this pass: the office-editor message chunk wire format against the deployed editor (the previous dependency bump's changelog entry called this out explicitly as checked) — worth a manual smoke test against a real DOCX/XLSX preview before publishing.

### Known pre-existing issue (unrelated to this bump)

- `tsc --noEmit` reports `Property 'message' does not exist on type 'Window'` (`components/preview/index.ts`) and two `Property 'pdfjsLib' does not exist` errors (`components/preview/pdf.ts`). Both are declared as global `Window` augmentations in `typings.d.ts`, but that file only reaches the type-checker via `compilerOptions.types` (a field meant for `@types` package names, not relative paths) — reproduces identically on the old dependency versions, so it predates this change.

## 0.1.0-alpha-1 (2026-07-11)

### Fixed

- **Office preview hung forever with the default `baseUrl`.** The default rendering host `https://ranuts.github.io/document` became a redirect-only page after the editor moved to `https://edit.chaxus.com`; postMessage was silently dropped after the cross-origin redirect. The default now points at `https://edit.chaxus.com`. If you are stuck on an older version, set `baseUrl="https://edit.chaxus.com"` explicitly.
- **File chunks could be lost when the preview opened before the editor iframe finished loading.** The transport has no retry, so chunks posted too early were dropped and the preview never resolved. Rendering now waits for the iframe `load` event.
- **Files served with a wrong or empty `Content-Type` failed silently.** The MIME type is now only trusted when it is a renderable type; otherwise it is recovered from the URL extension, and unsupported types show a warning instead of hanging on the loading spinner.
- **Blob URLs (`URL.createObjectURL`) were rejected by the editor with “Unsupported file format”.** Blob URLs expose an extensionless UUID as the filename and XHR blobs carry no name at all (previously sent as `"undefined"`), but the editor detects the format from the extension. The filename is now recovered from the URL and, when the extension is missing, derived from the MIME type.

### Changed

- Dependencies aligned with the ecosystem: `ranui` → `0.2.0-alpha.5`, `ranuts` → `0.2.0-alpha.0` (message chunk wire format verified identical to the deployed editor).
- Toolchain upgraded: Vite 8 (Rolldown), TypeScript 7, Babel 8, Playwright 1.61.
- Removed the dangling `./style` package export — `dist/ranui.css` never existed; styles are injected at runtime.

## 0.0.1-alpha-3 and earlier

Initial extraction of `<r-preview>` from `ranui` into the standalone `@ranui/preview` package: PDF rendered locally via pdf.js, DOCX/XLSX/PPTX/XLS rendered through the embedded document editor.
