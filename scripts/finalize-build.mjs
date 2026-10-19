import { cp, readdir, readFile, stat, writeFile } from 'node:fs/promises';
import { dirname, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const dist = resolve(root, 'dist');
const exists = async (path) =>
  stat(path).then(
    () => true,
    () => false,
  );
const declarations = async (directory) => {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await declarations(path)));
    else if (entry.name.endsWith('.d.ts')) files.push(path);
  }
  return files;
};

// TypeScript preserves source aliases and extensionless imports. Published ESM
// declarations need concrete relative paths for both NodeNext and bundlers.
for (const file of await declarations(dist)) {
  const text = await readFile(file, 'utf8');
  const matches = [...text.matchAll(/(?:from\s*|import\s*\(\s*|import\s*)['"]([^'"]+)['"]/g)];
  let result = text;
  for (const match of matches) {
    const specifier = match[1];
    if (!specifier.startsWith('.') && !specifier.startsWith('@/')) continue;
    const base = specifier.startsWith('@/') ? resolve(dist, specifier.slice(2)) : resolve(dirname(file), specifier);
    let target;
    if (await exists(`${base}.d.ts`)) target = `${base}.js`;
    else if (await exists(resolve(base, 'index.d.ts'))) target = resolve(base, 'index.js');
    else if (/\.(?:mjs|cjs|js)$/.test(specifier)) target = base;
    else throw new Error(`Unresolved published declaration import ${specifier} in ${relative(root, file)}`);
    let replacement = relative(dirname(file), target).split(sep).join('/');
    if (!replacement.startsWith('.')) replacement = `./${replacement}`;
    result = result.replaceAll(`'${specifier}'`, `'${replacement}'`).replaceAll(`"${specifier}"`, `"${replacement}"`);
  }
  await writeFile(file, result);
}
await cp(resolve(root, 'typings.d.ts'), resolve(dist, 'typings.d.ts'));
for (const entry of ['index.d.ts', 'manual.d.ts', 'components/preview/index.d.ts']) {
  const file = resolve(dist, entry);
  let path = relative(dirname(file), resolve(dist, 'typings.js')).split(sep).join('/');
  if (!path.startsWith('.')) path = `./${path}`;
  await writeFile(file, `import '${path}';\n${await readFile(file, 'utf8')}`);
}
await writeFile(
  resolve(dist, 'umd/index.d.cts'),
  "declare const ranui: typeof import('../index.js');\nexport = ranui;\n",
);
await writeFile(resolve(dist, 'type.js'), 'export {};\n');
await writeFile(resolve(dist, 'typings.js'), 'export {};\n');
const pdfjs = resolve(root, 'node_modules/pdfjs-dist');
for (const asset of ['cmaps', 'standard_fonts', 'wasm', 'LICENSE']) {
  await cp(resolve(pdfjs, asset), resolve(dist, 'pdfjs', asset), { recursive: true });
}
