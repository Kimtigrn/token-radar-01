// Token Radar — build the board from the sealed snapshot (Node 22, standard library only).
//
// The program reads the sealed snapshot from /input/snapshot.json (or --input <file|dir>),
// scores every pre-token protocol with the comparables model in lib/model.ts,
// writes the ranked board to /output/board.json, writes the dashboard's data
// beside the page as /output/data.js, copies this repository's dashboard/ and
// screenshots/ to /output, and writes /output/dossier.json with the vendored
// make.fun library (vendor/makefun-board.ts, byte for byte the kit's copy).
//
// The run is deterministic: the only inputs are the snapshot's bytes, and
// nothing reads the clock, the network or unseeded randomness, so two runs
// write the same bytes.
//
// Outside the grader's container, MAKEFUN_OUTPUT_DIR stands in for /output:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input kit/token-radar-01-kit/input/snapshot.json

import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { boardIssue, buildRadar, dataScript, parseSnapshot } from './lib/model.ts';
import { buildDossier } from './vendor/makefun-board.ts';

const here = fileURLToPath(new URL('.', import.meta.url));

/** The scorer's own caps: the text cap shapes the bytes, the rest refuse. */
const TEXT_MAX_BYTES = 65_536;
const SCREENSHOT_CAPS = { max: 4, max_bytes: 524_288 };
const IMAGE_NAME = /^[A-Za-z0-9_][A-Za-z0-9._-]{0,127}$/;

/** --name <value> out of the arguments, or the fallback. */
function arg(name: string, fallback: string): string {
  const at = process.argv.indexOf(`--${name}`);
  if (at >= 0 && at + 1 < process.argv.length) return process.argv[at + 1]!;
  const withEquals = process.argv.find((a) => a.startsWith(`--${name}=`));
  return withEquals === undefined ? fallback : withEquals.slice(name.length + 3);
}

const inputArg = arg('input', '/input');
const inputFile = inputArg.endsWith('.json') ? inputArg : join(inputArg, 'snapshot.json');
if (!existsSync(inputFile)) {
  process.stderr.write(`token radar: no snapshot at ${inputFile}: pass --input <snapshot.json|directory> or mount the sealed /input\n`);
  process.exit(2);
}
const out = arg('output', process.env.MAKEFUN_OUTPUT_DIR ?? '/output');

const snapshot = parseSnapshot(readFileSync(inputFile, 'utf8'));
const { board, radar } = buildRadar(snapshot);
const issue = boardIssue(board, snapshot);
if (issue !== null) {
  process.stderr.write(`token radar: the model wrote a board the gate refuses: ${issue}\n`);
  process.exit(1);
}

mkdirSync(out, { recursive: true });
writeFileSync(join(out, 'board.json'), `${JSON.stringify({ rows: board })}\n`);
writeFileSync(join(out, 'data.js'), dataScript(radar));

/** Copy one directory's regular files into `to`, skipping names that start with a dot. */
function copyFiles(from: string, to: string): string[] {
  if (!existsSync(from)) return [];
  mkdirSync(to, { recursive: true });
  const copied: string[] = [];
  for (const name of readdirSync(from)) {
    if (name.startsWith('.')) continue;
    const path = join(from, name);
    if (!statSync(path).isFile()) continue;
    copyFileSync(path, join(to, name));
    copied.push(name);
  }
  return copied;
}

const dash = copyFiles(join(here, 'dashboard'), join(out, 'dashboard'));
const shots = copyFiles(join(here, 'screenshots'), join(out, 'screenshots'));
if (shots.length < 3) {
  process.stderr.write(`token radar: screenshots/ holds ${shots.length} image${shots.length === 1 ? '' : 's'}: hand in 3, the board, a detail view and a filtered view\n`);
  process.exit(1);
}
for (const name of shots) {
  if (!IMAGE_NAME.test(name)) {
    process.stderr.write(`token radar: screenshots/${name}: a name is letters, digits and . _ -, 1 to 128 characters\n`);
    process.exit(1);
  }
}

// Pre-dossier self-checks: the same rules the gate's dashboard-files and
// screenshots rows enforce, so a broken hand-in fails here with a plain
// message instead of writing a dossier the scorer refuses.
const TEXT_FILE = /\.(?:html|css|js|json|mjs|svg|md|txt)$/;
if (!dash.includes('index.html')) {
  process.stderr.write('token radar: dashboard/ holds no index.html: the page is what the judge reads\n');
  process.exit(1);
}
if (!dash.some((n) => n.endsWith('.css')) || !dash.some((n) => n.endsWith('.js'))) {
  process.stderr.write('token radar: dashboard/ holds no stylesheet or script: the page needs both\n');
  process.exit(1);
}
for (const name of dash) {
  if (!TEXT_FILE.test(name)) continue;
  if (/https?:\/\//.test(readFileSync(join(out, 'dashboard', name), 'utf8'))) {
    process.stderr.write(`token radar: dashboard/${name} carries an http:// or https:// address: the page renders with no network\n`);
    process.exit(1);
  }
}
const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const JPEG_MAGIC = [0xff, 0xd8, 0xff];
for (const name of shots) {
  const bytes = readFileSync(join(out, 'screenshots', name));
  const isPng = bytes.length >= PNG_MAGIC.length && PNG_MAGIC.every((b, i) => bytes[i] === b);
  const isJpeg = bytes.length >= JPEG_MAGIC.length && JPEG_MAGIC.every((b, i) => bytes[i] === b);
  if (!isPng && !isJpeg) {
    process.stderr.write(`token radar: screenshots/${name} is neither a whole PNG nor a JPEG\n`);
    process.exit(1);
  }
  if (bytes.length > SCREENSHOT_CAPS.max_bytes) {
    process.stderr.write(`token radar: screenshots/${name} is ${bytes.length} bytes, over the ${SCREENSHOT_CAPS.max_bytes} a screenshot may hold\n`);
    process.exit(1);
  }
  if (isPng && bytes.length >= 24) {
    const w = bytes.readUInt32BE(16);
    const h = bytes.readUInt32BE(20);
    if (Math.max(w, h) > 1440 || Math.min(w, h) < 800) {
      process.stderr.write(`token radar: screenshots/${name} is ${w}x${h}: the long side is at most 1440 and the short side at least 800\n`);
      process.exit(1);
    }
  }
}

// The dossier is written last: the scorer rebuilds it from this /output and compares bytes.
writeFileSync(join(out, 'dossier.json'), buildDossier(out, { text_max_bytes: TEXT_MAX_BYTES, screenshots: SCREENSHOT_CAPS, dashboard: { max_files: 400, max_bytes: 4_194_304 } }));

process.stdout.write(
  `token radar: ${snapshot.protocols.length} protocols, ${snapshot.watchlist.length} on the watchlist, ${board.length} rows scored (${radar.early_size} early, ${radar.live_size} live set aside)\n` +
    `token radar: wrote ${join(out, 'board.json')}, ${join(out, 'data.js')}, ${join(out, 'dashboard')} (${dash.length} files), ${join(out, 'screenshots')} (${shots.length} images) and ${join(out, 'dossier.json')}\n`,
);
