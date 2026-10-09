#!/usr/bin/env node
/**
 * Standalone YOLO person detect CLI for Creep or Treat under OpenClaw.
 *
 * OpenClaw's plugin capture remaps bare (and sometimes absolute) requires of
 * onnxruntime-node / sharp onto other plugins' admissions. This process is
 * spawned without those hooks so plugin-deploy / monorepo natives load normally.
 *
 * Usage:
 *   node detect-person.mjs --score 0.45 < image.jpg
 *   node detect-person.mjs --score 0.45 /path/to/image.jpg
 *
 * Stdout: JSON { width, height, persons: [...] }
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const home = process.env["HOME"] ?? os.homedir();

function resolveOdIndex() {
  const candidates = [
    path.join(home, ".agenticros/plugin-deploy/node_modules/@agenticros/object-detection/dist/index.js"),
    path.resolve(here, "../../agenticros/packages/object-detection/dist/index.js"),
    path.resolve(here, "../node_modules/@agenticros/object-detection/dist/index.js"),
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  throw new Error(
    `Could not find @agenticros/object-detection dist/index.js. Tried:\n${candidates.join("\n")}`,
  );
}

function parseArgs(argv) {
  let score = 0.4;
  let imagePath = null;
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--score" && argv[i + 1]) {
      score = Number(argv[++i]);
    } else if (!a.startsWith("-")) {
      imagePath = a;
    }
  }
  return { score, imagePath };
}

async function readImage(imagePath) {
  if (imagePath) return fs.readFileSync(imagePath);
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return Buffer.concat(chunks);
}

const { score, imagePath } = parseArgs(process.argv);
const { PersonDetector } = await import(pathToFileURL(resolveOdIndex()).href);
const detector = new PersonDetector({ scoreThreshold: score });
await detector.load({ download: true });
const image = await readImage(imagePath);
const result = await detector.detect(image);
process.stdout.write(JSON.stringify(result));
await detector.dispose?.().catch(() => {});
