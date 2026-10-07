/**
 * Pick the closest believable RealSense sector.
 * Readings closer than minM are the bowl, the floor, or speckle.
 */

export type Side = "left" | "center" | "right";

export interface SectorSample {
  valid: boolean;
  left_m: number;
  center_m: number;
  right_m: number;
}

export interface ApproachRange {
  distanceM: number;
  side: Side;
}

const SIDES: readonly Side[] = ["center", "left", "right"];

function sectorDistance(sample: SectorSample, side: Side): number {
  if (side === "left") return sample.left_m;
  if (side === "right") return sample.right_m;
  return sample.center_m;
}

export function closestSector(
  sample: SectorSample,
  minM: number,
  maxM: number,
): ApproachRange | null {
  if (!sample.valid) return null;

  let best: ApproachRange | null = null;
  for (const side of SIDES) {
    const distanceM = sectorDistance(sample, side);
    if (!Number.isFinite(distanceM) || distanceM < minM || distanceM > maxM) continue;
    if (!best || distanceM < best.distanceM) best = { distanceM, side };
  }
  if (!best || best.side === "center") return best;

  const centerM = sample.center_m;
  // A slightly nearer edge is usually the same kid standing in front of the bowl.
  // Keep the closest distance so the zone stays honest, and call the side center.
  if (Number.isFinite(centerM) && centerM >= minM && centerM <= maxM && centerM <= best.distanceM + 0.2) {
    return { distanceM: best.distanceM, side: "center" };
  }
  return best;
}
