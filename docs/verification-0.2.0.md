# 0.2.0 verification

Verified on 2026-10-19 before release. This records synthetic coverage, not a claim
that an unavailable user document has been repaired.

## Automated checks

- 42 browser regressions passed across current Chromium, Firefox and WebKit.
  Coverage includes composed events, keyboard/mobile interaction, initial source,
  cancellation/replacement, concurrent instances, modal stacking and Escape,
  passive custom-name registration, PDF pixels, failures and resource cleanup.
- Frozen dependency installation, TypeScript and Prettier checks passed.
- ESM and UMD builds passed. The actual tarball was installed in an isolated npm
  consumer and passed strict NodeNext/Bundler/CJS/optional React declarations,
  manual SSR import and public-export checks.
- Manual, ESM and UMD installed-package browser entry points painted both PDF
  pages and loaded packaged fonts successfully. PDF fixtures made no external
  network requests; workers and Blob URLs were released on success/error/abort.
- Independent review found and reproduced a modal stacking/Escape defect; the
  fix and both regressions are included. No remaining P1/P2 review findings.

## Live Office integration

Renderer: `https://edit.chaxus.com`. Tests use the actual `document:*` embed API,
Office SDK and exported bytes, rather than a replacement renderer.

| Case                                                     | Observed result                                                                                                                                                              |
| -------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| DOCX, read-only                                          | `readonly: true`, document loaded; SDK restrictions 128 / `canEdit() === false`; save rejected with `Current document is readonly`                                           |
| PPTX, read-only                                          | Same enforced restriction and rejected save                                                                                                                                  |
| DOCX, default                                            | `readonly: false`; SDK restrictions 0 / `canEdit() === true`                                                                                                                 |
| PPTX, default                                            | Same editable default                                                                                                                                                        |
| DOCX containing CJK/Latin paragraphs and a 4000×2000 PNG | DOCX export: 26,774 bytes, both paragraphs and one image retained. PDF export: 200,446 bytes, one page, both paragraphs extracted, one image found in nested paint operators |

No page errors were observed in these five cases. The four mode checks and final
export check were verified in separate runs while correcting the inspection
harness for PDF.js 6 and nested PDF image patterns.

Reproduce against your own renderer in two terminals:

```sh
pnpm exec vite --host 127.0.0.1 --port 5201 --strictPort
FILEVIEW_LIVE_OFFICE=1 pnpm exec tsx scripts/office-smoke.mjs
```

Optional environment variables: `FILEVIEW_LIVE_RENDERER` (editor URL),
`FILEVIEW_LIVE_BASE` (preview development server), `FILEVIEW_LIVE_CASE` (one case),
`FILEVIEW_LIVE_OUTPUT` (report/artifact directory). The script skips by default;
network-dependent live checks are separate from reproducible CI fixtures.

## Limits

Issue #4 describes disappearing text after a particular Word/image export. Its
original DOCX was not supplied, so this synthetic test cannot close that report.
Request the source document, font names, editor URL/version and reproduction steps
before assigning a renderer/font-specific fix. The actual Office conversion
engine belongs to the configurable document deployment.

The PDF fixture directly exercises the module worker and local standard fonts;
cMaps and WASM are packaged and their paths checked, but CJK cMap and JPX samples
are not included. Older browsers outside the documented evergreen support were
not tested.
