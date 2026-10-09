/**
 * Depth + YOLO person loop for Creep or Treat. Samples RealSense sectors and speaks.
 * This skill does not publish cmd_vel. The robot stays on wall power.
 */

import type { AgenticROSConfig } from "@agenticros/core";
import type { RosTransport } from "@agenticros/core";
import { getHalloweenConfig, type HalloweenConfig } from "./config.js";
import { gateDepthWithPerson } from "./gate.js";
import { halloweenLines } from "./lines.js";
import {
  initialHauntState,
  tickHaunt,
  type HauntState,
  type SpeedBand,
  type Zone,
} from "./engine.js";
import { PersonWatch } from "./person-watch.js";
import { closestSector, type Side } from "./range.js";
import type { SkillContext } from "./types.js";
import { createSpeaker, type Speaker } from "./voice.js";

const DEFAULT_COLOR_TOPIC = "/camera/camera/color/image_raw/compressed";

export interface HauntStatus {
  running: boolean;
  zone: Zone;
  band: SpeedBand;
  distanceM: number | null;
  approachMps: number;
  side: Side | null;
  inVisit: boolean;
  visitorCount: number;
  lastLine: string;
  person: boolean;
  personReady: boolean;
  requirePerson: boolean;
}

let generation = 0;
let loopInterval: ReturnType<typeof setInterval> | null = null;
let tickInProgress = false;
let speaker: Speaker | null = null;
let personWatch: PersonWatch | null = null;
let hauntState: HauntState = initialHauntState();
let activeConfig: HalloweenConfig | null = null;
let lensSince: number | null = null;
let warnedBowl = false;
let lastDepthWarnMs = 0;

export function getHauntStatus(): HauntStatus {
  const watch = personWatch?.status();
  return {
    running: loopInterval != null,
    zone: hauntState.zone,
    band: hauntState.band,
    distanceM: hauntState.smoothedM,
    approachMps: hauntState.approachMps,
    side: hauntState.side,
    inVisit: hauntState.inVisit,
    visitorCount: hauntState.visitorCount,
    lastLine: hauntState.lastLine,
    person: watch?.present ?? false,
    personReady: watch?.ready ?? false,
    requirePerson: activeConfig?.requirePerson ?? true,
  };
}

export function formatHauntStatus(status: HauntStatus = getHauntStatus()): string {
  if (!status.running) {
    const visits =
      status.visitorCount > 0 ? ` It has greeted ${status.visitorCount} so far.` : "";
    return `Creep or Treat is quiet.${visits} Say start when the bowl is out and the robot is plugged in.`;
  }
  const distance =
    status.distanceM == null ? "nobody in range" : `${status.distanceM.toFixed(2)} m, ${status.zone}`;
  const speed = `${status.approachMps.toFixed(2)} m/s (${status.band})`;
  const last = status.lastLine ? ` Last line: "${status.lastLine}".` : "";
  let vision = "";
  if (status.requirePerson) {
    if (!status.personReady) vision = " YOLO warming up.";
    else vision = status.person ? " Person: yes." : " Person: no.";
  }
  return `Creep or Treat is hosting. ${distance}. Approach ${speed}. Visitors: ${status.visitorCount}.${vision}${last}`;
}

function resolveCameraTopic(halloween: HalloweenConfig, config: AgenticROSConfig): string {
  const fromSkill = halloween.cameraTopic.trim();
  if (fromSkill) return fromSkill;
  const fromRobot = (config.robot?.cameraTopic ?? "").trim();
  if (fromRobot) {
    // Prefer compressed when the configured topic is raw color.
    if (fromRobot.endsWith("/image_raw") && !fromRobot.includes("compressed")) {
      return `${fromRobot}/compressed`;
    }
    return fromRobot;
  }
  return DEFAULT_COLOR_TOPIC;
}

async function readDistance(
  transport: RosTransport,
  config: HalloweenConfig,
  context: SkillContext,
): Promise<{ distanceM: number | null; side: Side | null }> {
  const topic = config.depthTopic.trim();
  try {
    const sectors = await context.getDepthSectors(transport, topic, config.depthTimeoutMs);
    if (sectors.valid) {
      const closest = closestSector(sectors, config.minValidM, config.maxValidM);
      return closest
        ? { distanceM: closest.distanceM, side: closest.side }
        : { distanceM: null, side: null };
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const now = Date.now();
    if (now - lastDepthWarnMs > 8000) {
      lastDepthWarnMs = now;
      context.logger.warn(`Creep or Treat: depth sectors failed (${message.slice(0, 180)}).`);
    }
  }

  try {
    const center = await context.getDepthDistance(transport, topic, config.depthTimeoutMs);
    if (
      center.valid &&
      Number.isFinite(center.distance_m) &&
      center.distance_m >= config.minValidM &&
      center.distance_m <= config.maxValidM
    ) {
      return { distanceM: center.distance_m, side: "center" };
    }
    return { distanceM: null, side: null };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const now = Date.now();
    if (now - lastDepthWarnMs > 8000) {
      lastDepthWarnMs = now;
      context.logger.warn(`Creep or Treat: depth read failed (${message.slice(0, 180)}).`);
    }
    return { distanceM: null, side: null };
  }
}

function runTick(
  transport: RosTransport,
  config: HalloweenConfig,
  context: SkillContext,
  runGeneration: number,
): void {
  if (tickInProgress) return;
  tickInProgress = true;
  void (async () => {
    try {
      if (runGeneration !== generation) return;
      const depth = await readDistance(transport, config, context);
      if (runGeneration !== generation) return;
      const presence = personWatch ? personWatch.presence() : null;
      const reading = gateDepthWithPerson(depth, presence, config.requirePerson);
      const beforeZone = hauntState.zone;
      const result = tickHaunt(hauntState, { now: Date.now(), ...reading }, config, halloweenLines);
      hauntState = result.state;
      if (result.state.zone !== beforeZone) {
        const range =
          result.state.smoothedM == null ? "out of range" : `${result.state.smoothedM.toFixed(2)} m`;
        context.logger.info(`Creep or Treat zone ${beforeZone} → ${result.state.zone} (${range}).`);
      }
      if (result.cue && speaker) {
        context.logger.info(`Creep or Treat ${result.cue.kind}: ${result.cue.text}`);
        speaker.perform(result.cue);
      }
      if (result.state.zone === "lens") {
        lensSince ??= Date.now();
        if (!warnedBowl && Date.now() - lensSince > 8000) {
          warnedBowl = true;
          context.logger.warn(
            "Creep or Treat: depth has stayed in the lens zone. The candy bowl may be in the RealSense frame. " +
              "Tilt the camera so the bowl sits below the image, or raise skills.halloween.minValidM above the empty-porch reading.",
          );
        }
      } else {
        lensSince = null;
      }
    } finally {
      tickInProgress = false;
    }
  })();
}

export function startHaunt(config: AgenticROSConfig, context: SkillContext): string {
  if (loopInterval) return "Creep or Treat is already hosting. The robot will stay put and keep talking.";

  const halloween = getHalloweenConfig(config.skills?.halloween);
  const topic = halloween.depthTopic.trim();
  if (!topic) {
    return "Set skills.halloween.depthTopic to the RealSense depth image before starting (for example /camera/camera/depth/image_rect_raw).";
  }

  let transport: RosTransport;
  try {
    transport = context.getTransport();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return `Can't start Creep or Treat: ${message}`;
  }

  generation += 1;
  const runGeneration = generation;
  hauntState = initialHauntState(Date.now());
  lensSince = null;
  warnedBowl = false;
  activeConfig = halloween;
  speaker = createSpeaker(halloween, context.logger);

  const cameraTopic = resolveCameraTopic(halloween, config);
  if (halloween.requirePerson) {
    const watch = new PersonWatch({
      cameraTopic,
      scoreThreshold: halloween.personScoreThreshold,
      personHz: halloween.personHz,
      missTicks: halloween.personMissTicks,
      logger: context.logger,
      loadRosCamera: context.importRosCamera,
    });
    personWatch = watch;
    void watch.start(transport).catch((err) => {
      const message = err instanceof Error ? err.message : String(err);
      context.logger.warn(
        `Creep or Treat: YOLO person detect failed (${message.slice(0, 400)}). Falling back to depth-only.`,
      );
      halloween.requirePerson = false;
      activeConfig = halloween;
      void watch.stop();
      if (personWatch === watch) personWatch = null;
    });
  } else {
    personWatch = null;
  }

  const periodMs = 1000 / halloween.rateHz;
  loopInterval = setInterval(() => {
    if (runGeneration !== generation) return;
    runTick(transport, halloween, context, runGeneration);
  }, periodMs);

  const vision = halloween.requirePerson
    ? ` YOLO person gate on (${cameraTopic}, ${halloween.personHz} Hz).`
    : " Depth-only (requirePerson=false).";
  context.logger.info(
    `Creep or Treat started. depthTopic="${topic}", ${halloween.rateHz} Hz.${vision} The base will not move.`,
  );
  return (
    "Creep or Treat is hosting. The robot stays still. " +
    (halloween.requirePerson
      ? "It greets only when YOLO sees a person, using depth for distance and approach speed. "
      : "Kids at the bowl will get a voice that creeps, talks, or screams from how they approach. ") +
    "Say stop when the night is over."
  );
}

export function stopHaunt(context: SkillContext): string {
  if (!loopInterval && !speaker && !personWatch) return "Creep or Treat is already quiet.";
  generation += 1;
  if (loopInterval) {
    clearInterval(loopInterval);
    loopInterval = null;
  }
  speaker?.stop();
  speaker = null;
  const watch = personWatch;
  personWatch = null;
  void watch?.stop();
  activeConfig = null;
  hauntState = {
    ...initialHauntState(Date.now()),
    visitorCount: hauntState.visitorCount,
    lastLine: hauntState.lastLine,
  };
  lensSince = null;
  context.logger.info("Creep or Treat stopped. No velocity command was sent.");
  return `Creep or Treat is quiet. It greeted ${hauntState.visitorCount} visitor${hauntState.visitorCount === 1 ? "" : "s"}. The robot did not move.`;
}

export function isHauntRunning(): boolean {
  return loopInterval != null;
}
