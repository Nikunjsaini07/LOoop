import { spawnSync } from 'node:child_process';

if (!process.env.npm_execpath) throw new Error('Run npm run install:ci.');
const result = spawnSync(process.execPath, [process.env.npm_execpath, 'ci', '--include=dev', '--include=optional'], {
  stdio: 'inherit', windowsHide: true,
});
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
