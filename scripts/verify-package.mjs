import { storeVerifiedArtifact } from './release-artifact.mjs';
import { verifyBrowserPackage } from '../test/package-browser.mjs';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cp, lstat, mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const args = process.argv.slice(2);
const option = (name) => {
  const index = args.indexOf(name);
  if (index < 0) return undefined;
  assert(args[index + 1], `${name} needs a path`);
  return resolve(args[index + 1]);
};
const manifest = JSON.parse(await readFile(resolve(root, 'package.json'), 'utf8'));
const temporary = await mkdtemp(join(tmpdir(), 'fileview-consumer-'));
const run = (command, arguments_, cwd, capture = false) => {
  const result = spawnSync(command, arguments_, { cwd, encoding: 'utf8', stdio: capture ? 'pipe' : 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0)
    throw new Error(`${command} ${arguments_.join(' ')} failed\n${result.stdout ?? ''}${result.stderr ?? ''}`);
  return result.stdout;
};

try {
  let tarball = option('--tarball');
  if (!tarball) {
    // Pack into scratch space so reruns cannot overwrite a previously verified archive.
    const destination = temporary;
    await mkdir(destination, { recursive: true });
    const packed = JSON.parse(
      run('npm', ['pack', '--ignore-scripts', '--json', '--pack-destination', destination], root, true),
    );
    assert.equal(packed.length, 1);
    tarball = resolve(destination, packed[0].filename);
    for (const file of packed[0].files) {
      assert(
        !/(?:^|\/)(?:node_modules|test|scripts|\.env)(?:\/|$)/.test(file.path),
        `Unexpected packed file ${file.path}`,
      );
    }
  }
  const consumer = join(temporary, 'consumer');
  await mkdir(consumer);
  await writeFile(
    join(consumer, 'package.json'),
    JSON.stringify({ name: 'fileview-package-consumer', private: true, type: 'module' }),
  );
  run(
    'npm',
    [
      'install',
      '--ignore-scripts',
      '--no-audit',
      '--no-fund',
      '--package-lock=false',
      '--save-exact',
      tarball,
      `typescript@${manifest.devDependencies.typescript}`,
    ],
    consumer,
  );
  const installed = join(consumer, 'node_modules', ...manifest.name.split('/'));
  assert(
    !(await lstat(installed)).isSymbolicLink(),
    'Consumer package must be an installed tarball, never a workspace link',
  );
  assert(
    (await realpath(installed)).startsWith(await realpath(consumer)),
    'Package resolved outside isolated consumer',
  );
  const published = JSON.parse(await readFile(join(installed, 'package.json'), 'utf8'));
  assert.equal(published.name, manifest.name);
  assert.equal(published.version, manifest.version);
  const assertTarget = async (target) => {
    if (typeof target === 'string') {
      if (!target.includes('*')) {
        assert(target.startsWith('./') && !isAbsolute(target), `Invalid export ${target}`);
        await lstat(resolve(installed, target));
      }
    } else if (target && typeof target === 'object') {
      for (const value of Object.values(target)) await assertTarget(value);
    }
  };
  await assertTarget(published.exports);
  for (const field of ['main', 'module', 'types']) await lstat(resolve(installed, published[field]));
  for (const asset of [
    'cmaps/Adobe-Japan1-UCS2.bcmap',
    'standard_fonts/LiberationSans-Regular.ttf',
    'wasm/openjpeg.wasm',
    'LICENSE',
  ]) {
    await lstat(join(installed, 'dist/pdfjs', asset));
  }
  await cp(resolve(root, 'test/package-consumer.ts'), join(consumer, 'consumer.ts'));
  const compile = (module, moduleResolution, include) => {
    run(
      process.execPath,
      [
        join(consumer, 'node_modules/typescript/bin/tsc'),
        '--noEmit',
        '--strict',
        '--skipLibCheck',
        'false',
        '--target',
        'ES2022',
        '--module',
        module,
        '--moduleResolution',
        moduleResolution,
        '--lib',
        'ES2022,DOM,DOM.Iterable',
        '--jsx',
        'react-jsx',
        ...include,
      ],
      consumer,
    );
  };
  await writeFile(
    join(consumer, 'consumer.cts'),
    `import library = require('${manifest.name}');\nconst preview: typeof import('${manifest.name}').preview = library.preview;\nvoid preview;\n`,
  );
  compile('NodeNext', 'NodeNext', ['consumer.ts']);
  compile('NodeNext', 'NodeNext', ['consumer.cts']);
  compile('ESNext', 'Bundler', ['consumer.ts']);
  await writeFile(
    join(consumer, 'ssr.mjs'),
    `import assert from 'node:assert/strict';
const before = Reflect.ownKeys(globalThis);
const { registerPreview } = await import('${manifest.name}/manual');
assert.equal(await registerPreview(), undefined);
assert.deepEqual(Reflect.ownKeys(globalThis), before);
for (const entry of ['${manifest.name}', '${manifest.name}/preview', '${manifest.name}/type', '${manifest.name}/typings', '${manifest.name}/dist/index.js']) {
  assert.ok(import.meta.resolve(entry));
}
console.log('SSR manual import and public module resolution passed');\n`,
  );
  run(process.execPath, ['ssr.mjs'], consumer);
  run(
    'npm',
    [
      'install',
      '--ignore-scripts',
      '--no-audit',
      '--no-fund',
      '--package-lock=false',
      '--save-exact',
      `@types/react@${manifest.devDependencies['@types/react']}`,
    ],
    consumer,
  );
  await cp(resolve(root, 'test/package-react.tsx'), join(consumer, 'react.tsx'));
  compile('NodeNext', 'NodeNext', ['consumer.ts', 'react.tsx']);
  compile('ESNext', 'Bundler', ['consumer.ts', 'react.tsx']);
  run(resolve(root, 'node_modules/.bin/publint'), ['run', installed, '--strict', '--pack', 'false'], root);
  await verifyBrowserPackage(installed, root);
  const destination = option('--out-dir');
  if (destination) {
    await storeVerifiedArtifact({ tarball, destination, name: manifest.name, version: manifest.version });
    await cp(resolve(root, 'scripts/publish-release.mjs'), resolve(destination, 'publish-release.mjs'));
  }
  console.log(`Verified installed tarball ${tarball}${destination ? `; stored artifact in ${destination}` : ''}`);
} finally {
  await rm(temporary, { recursive: true, force: true });
}
