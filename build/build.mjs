// Builds the single-file offline app from modular sources.
//
//   build/src/app-shell.html   HTML skeleton with __STYLE__, __APP_JS__ and
//                              __ALBION_DATA__ placeholders
//   build/src/style.css        all styles
//   build/src/*.js             app logic, concatenated in filename order
//                              (10-constants → 20-state → … → 90-app)
//   build/albion-dataset.json  datamined item/recipe data (regen: gen-dataset.mjs)
//
// Output: albion-ledger.html + index.html (byte-identical, self-contained,
// openable directly from disk). Edit the sources here, never the built files.
import {readFileSync, writeFileSync, readdirSync} from 'fs';
import {fileURLToPath} from 'url';
import {dirname, join} from 'path';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const src = join(here, 'src');

// split/join (not String.replace) so `$` sequences in code/data are left intact
const inject = (str, token, value) => {
  if (!str.includes(token)) { console.error('ERROR: placeholder ' + token + ' not found in app-shell.html'); process.exit(1); }
  return str.split(token).join(value);
};

const shell = readFileSync(join(src, 'app-shell.html'), 'utf8');
const css = readFileSync(join(src, 'style.css'), 'utf8');

const jsFiles = readdirSync(src).filter(f => f.endsWith('.js')).sort();
const appjs = jsFiles.map(f => readFileSync(join(src, f), 'utf8')).join('');

const data = readFileSync(join(root, 'build', 'albion-dataset.json'), 'utf8')
  .replace(/</g, '\\u003c'); // safe inside a <script> block

let out = shell;
out = inject(out, '__STYLE__', css);
out = inject(out, '__APP_JS__', appjs);
out = inject(out, '__ALBION_DATA__', data);

writeFileSync(join(root, 'albion-ledger.html'), out);
writeFileSync(join(root, 'index.html'), out);
console.log('Built albion-ledger.html + index.html from ' + jsFiles.length +
  ' JS modules (' + (out.length / 1048576).toFixed(2) + ' MB each)');
