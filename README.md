# @ranui/preview

[English](README.md) | [中文](README.zh-CN.md)

PDF and Office preview in a browser custom element. PDF rendering runs locally;
Office files open in a configurable document editor iframe. No application account
or conversion server is required by this package.

## Install and automatic registration

```sh
npm install @ranui/preview@0.2.0
```

```ts
import '@ranui/preview';
await customElements.whenDefined('r-preview');
```

```html
<r-preview src="/reports/annual.pdf" label="Open annual report">Open report</r-preview>
```

Setting `src` on a connected element opens the dialog immediately. Clicking the
trigger opens it again after closing. HTTP URLs require the usual browser CORS
permissions. Blob URLs must carry a supported MIME type; release each object URL
when replacing its source or disposing its owner.

## Manual registration and Vue

The manual entry registers nothing on import and is safe to import during SSR.
Call it on the client, before accessing the upgraded element's properties:

```ts
import { registerPreview } from '@ranui/preview/manual';
await registerPreview('app-file-preview'); // defaults to r-preview
```

```html
<app-file-preview src="/slides/deck.pptx" readonly>View slides</app-file-preview>
```

For Vue, configure the template compiler to treat your chosen tag as a custom
component, then register it in client startup (or `onMounted`):

```ts
// vite.config.ts, with @vitejs/plugin-vue
vue({ template: { compilerOptions: { isCustomElement: (tag) => tag === 'app-file-preview' } } });
```

The existing root namespace (`import { preview } from '@ranui/preview'`),
`@ranui/preview/preview` entry and UMD `ranui.preview` remain available.

## API

| Attribute / property  | Default                        | Behavior                                                                                                    |
| --------------------- | ------------------------------ | ----------------------------------------------------------------------------------------------------------- |
| `src`                 | unset                          | PDF, DOCX, PPTX, XLSX or XLS URL; setting it opens the preview                                              |
| `baseUrl` / `baseurl` | `https://edit.chaxus.com`      | Office editor deployment URL, including a path/query if needed                                              |
| `readonly`            | false                          | Opt-in Office read-only mode; empty attribute or property `true` enables it; `readonly="false"` disables it |
| `closeable`           | enabled                        | Set `closeable="false"` to hide the close control and disable Escape dismissal                              |
| `label`               | trigger text or “Preview file” | Accessible name of the trigger                                                                              |

`src`, `label`, `baseUrl` and `closeable` retain their string property contracts;
`readonly` is a boolean property. Use attributes before registration completes.
Call `showPreview()` or `closePreview()` after upgrading the element.

`load` fires once when all PDF pages finish painting or the Office editor confirms
opening. `error` fires once on a download, unsupported format or renderer error;
its `detail` contains the error. Both events bubble and cross shadow boundaries.
Replacing the source, closing or disconnecting cancels the active operation and
suppresses its obsolete events. Each element owns its dialog, iframe and worker.

Dialogs support Enter/Space activation, Escape dismissal, close-button focus,
focus restoration and a visible keyboard focus indicator. Mobile sizing accounts
for dynamic viewports and safe areas.

## Office renderer and read-only mode

Office rendering belongs to the iframe deployment, not PDF.js. The current
[document project](https://github.com/ranuts/document) exposes the structured
`document:*` embed API: fileview probes `document:get-state`, sends
`document:open-file` with a browser `File` and the requested `readonly` flag, then
waits for the correlated `document:opened` or `document:error` response. It accepts
messages only from that iframe and its configured origin.

Existing deployments using the `RENDER_OFFICE` chunk protocol remain supported
in the default editable mode. An old renderer without the embed API cannot
promise enforced read-only mode: requesting it returns an explicit error asking
you to update the deployment. Updating `readonly` while open reloads the file in
the requested mode. This controls editing in the renderer; it does not prevent
users from downloading or copying bytes they already have access to.

## Intranet and offline deployment

- **PDF:** serve the installed package's complete `dist` directory. Its bundled
  PDF.js API/worker and `dist/pdfjs/{cmaps,standard_fonts,wasm}` assets stay local.
  Preserve these relative paths when copying or deploying the package. A bundler
  that relocates its JavaScript must also copy `pdfjs/` beside the emitted ES
  entry (one directory above `umd/` for UMD). No PDF CDN is contacted.
- **Office:** deploy the document editor's complete static distribution inside
  your network, including its WASM engine, Office editor scripts, fonts and other
  assets. Set `baseUrl="https://office.internal.example/editor"` to that page.
  A URL containing only a WASM binary is not an Office rendering page. Replacing
  `baseUrl` does not copy or proxy the editor's dependencies for you.
- Host the preview page, input files and editor assets on reachable intranet
  HTTP(S) origins. Allow iframe embedding and the necessary CORS requests. For
  PDF workers, CSP must permit `worker-src blob:`; serve `.wasm` with
  `application/wasm`. Review your renderer's own CSP requirements as well.
- Files sent to a remote Office `baseUrl` become available to that iframe. Use
  your own deployment when files must stay inside your network.

Default PDF preview never creates an Office iframe. Merely registering an idle
component makes no request to the remote Office editor.

## Compatibility and migration

0.2.0 preserves automatic `r-preview` registration and existing URL attributes,
while adding manual registration and opt-in read-only behavior. It replaces
vendored PDF.js 3.2 with 6.4 and corrects page numbering, completion, failures and
worker cleanup. Use current evergreen Chromium, Firefox and WebKit; these engines
are exercised in CI. Earlier claimed Chrome 88 / Safari 14 support is not verified
for the new PDF engine. Node.js 24+ is required for development/build tooling.

If an older application still uses `https://ranuts.github.io/document`, replace
that redirect URL with the final renderer URL. Cross-origin redirects break the
origin-pinned messaging contract.

## Development and release

```sh
pnpm install --frozen-lockfile  # pnpm 11.6.0, Node 24+
pnpm exec playwright install
pnpm typecheck
pnpm format:check
pnpm test
pnpm build
pnpm test:package
```

Package verification installs the actual tarball in an isolated consumer and
checks strict TypeScript, manual SSR imports, public exports and PDF assets.
GitHub CI runs browser regressions and packaging checks. A stable GitHub release
`v0.2.0` runs the release checks and publishes the exact verified tarball through
npm trusted publishing. Configure `@ranui/preview` for repository `ranuts/fileview`,
workflow `release.yml`, environment `npm`, and allow direct `npm publish`.

See [CHANGELOG.md](CHANGELOG.md). Licensed under [AGPL-3.0](LICENSE).
