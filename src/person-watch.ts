/**
 * Color-camera person watch via YOLOv8n (shared @agenticros/object-detection).
 * Subscribes to a CompressedImage/Image topic and runs detection at personHz.
 *
 * Under OpenClaw, in-process onnxruntime-node/sharp are remapped to other
 * plugins' native admissions and fail. Detection runs in a short-lived Node
 * child (scripts/detect-person.mjs) that loads plugin-deploy / monorepo
 * @agenticros/object-detection with a clean module graph.
 */

import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import type { RosTransport, Subscription } from "@agenticros/core";
import type { PersonDetection } from "@agenticros/object-detection";
import { sideFromNormX, type PresenceReading } from "./gate.js";
import type { Side } from "./range.js";

export interface PersonWatchOptions {
  cameraTopic: string;
  scoreThreshold: number;
  personHz: number;
  /** Consecutive misses before presence clears. */
  missTicks: number;
  logger: { info(msg: string): void; warn(msg: string): void; error(msg: string): void };
  /** Optional host-plugin ros-camera loader; OD always uses subprocess. */
  loadRosCamera?: () => Promise<unknown>;
}

export interface PersonWatchStatus {
  enabled: boolean;
  ready: boolean;
  present: boolean;
  side: Side | null;
  confidence: number;
  lastError: string | null;
  frames: number;
  detections: number;
}

type Detector = {
  load(opts?: { download?: boolean }): Promise<void>;
  detect(image: Buffer | Uint8Array): Promise<{
    width: number;
    height: number;
    persons: PersonDetection[];
  }>;
  dispose?(): Promise<void>;
};

type RosCameraMod = {
  ROS_MSG_COMPRESSED_IMAGE: string;
  ROS_MSG_IMAGE: string;
  cameraSnapshotFromPlainMessage: (
    messageType: "Image" | "CompressedImage",
    msg: Record<string, unknown>,
  ) => { dataBase64: string };
};

async function importFile(absJs: string): Promise<unknown> {
  return import(pathToFileURL(absJs).href);
}

function packageCandidates(pkgName: "object-detection" | "ros-camera"): string[] {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const home = process.env["HOME"] ?? "";
  return [
    path.join(home, ".agenticros/plugin-deploy/node_modules/@agenticros", pkgName, "dist/index.js"),
    path.resolve(here, "../../agenticros/packages", pkgName, "dist/index.js"),
    path.resolve(here, "../node_modules/@agenticros", pkgName, "dist/index.js"),
  ];
}

async function loadWorkspacePackage<T>(
  bare: string,
  pkgName: "object-detection" | "ros-camera",
): Promise<T> {
  const errors: string[] = [];
  for (const candidate of packageCandidates(pkgName)) {
    try {
      return (await importFile(candidate)) as T;
    } catch (err) {
      errors.push(`${candidate}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  try {
    return (await import(bare)) as T;
  } catch (err) {
    errors.push(err instanceof Error ? err.message : String(err));
  }
  throw new Error(
    `Could not load @agenticros/${pkgName}. Tried deploy/workspace paths and bare import. Last: ${errors.at(-1) ?? "unknown"}`,
  );
}

async function loadRosCamera(opts: PersonWatchOptions): Promise<RosCameraMod> {
  if (opts.loadRosCamera) {
    return (await opts.loadRosCamera()) as RosCameraMod;
  }
  return loadWorkspacePackage<RosCameraMod>("@agenticros/ros-camera", "ros-camera");
}

function findDetectScript(): string {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const candidates = [
    // Built skill: dist/ -> ../scripts/
    path.resolve(here, "../scripts/detect-person.mjs"),
    // Source checkout (if ever imported from src/)
    path.resolve(here, "../../scripts/detect-person.mjs"),
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  throw new Error(
    `detect-person.mjs not found next to this skill (expected scripts/detect-person.mjs).`,
  );
}

function sharpLibvipsDir(): string | null {
  const pnpm = path.join(
    process.env["HOME"] ?? os.homedir(),
    ".agenticros/plugin-deploy/node_modules/.pnpm",
  );
  if (!fs.existsSync(pnpm)) return null;
  for (const name of fs.readdirSync(pnpm)) {
    if (!name.startsWith("@img+sharp-libvips-linux-arm64@")) continue;
    const lib = path.join(pnpm, name, "node_modules/@img/sharp-libvips-linux-arm64/lib");
    if (fs.existsSync(path.join(lib, "libvips-cpp.so.42"))) return lib;
  }
  return null;
}

/** Tiny 1×1 JPEG so load() can warm the model without a camera frame. */
const TINY_JPEG = Buffer.from(
  "/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAn/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCwAA8A/9k=",
  "base64",
);

class SubprocessPersonDetector implements Detector {
  private script = "";
  private scoreThreshold: number;

  constructor(opts?: { scoreThreshold?: number }) {
    this.scoreThreshold = opts?.scoreThreshold ?? 0.4;
  }

  async load(): Promise<void> {
    this.script = findDetectScript();
    // Warm model + verify natives outside OpenClaw's remap.
    await this.detect(TINY_JPEG);
  }

  async detect(image: Buffer | Uint8Array): Promise<{
    width: number;
    height: number;
    persons: PersonDetection[];
  }> {
    const script = this.script || findDetectScript();
    const vips = sharpLibvipsDir();
    const env = { ...process.env };
    if (vips) {
      env["LD_LIBRARY_PATH"] = `${vips}${env["LD_LIBRARY_PATH"] ? `:${env["LD_LIBRARY_PATH"]}` : ""}`;
    }
    // Child must not inherit OpenClaw service marker quirks; keep a clean node.
    delete env["NODE_OPTIONS"];

    const buf = Buffer.isBuffer(image) ? image : Buffer.from(image);
    const stdout = await new Promise<Buffer>((resolve, reject) => {
      const child = spawn(
        process.execPath,
        [script, "--score", String(this.scoreThreshold)],
        { env, stdio: ["pipe", "pipe", "pipe"] },
      );
      const out: Buffer[] = [];
      const err: Buffer[] = [];
      child.stdout.on("data", (c: Buffer) => out.push(c));
      child.stderr.on("data", (c: Buffer) => err.push(c));
      child.on("error", reject);
      child.on("close", (code) => {
        if (code === 0) resolve(Buffer.concat(out));
        else {
          reject(
            new Error(
              `detect-person exited ${code}: ${Buffer.concat(err).toString("utf8").slice(0, 400)}`,
            ),
          );
        }
      });
      child.stdin.write(buf);
      child.stdin.end();
    });

    const parsed = JSON.parse(stdout.toString("utf8")) as {
      width: number;
      height: number;
      persons: PersonDetection[];
    };
    return parsed;
  }
}

export class PersonWatch {
  private sub: Subscription | null = null;
  private interval: ReturnType<typeof setInterval> | null = null;
  private detector: Detector | null = null;
  private rosCamera: RosCameraMod | null = null;
  private latest: { buffer: Buffer; at: number } | null = null;
  private detecting = false;
  private present = false;
  private side: Side | null = null;
  private confidence = 0;
  private missStreak = 0;
  private frames = 0;
  private detections = 0;
  private lastError: string | null = null;
  private ready = false;
  private readonly opts: PersonWatchOptions;

  constructor(opts: PersonWatchOptions) {
    this.opts = opts;
  }

  status(): PersonWatchStatus {
    return {
      enabled: this.interval != null,
      ready: this.ready,
      present: this.present,
      side: this.side,
      confidence: this.confidence,
      lastError: this.lastError,
      frames: this.frames,
      detections: this.detections,
    };
  }

  presence(): PresenceReading {
    return { present: this.present, side: this.side };
  }

  async start(transport: RosTransport): Promise<void> {
    await this.stop();
    const topic = this.opts.cameraTopic.trim();
    if (!topic) throw new Error("skills.halloween.cameraTopic is empty");

    this.rosCamera = await loadRosCamera(this.opts);
    // Always use the subprocess detector under OpenClaw; also fine for local
    // smoke tests (same deploy script).
    this.detector = new SubprocessPersonDetector({
      scoreThreshold: this.opts.scoreThreshold,
    });
    await this.detector.load({ download: true });
    this.ready = true;
    this.opts.logger.info(
      `Creep or Treat: YOLO person detector ready via subprocess (topic=${topic}, ${this.opts.personHz} Hz).`,
    );

    const compressed = topic.includes("compressed");
    const msgType = compressed
      ? this.rosCamera.ROS_MSG_COMPRESSED_IMAGE
      : this.rosCamera.ROS_MSG_IMAGE;
    this.sub = transport.subscribe({ topic, type: msgType }, (msg) => {
      try {
        const payload = this.rosCamera!.cameraSnapshotFromPlainMessage(
          compressed ? "CompressedImage" : "Image",
          msg as Record<string, unknown>,
        );
        this.latest = {
          buffer: Buffer.from(payload.dataBase64, "base64"),
          at: Date.now(),
        };
      } catch (err) {
        this.lastError = err instanceof Error ? err.message : String(err);
      }
    });

    const periodMs = Math.max(200, Math.round(1000 / this.opts.personHz));
    this.interval = setInterval(() => {
      void this.tick();
    }, periodMs);
  }

  async stop(): Promise<void> {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
    this.sub?.unsubscribe();
    this.sub = null;
    this.latest = null;
    this.present = false;
    this.side = null;
    this.confidence = 0;
    this.missStreak = 0;
    this.ready = false;
    if (this.detector?.dispose) {
      await this.detector.dispose().catch(() => {});
    }
    this.detector = null;
    this.rosCamera = null;
  }

  private async tick(): Promise<void> {
    if (this.detecting || !this.detector) return;
    const frame = this.latest;
    if (!frame || Date.now() - frame.at > 2500) {
      this.noteMiss();
      return;
    }
    this.detecting = true;
    try {
      const result = await this.detector.detect(frame.buffer);
      this.frames += 1;
      const best = result.persons.reduce<PersonDetection | null>(
        (a, b) => (!a || b.confidence > a.confidence ? b : a),
        null,
      );
      if (!best || result.width <= 0) {
        this.noteMiss();
        return;
      }
      this.detections += 1;
      this.missStreak = 0;
      this.present = true;
      this.confidence = best.confidence;
      const normX = (best.x + best.width / 2) / result.width;
      this.side = sideFromNormX(normX);
      this.lastError = null;
    } catch (err) {
      this.lastError = err instanceof Error ? err.message : String(err);
      this.noteMiss();
    } finally {
      this.detecting = false;
    }
  }

  private noteMiss(): void {
    this.missStreak += 1;
    if (this.missStreak >= this.opts.missTicks) {
      this.present = false;
      this.side = null;
      this.confidence = 0;
    }
  }
}
