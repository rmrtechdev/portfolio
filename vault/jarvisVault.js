import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { xorStream } from '../src/three/jarvis/keystream.js';

const ID = 'virtual:jarvis-vault';
const DEV_PATH = '__jv.bin';

/**
 * Serves the Jarvis model only as ciphertext under a fresh random key per build (or dev server start),
 * exposing `{ url, seed }` through `virtual:jarvis-vault`. The plain .glb lives outside `public/`.
 */
export default function jarvisVault(glbPath) {
  const seed = new Uint32Array(randomBytes(16).buffer);
  const sealed = () => xorStream(new Uint8Array(readFileSync(glbPath)), seed);
  let base = '/';
  let dev = false;
  return {
    name: 'jarvis-vault',
    configResolved(config) {
      base = config.base;
      dev = config.command === 'serve';
    },
    configureServer(server) {
      const body = Buffer.from(sealed());
      server.middlewares.use(`${base}${DEV_PATH}`, (_, res) => {
        res.setHeader('Content-Type', 'application/octet-stream');
        res.end(body);
      });
    },
    resolveId: (id) => (id === ID ? `\0${ID}` : null),
    load(id) {
      if (id !== `\0${ID}`) return null;
      const url = dev
        ? JSON.stringify(`${base}${DEV_PATH}`)
        : `import.meta.ROLLUP_FILE_URL_${this.emitFile({ type: 'asset', name: 'jv.bin', source: sealed() })}`;
      // Encoded as a string so the obfuscator's string-array encryption covers it too.
      return `export const url = ${url};\nexport const seed = ${JSON.stringify(Buffer.from(seed.buffer).toString('base64'))};`;
    },
  };
}
