import { rm } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const run = (command, args) => {
  const result = spawnSync(command, args, { cwd: root, stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
};

await rm(resolve(root, 'dist'), { recursive: true, force: true });
run(process.execPath, ['node_modules/vite/bin/vite.js', 'build', '-c', 'build/config.es.ts']);
run(process.execPath, ['node_modules/vite/bin/vite.js', 'build', '-c', 'build/config.umd.ts']);
run(process.execPath, ['node_modules/typescript/bin/tsc', '--project', 'tsconfig.build.json']);
await import('./finalize-build.mjs');
