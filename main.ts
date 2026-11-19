// Panel Pop — hand-in program for the gta6-cover-art-01 bounty.
//
// The entry itself is the static web app in app/ (plain HTML, CSS and ES
// modules that a browser runs with no network at all). This program is
// only the courier: it stages a copy of app/ and screenshots/ into the
// output directory and asks the vendored make.fun library to summarise
// that staging into dossier.json, the file the judges read.
//
// Run it the way the grader does, with the output directory named by the
// environment (falling back to /output):
//   MAKEFUN_OUTPUT_DIR=out node main.ts

import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-app.ts';

const repoDir = path.dirname(fileURLToPath(import.meta.url));
const outputDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

// Copy one of the entry's folders into the output directory, replacing
// whatever a previous run left there.
function stageFolder(name) {
  const from = path.join(repoDir, name);
  const to = path.join(outputDir, name);
  fs.mkdirSync(to, { recursive: true });
  if (fs.existsSync(from)) {
    fs.cpSync(from, to, { recursive: true });
  }
}

function handIn() {
  fs.mkdirSync(outputDir, { recursive: true });
  stageFolder('app');
  stageFolder('screenshots');

  // The scorer's ceilings, passed through so an oversized entry fails
  // here with a clear refusal instead of at judging time: at most four
  // screenshots of 256 KiB each, a bounded app tree, and a cap on how
  // much text the dossier will quote.
  const ceilings = {
    text_max_bytes: 163840,
    screenshots: { max: 4, max_bytes: 262144 },
    app_max_files: 993,
    app_max_bytes: 50331648,
    app_path_max_bytes: 1000,
  };
  const dossier = buildDossier(outputDir, ceilings);
  fs.writeFileSync(path.join(outputDir, 'dossier.json'), dossier);
  console.log(`panel-pop: staged app/ and screenshots/ into ${outputDir}, dossier.json written`);
}

handIn();
