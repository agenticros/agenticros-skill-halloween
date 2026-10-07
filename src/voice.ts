/**
 * Local porch voice. espeak-ng speaks the lines. A short wav handles the scream and the gasp.
 * Playback happens on the machine running the gateway. This module never publishes cmd_vel.
 */

import { spawn, type ChildProcess } from "node:child_process";
import { accessSync, constants } from "node:fs";
import { delimiter, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { HalloweenConfig } from "./config.js";
import type { SpeechCue, SpeedBand } from "./engine.js";

export interface Speaker {
  perform(cue: SpeechCue): void;
  stop(): void;
}

export interface VoiceLogger {
  info(msg: string): void;
  warn(msg: string): void;
}

const VOICE_ARGS: Record<SpeedBand, readonly string[]> = {
  creep: ["-p", "64", "-s", "112", "-a", "85"],
  walk: ["-p", "42", "-s", "145", "-a", "130"],
  rush: ["-p", "30", "-s", "170", "-a", "170"],
  still: ["-p", "50", "-s", "130", "-a", "115"],
  leaving: ["-p", "36", "-s", "124", "-a", "110"],
};

export function bundledAsset(name: string): string {
  return join(dirname(fileURLToPath(import.meta.url)), "..", "assets", name);
}

function readable(path: string): boolean {
  try {
    accessSync(path, constants.R_OK);
    return true;
  } catch {
    return false;
  }
}

function onPath(bin: string): boolean {
  if (bin.includes("/") || bin.includes("\\")) return readable(bin);
  return (process.env.PATH ?? "")
    .split(delimiter)
    .some((dir) => dir.length > 0 && readable(join(dir, bin)));
}

function firstOnPath(bins: readonly string[]): string | null {
  for (const bin of bins) {
    if (onPath(bin)) return bin;
  }
  return null;
}

export function createSpeaker(config: HalloweenConfig, logger: VoiceLogger): Speaker {
  const espeakCandidates = [config.espeakBin, "espeak-ng", "espeak"].filter(
    (bin, index, all) => bin.trim().length > 0 && all.indexOf(bin) === index,
  );
  const playerCandidates = config.playerBin.trim()
    ? [config.playerBin.trim()]
    : ["paplay", "aplay", "afplay"];
  const screamWav = config.screamWav.trim() || bundledAsset("scream.wav");
  const gaspWav = config.gaspWav.trim() || bundledAsset("gasp.wav");

  let espeak: string | null | undefined;
  let player: string | null | undefined;
  let warnedEspeak = false;
  let warnedPlayer = false;
  let token = 0;
  let current: ChildProcess | null = null;
  let chain: Promise<void> = Promise.resolve();

  function resolveEspeak(): string | null {
    if (espeak === undefined) espeak = firstOnPath(espeakCandidates);
    return espeak;
  }

  function resolvePlayer(): string | null {
    if (player === undefined) player = firstOnPath(playerCandidates);
    return player;
  }

  function killCurrent(): void {
    if (current && !current.killed) current.kill("SIGTERM");
    current = null;
  }

  function run(bin: string, args: string[], runToken: number): Promise<void> {
    return new Promise((resolve) => {
      if (token !== runToken) {
        resolve();
        return;
      }
      const child = spawn(bin, args, { stdio: "ignore" });
      current = child;
      let settled = false;
      const finish = () => {
        if (settled) return;
        settled = true;
        if (current === child) current = null;
        resolve();
      };
      child.on("error", finish);
      child.on("close", finish);
    });
  }

  async function playWav(path: string, runToken: number): Promise<boolean> {
    if (!readable(path)) return false;
    const bin = resolvePlayer();
    if (!bin) {
      if (!warnedPlayer) {
        warnedPlayer = true;
        logger.warn(
          "Creep or Treat: no wav player found (paplay, aplay, or afplay). Screams will be spoken instead.",
        );
      }
      return false;
    }
    await run(bin, [path], runToken);
    return token === runToken;
  }

  async function say(text: string, band: SpeedBand, runToken: number): Promise<void> {
    const bin = resolveEspeak();
    if (!bin) {
      if (!warnedEspeak) {
        warnedEspeak = true;
        logger.warn(
          "Creep or Treat: espeak-ng is not installed, so the porch will stay quiet. Install it on the gateway machine (`sudo apt install espeak-ng`).",
        );
      }
      return;
    }
    const args = [...VOICE_ARGS[band], text];
    await run(bin, args, runToken);
  }

  async function playCue(cue: SpeechCue, runToken: number): Promise<void> {
    if (token !== runToken) return;
    if (cue.kind === "scream") {
      const played = await playWav(screamWav, runToken);
      if (!played && token === runToken) await say("Boo!", "rush", runToken);
    } else if (cue.kind === "gasp") {
      await playWav(gaspWav, runToken);
    }
    if (token !== runToken || cue.text.trim().length === 0) return;
    await say(cue.text, cue.band, runToken);
  }

  return {
    perform(cue) {
      const runToken = cue.priority ? ++token : token;
      if (cue.priority) {
        killCurrent();
        chain = Promise.resolve();
      }
      chain = chain
        .then(() => playCue(cue, runToken))
        .catch((err: unknown) => {
          const message = err instanceof Error ? err.message : String(err);
          logger.warn(`Creep or Treat voice failed: ${message}`);
        });
    },
    stop() {
      token++;
      killCurrent();
      chain = Promise.resolve();
    },
  };
}
