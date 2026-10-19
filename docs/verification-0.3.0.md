# 0.3.0 verification

## Compatibility contract

- Automatic registration, the passive manual entry, existing ESM/UMD namespaces and editable Office defaults remain available.
- Default PDF `load` still means every page is painted; eager rendering releases its worker after completion.
- Virtual PDF rendering is opt-in through `pdf-mode="virtual"` / `pdfMode`. Its initial `load` means the viewport and buffer are ready; the worker lives until cancellation. At most six canvases are retained. Placeholders preserve page positions.
- Office `readonly` changes use correlated `document:set-readonly` commands. They preserve the iframe, unsaved edits and dirty state; command failure reports an error while preserving the current editor. Legacy renderers still support editable files and reject unsupported read-only requests.

## Reproduced before fixing

Browser regressions initially failed for: lost Office edits on close-control/read-only changes, delayed modern renderer startup, missing `crypto.randomUUID` on HTTP, legacy chunk reads continuing after cancellation, missing acknowledgement backpressure, non-responsive PDF width, excessive page backing pixels/DPR, and demo Blob URLs accumulating when selecting a replacement file.

Additional regressions cover rapid mode changes, source replacement, disconnection/reconnection, PDF mode changes, virtual viewport recycling, resize during active painting, and retained-worker failure cleanup. Real PDF fixtures exercise actual PDF.js painting and pixels, rather than mocking the renderer.

## Validation

Local final validation passed 144 browser regressions across the three engines, 44 release-helper unit tests, frozen installation, strict TypeScript, formatting and ESM/UMD/declaration builds.

The release checks run strict TypeScript, formatting, release-helper unit tests, browser regressions in Chromium/Firefox/WebKit, ESM/UMD/declaration builds and installed-tarball consumer checks. Installed-package verification checks passive SSR import, typed custom element properties/methods, safe constructor narrowing, React attributes, public exports and local PDF worker/font/cMap/WASM assets.

Release-helper tests use a fake registry and injected publish runner. They exercise new publication, matching-version retries, integrity/name/version mismatches, HTTP/auth/network errors, immutable stored artifacts and source-tag validation. They do not publish a test version to npm.

## Live Office integration

Opt-in command:

```sh
FILEVIEW_LIVE_OFFICE=1 FILEVIEW_LIVE_CASE=default.docx pnpm exec tsx scripts/office-smoke.mjs
FILEVIEW_LIVE_OFFICE=1 FILEVIEW_LIVE_CASE=default.pptx pnpm exec tsx scripts/office-smoke.mjs
```

Both live cases passed against the deployed renderer. The initial PPTX attempt stalled inside SDK loading; a clean retry completed successfully.

The Vite server runs separately on port 5201. The script connects to `https://edit.chaxus.com` and exercises the actual document embed API and Office SDK. DOCX coverage inserts a real unsaved text edit, toggles close controls and read-only mode in both directions, verifies SDK restrictions and dirty-state retention, and saves/parses the DOCX to confirm the edit survives. It also asserts iframe identity and exactly one initial `load`. PPTX verifies live mode changes and iframe retention; it does not insert a synthetic edit into a slide.

## Limits

- The original attachment for Issue #4 is still unavailable. Synthetic image/text coverage from 0.2.0 does not establish that the reporter's exact document is fixed.
- Virtual mode caps active canvas allocations, not total process memory: PDF.js still retains document data and page metadata. Eager total canvas memory continues to grow with page count.
- Large-page pixel caps deliberately trade resolution for bounded per-page allocation. Eager canvases scale down with their container after painting; virtual mode also repaints on container resize.
- Office file contents become accessible to the configured iframe. Private/intranet deployments should host that editor themselves.
- Live renderer tests are outside CI because they depend on the separately deployed editor and its network/assets.
