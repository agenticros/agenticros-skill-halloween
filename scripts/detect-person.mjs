#!/usr/bin/env node
/**
 * Standalone YOLO person detect CLI for Creep or Treat under OpenClaw.
 *
 * OpenClaw's plugin capture remaps bare (and sometimes absolute) requires of
 * onnxruntime-node / sharp onto other plugins' admissions. This process is
 * spawned without those hooks so plugin-deploy / monorepo natives load normally.
 *
 * Usage (one-shot):
 *   node detect-person.mjs --score 0.45 < image.jpg
 *   node detect-person.mjs --score 0.45 /path/to/image.jpg
 *   Stdout: JSON { width, height, persons: [...] }
 *
 * Usage (persistent worker — preferred; loads the model once):
 *   node detect-person.mjs --serve --score 0.45
 *   Protocol: after `{"ready":true}\n`, each request is
 *     uint32be length + jpeg/png bytes
 *   Response: one JSON line per request. Length 0 exits.
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
  let serve = false;
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--score" && argv[i + 1]) {
      score = Number(argv[++i]);
    } else if (a === "--serve") {
      serve = true;
    } else if (!a.startsWith("-")) {
      imagePath = a;
    }
  }
  return { score, imagePath, serve };
}

async function readImage(imagePath) {
  if (imagePath) return fs.readFileSync(imagePath);
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return Buffer.concat(chunks);
}

/** Length-prefixed stdin reader that keeps leftover bytes (no stream.unshift). */
function createStdinReader(stream) {
  let buf = Buffer.alloc(0);
  let ended = false;
  const waiters = [];

  const pump = () => {
    while (waiters.length > 0) {
      const w = waiters[0];
      if (buf.length >= w.n) {
        waiters.shift();
        const out = buf.subarray(0, w.n);
        buf = buf.subarray(w.n);
        w.resolve(out);
        continue;
      }
      if (ended) {
        waiters.shift();
        w.reject(new Error("stdin closed before frame complete"));
        continue;
      }
      break;
    }
  };

  stream.on("data", (chunk) => {
    buf = Buffer.concat([buf, chunk]);
    pump();
  });
  stream.on("end", () => {
    ended = true;
    pump();
  });
  stream.on("error", (err) => {
    ended = true;
    while (waiters.length) {
      waiters.shift().reject(err);
    }
  });

  return {
    readExact(n) {
      if (n === 0) return Promise.resolve(Buffer.alloc(0));
      return new Promise((resolve, reject) => {
        waiters.push({ n, resolve, reject });
        pump();
      });
    },
  };
}

async function serveLoop(detector) {
  const reader = createStdinReader(process.stdin);
  process.stdout.write(`${JSON.stringify({ ready: true })}\n`);
  for (;;) {
    const header = await reader.readExact(4);
    const len = header.readUInt32BE(0);
    if (len === 0) break;
    if (len > 20_000_000) {
      throw new Error(`frame too large: ${len}`);
    }
    const image = await reader.readExact(len);
    let out;
    try {
      if (image.length === 0) {
        out = { width: 0, height: 0, persons: [], error: "empty image" };
      } else {
        out = await detector.detect(image);
      }
    } catch (err) {
      out = {
        width: 0,
        height: 0,
        persons: [],
        error: err instanceof Error ? err.message : String(err),
      };
    }
    process.stdout.write(`${JSON.stringify(out)}\n`);
  }
}

const { score, imagePath, serve } = parseArgs(process.argv);
const { PersonDetector } = await import(pathToFileURL(resolveOdIndex()).href);
const detector = new PersonDetector({ scoreThreshold: score });
await detector.load({ download: true });

if (serve) {
  try {
    await serveLoop(detector);
  } finally {
    await detector.dispose?.().catch(() => {});
  }
  process.exit(0);
}

const image = await readImage(imagePath);
if (!image.length) {
  process.stderr.write("detect-person: empty image input\n");
  process.exit(2);
}
const result = await detector.detect(image);
process.stdout.write(JSON.stringify(result));
await detector.dispose?.().catch(() => {});
