/**
 * Combine depth with optional YOLO person presence.
 * When requirePerson is on, furniture-only depth reads as an empty porch.
 */

import type { Side } from "./range.js";

export interface PresenceReading {
  present: boolean;
  side: Side | null;
}

export interface GatedRange {
  distanceM: number | null;
  side: Side | null;
}

/**
 * If a person is required and none is seen, drop the depth reading so the
 * haunt state machine treats the porch as idle.
 */
export function gateDepthWithPerson(
  depth: GatedRange,
  presence: PresenceReading | null,
  requirePerson: boolean,
): GatedRange {
  if (!requirePerson) return depth;
  if (!presence?.present) return { distanceM: null, side: null };
  return {
    distanceM: depth.distanceM,
    side: presence.side ?? depth.side,
  };
}

/** Map a person bbox center (0..1 across the image) to left/center/right. */
export function sideFromNormX(normX: number): Side {
  if (normX < 0.4) return "left";
  if (normX > 0.6) return "right";
  return "center";
}
