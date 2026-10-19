import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const recoveryFiles = new Set([
  'scripts/publish-release.mjs',
  'scripts/release-artifact.mjs',
  'scripts/verify-release-source.mjs',
  'test/release.test.mjs',
  'test/release-source.test.mjs',
]);

/** Recovery may update release plumbing, while the tagged package inputs remain identical. */
export function assertReleaseSource({ tag, version, changedFiles }) {
  assert.match(version, /^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)$/, 'Invalid stable release version');
  assert.equal(tag, `v${version}`, 'Release tag must match the package version');
  const changed = changedFiles.filter((file) => !file.startsWith('.github/workflows/') && !recoveryFiles.has(file));
  assert.equal(changed.length, 0, `Release source differs from ${tag}: ${changed.join(', ')}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  assert.equal(process.argv.length, 2, 'Set RELEASE_TAG; this script accepts no arguments');
  const { version } = JSON.parse(await readFile('package.json', 'utf8'));
  const tag = process.env.RELEASE_TAG;
  // Validate before passing the ref to git. No user input is evaluated by a shell.
  assertReleaseSource({ tag, version, changedFiles: [] });
  const result = spawnSync('git', ['diff', '--name-only', '-z', `${tag}^{commit}`, 'HEAD', '--'], {
    encoding: 'utf8',
    shell: false,
  });
  if (result.error) throw result.error;
  assert.equal(result.status, 0, `Cannot compare release tag: ${result.stderr}`);
  assertReleaseSource({ tag, version, changedFiles: result.stdout.split('\0').filter(Boolean) });
  console.log(`Release source matches ${tag}; workflow-only recovery changes are allowed`);
}
