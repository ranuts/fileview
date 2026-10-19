import { storeVerifiedArtifact } from '../scripts/release-artifact.mjs';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

import { publishVerifiedArtifact } from '../scripts/publish-release.mjs';

async function fixture(t, status = 404, response = { error: 'Not found' }) {
  const directory = await mkdtemp(join(tmpdir(), 'fileview-release-test-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  await mkdir(join(directory, 'package'));
  await writeFile(
    join(directory, 'package/package.json'),
    JSON.stringify({ name: '@ranui/preview', version: '0.2.1' }),
  );
  const filename = 'ranui-preview-0.2.1.tgz';
  const archive = join(directory, filename);
  assert.equal(spawnSync('tar', ['-czf', archive, '-C', directory, 'package']).status, 0);
  const bytes = await readFile(archive);
  const manifest = {
    name: '@ranui/preview',
    version: '0.2.1',
    filename,
    integrity: `sha512-${createHash('sha512').update(bytes).digest('base64')}`,
  };
  const manifestPath = join(directory, 'release.json');
  await writeFile(manifestPath, JSON.stringify(manifest));
  const requests = [];
  const server = createServer((request, result) => {
    requests.push(request.url);
    result.writeHead(status, { 'content-type': 'application/json' });
    result.end(typeof response === 'string' ? response : JSON.stringify(response));
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const registry = `http://127.0.0.1:${server.address().port}`;
  const published = [];
  const publish = async (path, args) => published.push({ path, args, bytes: await readFile(path) });
  return { directory, archive, bytes, manifest, manifestPath, registry, published, publish, requests };
}

test('missing registry version publishes the exact verified archive without scripts', async (t) => {
  const f = await fixture(t);
  assert.equal(await publishVerifiedArtifact(f), 'published');
  assert.deepEqual(f.requests, ['/@ranui%2Fpreview/0.2.1']);
  assert.equal(f.published.length, 1);
  assert.equal(f.published[0].path, f.archive);
  assert.deepEqual(f.published[0].bytes, f.bytes);
  assert.deepEqual(f.published[0].args, ['--ignore-scripts', '--access', 'public', '--provenance', '--tag', 'latest']);
});

test('identical published integrity succeeds without republishing', async (t) => {
  const f = await fixture(t, 200);
  // A second local registry has the real fixture identity, just as public metadata does.
  const server = createServer((_, response) =>
    response.end(
      JSON.stringify({
        name: f.manifest.name,
        version: f.manifest.version,
        dist: { integrity: f.manifest.integrity },
      }),
    ),
  );
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  assert.equal(
    await publishVerifiedArtifact({ ...f, registry: `http://127.0.0.1:${server.address().port}` }),
    'already-published',
  );
  assert.equal(f.published.length, 0);
});

test('a published version with different bytes fails without publishing', async (t) => {
  const f = await fixture(t, 200, {
    name: '@ranui/preview',
    version: '0.2.1',
    dist: { integrity: 'sha512-different' },
  });
  await assert.rejects(publishVerifiedArtifact(f), /different|integrity/i);
  assert.equal(f.published.length, 0);
});

for (const status of [401, 403, 429, 500, 503]) {
  test(`registry HTTP ${status} fails closed instead of publishing`, async (t) => {
    const f = await fixture(t, status);
    await assert.rejects(publishVerifiedArtifact(f), new RegExp(String(status)));
    assert.equal(f.published.length, 0);
  });
}

for (const response of ['broken json', {}, { name: '@ranui/preview', version: '0.2.1', dist: {} }]) {
  test(`invalid existing registry metadata fails closed: ${JSON.stringify(response)}`, async (t) => {
    const f = await fixture(t, 200, response);
    await assert.rejects(publishVerifiedArtifact(f));
    assert.equal(f.published.length, 0);
  });
}

test('network failure is not interpreted as an unpublished version', async (t) => {
  const f = await fixture(t);
  await assert.rejects(publishVerifiedArtifact({ ...f, registry: 'http://127.0.0.1:1' }));
  assert.equal(f.published.length, 0);
});

test('changed archive fails verification before registry lookup or publishing', async (t) => {
  const f = await fixture(t);
  await writeFile(f.archive, 'replaced archive');
  await assert.rejects(publishVerifiedArtifact(f), /integrity/i);
  assert.deepEqual(f.requests, []);
  assert.equal(f.published.length, 0);
});

for (const patch of [
  { filename: '../outside.tgz' },
  { filename: '$(touch injected).tgz' },
  { version: '0.2.1; touch injected' },
  { name: '@ranui/preview; touch injected' },
  { name: '@ranui/other' },
  { version: '0.2.2' },
]) {
  test(`invalid or mismatched release identity cannot publish: ${JSON.stringify(patch)}`, async (t) => {
    const f = await fixture(t);
    await writeFile(f.manifestPath, JSON.stringify({ ...f.manifest, ...patch }));
    await assert.rejects(publishVerifiedArtifact(f));
    assert.deepEqual(f.requests, []);
    assert.equal(f.published.length, 0);
  });
}

test('npm publishing failure propagates instead of claiming success', async (t) => {
  const f = await fixture(t);
  await assert.rejects(
    publishVerifiedArtifact({
      ...f,
      publish: async () => {
        throw new Error('npm rejected');
      },
    }),
    /npm rejected/,
  );
});

test('the archive cannot change during the registry lookup and then be published', async (t) => {
  const f = await fixture(t);
  const server = createServer(async (_, response) => {
    await writeFile(f.archive, 'changed while requesting registry metadata');
    response.writeHead(404);
    response.end();
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  await assert.rejects(
    publishVerifiedArtifact({ ...f, registry: `http://127.0.0.1:${server.address().port}` }),
    /integrity/i,
  );
  assert.equal(f.published.length, 0);
});

test('storing a verified archive records its exact version and SHA512 identity', async (t) => {
  const f = await fixture(t);
  const destination = join(f.directory, 'artifacts');
  await storeVerifiedArtifact({ tarball: f.archive, destination, name: f.manifest.name, version: f.manifest.version });
  assert.deepEqual(await readFile(join(destination, f.manifest.filename)), f.bytes);
  assert.deepEqual(JSON.parse(await readFile(join(destination, 'release.json'), 'utf8')), f.manifest);
});

test('storing the same verified bytes twice retains the existing artifact identity', async (t) => {
  const f = await fixture(t);
  const options = {
    tarball: f.archive,
    destination: join(f.directory, 'artifacts'),
    name: f.manifest.name,
    version: f.manifest.version,
  };
  await storeVerifiedArtifact(options);
  await storeVerifiedArtifact(options);
  assert.deepEqual(await readFile(join(options.destination, f.manifest.filename)), f.bytes);
});

test('rebuilding a different archive cannot overwrite an existing version artifact', async (t) => {
  const f = await fixture(t);
  const options = {
    tarball: f.archive,
    destination: join(f.directory, 'artifacts'),
    name: f.manifest.name,
    version: f.manifest.version,
  };
  await storeVerifiedArtifact(options);
  await writeFile(f.archive, 'different rebuild');
  await assert.rejects(storeVerifiedArtifact(options), /different|integrity/i);
  assert.deepEqual(await readFile(join(options.destination, f.manifest.filename)), f.bytes);
  assert.deepEqual(JSON.parse(await readFile(join(options.destination, 'release.json'), 'utf8')), f.manifest);
});
