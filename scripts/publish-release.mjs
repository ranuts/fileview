import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const publicRegistry = 'https://registry.npmjs.org';
const stableVersion = /^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)$/;
const publishArguments = ['--ignore-scripts', '--access', 'public', '--provenance', '--tag', 'latest'];
const npmPublish = async (tarball, args) => {
  const result = spawnSync('npm', ['publish', tarball, ...args], { stdio: 'inherit', shell: false });
  if (result.error) throw result.error;
  assert.equal(result.status, 0, 'npm publish failed');
};

/** Publish only the stored, verified archive; never run pack, build, or lifecycle scripts. */
export async function publishVerifiedArtifact({ manifestPath, registry = publicRegistry, publish = npmPublish }) {
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  assert.equal(manifest.name, '@ranui/preview', 'Unexpected release package name');
  assert.match(manifest.version, stableVersion, 'Invalid stable release version');
  assert.equal(manifest.filename, `ranui-preview-${manifest.version}.tgz`, 'Invalid release archive filename');
  const tarball = resolve(dirname(manifestPath), manifest.filename);
  const bytes = await readFile(tarball);
  const integrity = `sha512-${createHash('sha512').update(bytes).digest('base64')}`;
  assert.equal(manifest.integrity, integrity, 'Release archive integrity mismatch');
  const unpack = spawnSync('tar', ['-xOf', tarball, 'package/package.json'], { encoding: 'utf8', shell: false });
  if (unpack.error) throw unpack.error;
  assert.equal(unpack.status, 0, 'Cannot read release archive metadata');
  const packed = JSON.parse(unpack.stdout);
  assert.equal(packed.name, manifest.name, 'Archive package name differs from verified metadata');
  assert.equal(packed.version, manifest.version, 'Archive version differs from verified metadata');

  const metadataUrl = new URL(`${manifest.name.replace('/', '%2F')}/${manifest.version}`, `${registry}/`);
  const response = await fetch(metadataUrl, { redirect: 'error', signal: AbortSignal.timeout(30_000) });
  if (response.status === 404) {
    assert.deepEqual(await readFile(tarball), bytes, 'Release archive integrity changed during registry lookup');
    await publish(tarball, publishArguments);
    return 'published';
  }
  assert.equal(response.status, 200, `Registry metadata request failed: HTTP ${response.status}`);
  const existing = await response.json();
  assert.equal(existing.name, manifest.name, 'Registry metadata package name mismatch');
  assert.equal(existing.version, manifest.version, 'Registry metadata version mismatch');
  assert.equal(existing.dist?.integrity, integrity, 'Published version has different archive integrity');
  return 'already-published';
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  assert.equal(process.argv.length, 3, 'Usage: node publish-release.mjs <release.json>');
  console.log(await publishVerifiedArtifact({ manifestPath: resolve(process.argv[2]) }));
}
