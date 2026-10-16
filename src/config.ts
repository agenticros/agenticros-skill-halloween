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
  /** While a visitor stays in the bowl after the treat line, re-prompt this often. */
  bowlChatMs: number;
  /** Max extra bowl lines per visit (after the first treat). 0 disables. */
  bowlChatMax: number;
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
  /**
   * Color camera for YOLO person detection. Empty uses robot.cameraTopic, then
   * the RealSense compressed color topic.
   */
  cameraTopic: string;
  /** When true, depth alone never starts a visit — a YOLO person is required. */
  requirePerson: boolean;
  /** YOLO confidence threshold (0..1). */
  personScoreThreshold: number;
  /** How often to run YOLO (kept lower than depth rateHz on Jetson). */
  personHz: number;
  /** Missed YOLO frames before presence clears. */
  personMissTicks: number;
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
  bowlHoldMs: 500,
  /** Always 0 — successive kids must never wait on a speech cooldown. */
  cooldownMs: 0,
  /** Spacing between bowl lines for a lingering group (not a lockout). */
  bowlChatMs: 8000,
  /** High cap so groups keep getting lines; visit reset clears the counter. */
  bowlChatMax: 50,
  idleIntervalMs: 12000,
  hysteresisM: 0.15,
  /** End a visit as soon as the porch looks empty so the next kid is greeted. */
  idleTicksToEndVisit: 1,
  holdMissTicks: 2,
  samplesToArrive: 1,
  outlierGateM: 1.0,
};

const DEFAULTS: HalloweenConfig = {
  ...DEFAULT_TUNING,
  depthTopic: "/camera/camera/depth/image_rect_raw",
  rateHz: 5,
  depthTimeoutMs: 1000,
  minValidM: 0.28,
  maxValidM: 4,
  cameraTopic: "",
  requirePerson: true,
  personScoreThreshold: 0.45,
  personHz: 1.5,
  personMissTicks: 3,
  espeakBin: "espeak-ng",
  playerBin: "",
  screamWav: "",
  gaspWav: "",
};

function bool(source: Record<string, unknown>, key: string, fallback: boolean): boolean {
  const value = source[key];
  return typeof value === "boolean" ? value : fallback;
}

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
    cameraTopic: str(source, "cameraTopic", DEFAULTS.cameraTopic),
    requirePerson: bool(source, "requirePerson", DEFAULTS.requirePerson),
    personScoreThreshold: num(source, "personScoreThreshold", DEFAULTS.personScoreThreshold),
    personHz: num(source, "personHz", DEFAULTS.personHz),
    personMissTicks: num(source, "personMissTicks", DEFAULTS.personMissTicks),
    noticeM: num(source, "noticeM", DEFAULTS.noticeM),
    closingM: num(source, "closingM", DEFAULTS.closingM),
    bowlM: num(source, "bowlM", DEFAULTS.bowlM),
    lensM: num(source, "lensM", DEFAULTS.lensM),
    creepMaxMps: num(source, "creepMaxMps", DEFAULTS.creepMaxMps),
    rushMinMps: num(source, "rushMinMps", DEFAULTS.rushMinMps),
    stillMaxMps: num(source, "stillMaxMps", DEFAULTS.stillMaxMps),
    bowlHoldMs: num(source, "bowlHoldMs", DEFAULTS.bowlHoldMs),
    cooldownMs: num(source, "cooldownMs", DEFAULTS.cooldownMs),
    bowlChatMs: num(source, "bowlChatMs", DEFAULTS.bowlChatMs),
    bowlChatMax: num(source, "bowlChatMax", DEFAULTS.bowlChatMax),
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
  config.personHz = Math.min(5, Math.max(0.5, config.personHz));
  config.personScoreThreshold = Math.min(0.95, Math.max(0.1, config.personScoreThreshold));
  config.personMissTicks = Math.max(1, Math.round(config.personMissTicks));
  config.samplesToArrive = Math.max(1, Math.round(config.samplesToArrive));
  config.idleTicksToEndVisit = Math.max(1, Math.round(config.idleTicksToEndVisit));
  config.holdMissTicks = Math.max(0, Math.round(config.holdMissTicks));
  config.cooldownMs = 0; // porch traffic never waits on cooldown
  config.bowlChatMs = Math.max(3000, config.bowlChatMs);
  config.bowlChatMax = Math.max(0, Math.round(config.bowlChatMax));
  config.idleIntervalMs = Math.max(1000, config.idleIntervalMs);

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
