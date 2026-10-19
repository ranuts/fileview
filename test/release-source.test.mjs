import assert from 'node:assert/strict';
import { test } from 'node:test';

import { assertReleaseSource } from '../scripts/verify-release-source.mjs';

test('workflow-only recovery can use the selected workflow ref with unchanged release payload', () => {
  assert.doesNotThrow(() =>
    assertReleaseSource({
      tag: 'v0.3.0',
      version: '0.3.0',
      changedFiles: [
        '.github/workflows/release.yml',
        'scripts/publish-release.mjs',
        'scripts/verify-release-source.mjs',
        'test/release.test.mjs',
        'test/release-source.test.mjs',
      ],
    }),
  );
});

test('a tag checkout with no changed files can release', () => {
  assert.doesNotThrow(() => assertReleaseSource({ tag: 'v0.3.0', version: '0.3.0', changedFiles: [] }));
});

for (const path of [
  'package.json',
  'pnpm-lock.yaml',
  'pnpm-workspace.yaml',
  'README.md',
  'LICENSE',
  'manual.ts',
  'typings.d.ts',
  'components/preview/core.ts',
  'vite.config.ts',
  'build/config.es.ts',
  'scripts/build.mjs',
  'scripts/finalize-build.mjs',
  'scripts/verify-package.mjs',
]) {
  test(`release source changes cannot hide behind a workflow recovery: ${path}`, () => {
    assert.throws(
      () => assertReleaseSource({ tag: 'v0.3.0', version: '0.3.0', changedFiles: [path] }),
      /differs|changed/i,
    );
  });
}

for (const tag of ['v0.2.0', 'v0.3.0; touch injected', '--help', 'v01.3.0', 'v0.3.0-beta.1']) {
  test(`invalid or mismatched release tag is rejected: ${tag}`, () => {
    assert.throws(() => assertReleaseSource({ tag, version: '0.3.0', changedFiles: [] }), /tag|version/i);
  });
}
