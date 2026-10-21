import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import './sites-env.mjs';

const [command, ...args] = process.argv.slice(2);
if (!['dev', 'build'].includes(command)) throw new Error('Expected dev or build.');
if (command === 'dev') {
  const indexer = spawn(process.execPath, [fileURLToPath(new URL('./semantic-index.mjs', import.meta.url)), '--local', '--watch'], {
    stdio: ['ignore', 'inherit', 'inherit'], windowsHide: true,
  });
  indexer.on('error', error => console.warn('Semantic indexing could not start:', error.message));
  process.on('exit', () => indexer.kill());
}
const cli = fileURLToPath(new URL('../node_modules/vinext/dist/cli.js', import.meta.url));
process.argv = [process.execPath, cli, command, ...(command === 'dev' ? ['--port', '5173'] : []), ...args];
await import(new URL('../node_modules/vinext/dist/cli.js', import.meta.url).href);
