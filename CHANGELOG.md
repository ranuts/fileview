# Changelog

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
