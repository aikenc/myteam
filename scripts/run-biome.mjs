import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);

function run(command, commandArgs) {
  return spawnSync(command, commandArgs, {
    cwd: root,
    encoding: 'utf8',
    shell: false,
  });
}

function print(result) {
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
}

const bin = join(root, 'node_modules', '.bin', process.platform === 'win32' ? 'biome.cmd' : 'biome');
let result = run(bin, args);

const glibcMismatch = `${result.stderr ?? ''}${result.stdout ?? ''}`.includes('GLIBC_');
const muslBin = join(root, 'node_modules', '@biomejs', 'cli-linux-x64-musl', 'biome');

if (result.status !== 0 && glibcMismatch && process.platform === 'linux' && process.arch === 'x64' && existsSync(muslBin)) {
  result = run(muslBin, args);
}

print(result);
process.exit(result.status ?? 1);
