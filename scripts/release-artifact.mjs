import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

/** Keep an existing release identity intact when verification is run again. */
export async function storeVerifiedArtifact({ tarball, destination, name, version }) {
  assert.equal(name, '@ranui/preview', 'Unexpected release package name');
  assert.match(version, /^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)$/, 'Invalid stable release version');
  const filename = `ranui-preview-${version}.tgz`;
  const bytes = await readFile(tarball);
  const manifest = {
    name,
    version,
    filename,
    integrity: `sha512-${createHash('sha512').update(bytes).digest('base64')}`,
  };
  await mkdir(destination, { recursive: true });
  const storeOnce = async (path, content) => {
    try {
      await writeFile(path, content, { flag: 'wx' });
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
      assert.deepEqual(
        await readFile(path),
        Buffer.from(content),
        `Existing release artifact has different integrity: ${path}`,
      );
    }
  };
  await storeOnce(join(destination, filename), bytes);
  await storeOnce(join(destination, 'release.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  return manifest;
}
