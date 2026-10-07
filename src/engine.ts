/**
 * Pure porch state machine. Distance picks the zone. Approach speed picks the voice.
 * Nothing in here moves the robot.
 */

import type { HauntTuning } from "./config.js";
import type { LineBook, VoiceBand } from "./lines.js";
import type { Side } from "./range.js";

export type Zone = "idle" | "notice" | "closing" | "bowl" | "lens";
export type SpeedBand = VoiceBand;
export type CueRole = "notice" | "rush" | "bowl" | "treat" | "lens" | "goodbye" | "idle";

export interface SpeechCue {
  role: CueRole;
  kind: "say" | "scream" | "gasp";
  text: string;
  band: SpeedBand;
  /** Screams, arrivals, and goodbyes skip the ordinary cooldown. */
  priority: boolean;
}

export interface DepthTick {
  now: number;
  /** Closest valid range, or null when the porch looks empty. */
  distanceM: number | null;
  side: Side | null;
}

interface RangeSample {
  t: number;
  d: number;
}

export interface HauntState {
  inVisit: boolean;
  screamed: boolean;
  treatSaid: boolean;
  lensSaid: boolean;
  spoke: boolean;
  lastSpokenAt: number;
  lastIdleAt: number;
  visitorCount: number;
  lastLine: string;
  zone: Zone;
  band: SpeedBand;
  smoothedM: number | null;
  approachMps: number;
  bowlSince: number | null;
  side: Side | null;
  missStreak: number;
  idleStreak: number;
  approachStreak: number;
  samples: RangeSample[];
}

export interface HauntTickResult {
  state: HauntState;
  cue: SpeechCue | null;
}

const ZONE_RANK: Record<Zone, number> = {
  idle: 0,
  notice: 1,
  closing: 2,
  bowl: 3,
  lens: 4,
};

export function initialHauntState(now = 0): HauntState {
  return {
    inVisit: false,
    screamed: false,
    treatSaid: false,
    lensSaid: false,
    spoke: false,
    lastSpokenAt: 0,
    lastIdleAt: now,
    visitorCount: 0,
    lastLine: "",
    zone: "idle",
    band: "still",
    smoothedM: null,
    approachMps: 0,
    bowlSince: null,
    side: null,
    missStreak: 0,
    idleStreak: 0,
    approachStreak: 0,
    samples: [],
  };
}

function median(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[mid] ?? 0;
  return ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2;
}

function zoneFromDistance(distanceM: number, tuning: HauntTuning): Zone {
  if (distanceM > tuning.noticeM) return "idle";
  if (distanceM > tuning.closingM) return "notice";
  if (distanceM > tuning.bowlM) return "closing";
  if (distanceM > tuning.lensM) return "bowl";
  return "lens";
}

function fartherBoundary(zone: Zone, tuning: HauntTuning): number {
  switch (zone) {
    case "lens":
      return tuning.lensM;
    case "bowl":
      return tuning.bowlM;
    case "closing":
      return tuning.closingM;
    case "notice":
      return tuning.noticeM;
    default:
      return Number.POSITIVE_INFINITY;
  }
}

/** Moving closer switches immediately. Moving away waits out a small hysteresis band. */
export function stabilizeZone(prev: Zone, distanceM: number, tuning: HauntTuning): Zone {
  const raw = zoneFromDistance(distanceM, tuning);
  if (ZONE_RANK[raw] >= ZONE_RANK[prev]) return raw;
  if (distanceM <= fartherBoundary(prev, tuning) + tuning.hysteresisM) return prev;
  return raw;
}

export function bandFromSpeed(mps: number, haveSpeed: boolean, tuning: HauntTuning): SpeedBand {
  if (!haveSpeed) return "walk";
  if (mps >= tuning.rushMinMps) return "rush";
  if (mps <= -0.25) return "leaving";
  if (Math.abs(mps) <= tuning.stillMaxMps) return "still";
  if (mps > 0 && mps <= tuning.creepMaxMps) return "creep";
  return "walk";
}

function isOutlier(samples: readonly RangeSample[], gateM: number): boolean {
  if (samples.length < 2) return false;
  const last = samples[samples.length - 1]?.d;
  if (last == null) return false;
  const rest = samples.slice(0, -1).map((sample) => sample.d);
  return Math.abs(last - median(rest)) > gateM;
}

function endVisit(state: HauntState, now: number): HauntState {
  return {
    ...state,
    inVisit: false,
    screamed: false,
    treatSaid: false,
    lensSaid: false,
    spoke: false,
    zone: "idle",
    band: "still",
    smoothedM: null,
    approachMps: 0,
    bowlSince: null,
    missStreak: 0,
    idleStreak: 0,
    approachStreak: 0,
    samples: [],
    lastIdleAt: now,
  };
}

function applyCue(state: HauntState, cue: SpeechCue, now: number): HauntState {
  const next: HauntState = {
    ...state,
    lastSpokenAt: now,
    lastLine: cue.text,
    spoke: true,
  };
  if (cue.kind === "scream" || cue.role === "rush" || cue.role === "lens") next.screamed = true;
  if (cue.role === "lens") next.lensSaid = true;
  if (cue.role === "treat") next.treatSaid = true;
  if (cue.role === "idle") next.lastIdleAt = now;
  return next;
}

function arrivalCue(
  zone: Zone,
  band: SpeedBand,
  side: Side | null,
  lines: LineBook,
  rand: () => number,
): SpeechCue {
  if (zone === "lens") {
    return { role: "lens", kind: "scream", text: lines.lens(rand), band: "rush", priority: true };
  }
  if (band === "rush") {
    return { role: "rush", kind: "scream", text: lines.rush(rand), band: "rush", priority: true };
  }
  if (zone === "bowl") {
    return { role: "bowl", kind: "gasp", text: lines.bowlArrive(rand), band: "walk", priority: true };
  }
  if (band === "creep") {
    return {
      role: "notice",
      kind: "gasp",
      text: lines.notice(band, side, rand),
      band: "creep",
      priority: true,
    };
  }
  return {
    role: "notice",
    kind: "say",
    text: lines.notice(band, side, rand),
    band: "walk",
    priority: true,
  };
}

export function tickHaunt(
  state: HauntState,
  input: DepthTick,
  tuning: HauntTuning,
  lines: LineBook,
  rand: () => number = Math.random,
): HauntTickResult {
  const now = input.now;
  const next: HauntState = {
    ...state,
    side: input.side ?? state.side,
    samples: state.samples.slice(),
  };
  const raw = input.distanceM;
  const haveRaw = raw != null && Number.isFinite(raw);

  let distance: number | null = null;
  let haveSpeed = false;

  if (!haveRaw) {
    next.missStreak = state.missStreak + 1;
    next.approachMps = 0;
    if (next.missStreak <= tuning.holdMissTicks && state.smoothedM != null) {
      distance = state.smoothedM;
    }
  } else {
    next.missStreak = 0;
    const samples = state.samples.slice(-2);
    samples.push({ t: now, d: raw });
    next.samples = samples;
    const smoothed = median(samples.map((sample) => sample.d));
    const previousT = state.samples[state.samples.length - 1]?.t;
    const dt = previousT == null ? 0 : (now - previousT) / 1000;
    const outlier = isOutlier(samples, tuning.outlierGateM);
    if (state.smoothedM != null && dt >= 0.05 && !outlier) {
      next.approachMps = Math.max(-3, Math.min(3, (state.smoothedM - smoothed) / dt));
      haveSpeed = true;
    } else {
      next.approachMps = 0;
    }
    next.smoothedM = smoothed;
    distance = smoothed;
  }

  const zone = distance == null ? "idle" : stabilizeZone(state.zone, distance, tuning);
  const band = distance == null ? "still" : bandFromSpeed(next.approachMps, haveSpeed, tuning);
  next.zone = zone;
  next.band = band;

  let cue: SpeechCue | null = null;

  if (zone === "idle") {
    next.idleStreak = state.idleStreak + 1;
    next.approachStreak = 0;
    next.bowlSince = null;
    if (state.inVisit && next.idleStreak >= tuning.idleTicksToEndVisit) {
      const text = state.spoke ? lines.goodbye(state.screamed, rand) : null;
      const ended = endVisit(next, now);
      Object.assign(next, ended);
      if (text) {
        cue = { role: "goodbye", kind: "say", text, band: "leaving", priority: true };
      }
    } else if (!state.inVisit && now - state.lastIdleAt >= tuning.idleIntervalMs) {
      cue = { role: "idle", kind: "say", text: lines.idle(rand), band: "still", priority: false };
    }
  } else {
    next.idleStreak = 0;
    next.approachStreak = state.approachStreak + 1;

    if (!state.inVisit) {
      if (next.approachStreak >= tuning.samplesToArrive) {
        next.inVisit = true;
        next.visitorCount = state.visitorCount + 1;
        next.screamed = false;
        next.treatSaid = false;
        next.lensSaid = false;
        next.spoke = false;
        next.bowlSince = zone === "bowl" ? now : null;
        cue = arrivalCue(zone, band, next.side, lines, rand);
      }
    } else if (zone === "lens" && !state.lensSaid) {
      cue = { role: "lens", kind: "scream", text: lines.lens(rand), band: "rush", priority: true };
    } else if (band === "rush" && !state.screamed) {
      cue = { role: "rush", kind: "scream", text: lines.rush(rand), band: "rush", priority: true };
    } else if (zone === "bowl" && !state.treatSaid) {
      if (next.bowlSince == null) next.bowlSince = now;
      const since = next.bowlSince ?? now;
      if (now - since >= tuning.bowlHoldMs && band !== "rush") {
        cue = {
          role: "treat",
          kind: "say",
          text: lines.treat(state.screamed, rand),
          band: band === "creep" ? "creep" : "walk",
          priority: false,
        };
      }
    } else if (zone !== "bowl") {
      next.bowlSince = null;
    }
  }

  if (cue && !cue.priority && now - state.lastSpokenAt < tuning.cooldownMs) {
    cue = null;
  }

  if (cue) Object.assign(next, applyCue(next, cue, now));

  return { state: next, cue };
}
