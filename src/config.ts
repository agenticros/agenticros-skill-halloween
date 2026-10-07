/**
 * Creep or Treat config slice: config.skills.halloween
 */

export interface HauntTuning {
  /** Farther than this, the porch is empty. */
  noticeM: number;
  /** Inside notice, outside this, they are closing in. */
  closingM: number;
  /** Standing at the candy bowl. */
  bowlM: number;
  /** Leaning into the lens. */
  lensM: number;
  /** At or under this closing speed (m/s), the voice creeps. */
  creepMaxMps: number;
  /** At or over this closing speed (m/s), the robot screams. */
  rushMinMps: number;
  /** Absolute speed at or under this counts as standing still. */
  stillMaxMps: number;
  /** How long they must hold in the bowl zone before the treat line. */
  bowlHoldMs: number;
  /** Minimum gap between ordinary lines. Screams ignore this. */
  cooldownMs: number;
  /** How often to mutter when nobody is there. */
  idleIntervalMs: number;
  /** Extra meters required before a zone is allowed to step farther away. */
  hysteresisM: number;
  /** Idle samples in a row before a visit ends. */
  idleTicksToEndVisit: number;
  /** Missing depth samples to ride through before the porch counts as empty. */
  holdMissTicks: number;
  /** In-range samples required before a visit starts. */
  samplesToArrive: number;
  /** A single sample this far from the others does not count as approach speed. */
  outlierGateM: number;
}

export interface HalloweenConfig extends HauntTuning {
  depthTopic: string;
  rateHz: number;
  depthTimeoutMs: number;
  /** Ignore depth closer than this (bowl, floor, or the lens hood). */
  minValidM: number;
  /** Ignore depth farther than this. */
  maxValidM: number;
  espeakBin: string;
  /** Empty string picks paplay, aplay, or afplay. */
  playerBin: string;
  /** Empty string uses the bundled assets/scream.wav. */
  screamWav: string;
  /** Empty string uses the bundled assets/gasp.wav. */
  gaspWav: string;
}

export const DEFAULT_TUNING: HauntTuning = {
  noticeM: 2.5,
  closingM: 1.6,
  bowlM: 0.8,
  lensM: 0.4,
  creepMaxMps: 0.25,
  rushMinMps: 0.6,
  stillMaxMps: 0.1,
  bowlHoldMs: 1000,
  cooldownMs: 2500,
  idleIntervalMs: 35000,
  hysteresisM: 0.15,
  idleTicksToEndVisit: 3,
  holdMissTicks: 3,
  samplesToArrive: 2,
  outlierGateM: 1.0,
};

const DEFAULTS: HalloweenConfig = {
  ...DEFAULT_TUNING,
  depthTopic: "/camera/camera/depth/image_rect_raw",
  rateHz: 5,
  depthTimeoutMs: 1000,
  minValidM: 0.28,
  maxValidM: 4,
  espeakBin: "espeak-ng",
  playerBin: "",
  screamWav: "",
  gaspWav: "",
};

function num(source: Record<string, unknown>, key: string, fallback: number): number {
  const value = source[key];
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function str(source: Record<string, unknown>, key: string, fallback: string): string {
  const value = source[key];
  return typeof value === "string" ? value : fallback;
}

export function getHalloweenConfig(skillsSlice: unknown): HalloweenConfig {
  if (!skillsSlice || typeof skillsSlice !== "object") return { ...DEFAULTS };
  const source = skillsSlice as Record<string, unknown>;
  const config: HalloweenConfig = {
    ...DEFAULTS,
    depthTopic: str(source, "depthTopic", DEFAULTS.depthTopic),
    rateHz: num(source, "rateHz", DEFAULTS.rateHz),
    depthTimeoutMs: num(source, "depthTimeoutMs", DEFAULTS.depthTimeoutMs),
    minValidM: num(source, "minValidM", DEFAULTS.minValidM),
    maxValidM: num(source, "maxValidM", DEFAULTS.maxValidM),
    noticeM: num(source, "noticeM", DEFAULTS.noticeM),
    closingM: num(source, "closingM", DEFAULTS.closingM),
    bowlM: num(source, "bowlM", DEFAULTS.bowlM),
    lensM: num(source, "lensM", DEFAULTS.lensM),
    creepMaxMps: num(source, "creepMaxMps", DEFAULTS.creepMaxMps),
    rushMinMps: num(source, "rushMinMps", DEFAULTS.rushMinMps),
    stillMaxMps: num(source, "stillMaxMps", DEFAULTS.stillMaxMps),
    bowlHoldMs: num(source, "bowlHoldMs", DEFAULTS.bowlHoldMs),
    cooldownMs: num(source, "cooldownMs", DEFAULTS.cooldownMs),
    idleIntervalMs: num(source, "idleIntervalMs", DEFAULTS.idleIntervalMs),
    hysteresisM: num(source, "hysteresisM", DEFAULTS.hysteresisM),
    idleTicksToEndVisit: num(source, "idleTicksToEndVisit", DEFAULTS.idleTicksToEndVisit),
    holdMissTicks: num(source, "holdMissTicks", DEFAULTS.holdMissTicks),
    samplesToArrive: num(source, "samplesToArrive", DEFAULTS.samplesToArrive),
    outlierGateM: num(source, "outlierGateM", DEFAULTS.outlierGateM),
    espeakBin: str(source, "espeakBin", DEFAULTS.espeakBin),
    playerBin: str(source, "playerBin", DEFAULTS.playerBin),
    screamWav: str(source, "screamWav", DEFAULTS.screamWav),
    gaspWav: str(source, "gaspWav", DEFAULTS.gaspWav),
  };

  config.rateHz = Math.min(15, Math.max(1, config.rateHz));
  config.samplesToArrive = Math.max(1, Math.round(config.samplesToArrive));
  config.idleTicksToEndVisit = Math.max(1, Math.round(config.idleTicksToEndVisit));
  config.holdMissTicks = Math.max(0, Math.round(config.holdMissTicks));

  const zonesOk =
    config.noticeM > config.closingM &&
    config.closingM > config.bowlM &&
    config.bowlM > config.lensM &&
    config.lensM > 0 &&
    config.maxValidM > config.minValidM;
  if (!zonesOk) {
    config.noticeM = DEFAULTS.noticeM;
    config.closingM = DEFAULTS.closingM;
    config.bowlM = DEFAULTS.bowlM;
    config.lensM = DEFAULTS.lensM;
    config.minValidM = DEFAULTS.minValidM;
    config.maxValidM = DEFAULTS.maxValidM;
  }

  return config;
}
