// Builds the single-file app: injects build/albion-dataset.json into
// build/app-shell.html and writes albion-ledger.html + index.html.
// Dataset is regenerated separately by gen-dataset.mjs from ao-bin-dumps.
import {readFileSync, writeFileSync} from 'fs';
import {fileURLToPath} from 'url';
import {dirname, join} from 'path';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');

const shell = readFileSync(join(here, 'app-shell.html'), 'utf8');
const data = readFileSync(join(here, 'albion-dataset.json'), 'utf8')
  .replace(/</g, '\\u003c'); // safe inside a <script> block

if (!shell.includes('__ALBION_DATA__')) {
  console.error('ERROR: placeholder __ALBION_DATA__ not found in app-shell.html');
  process.exit(1);
}
const out = shell.replace('__ALBION_DATA__', data);

writeFileSync(join(root, 'albion-ledger.html'), out);
writeFileSync(join(root, 'index.html'), out);
console.log(`Built albion-ledger.html + index.html (${(out.length/1048576).toFixed(2)} MB each)`);
