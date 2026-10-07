import type { Side } from "./range.js";

export type VoiceBand = "creep" | "walk" | "rush" | "still" | "leaving";

export interface LineBook {
  notice(band: VoiceBand, side: Side | null, rand: () => number): string;
  rush(rand: () => number): string;
  bowlArrive(rand: () => number): string;
  treat(screamed: boolean, rand: () => number): string;
  lens(rand: () => number): string;
  goodbye(screamed: boolean, rand: () => number): string;
  idle(rand: () => number): string;
}

function pick(items: readonly string[], rand: () => number): string {
  const index = Math.min(items.length - 1, Math.max(0, Math.floor(rand() * items.length)));
  return items[index] ?? items[0] ?? "";
}

function withSide(line: string, side: Side | null): string {
  if (side === "left") return `${line} On my left.`;
  if (side === "right") return `${line} On my right.`;
  return line;
}

const NOTICE_WALK = [
  "Trick or treat. Come closer.",
  "A visitor. The bowl is at my feet.",
  "I see you. The candy is down by my feet.",
];

const NOTICE_CREEP = [
  "Ooooh. A careful one.",
  "Slow steps. I like that.",
  "Soft feet. The bowl is waiting.",
];

const RUSH = [
  "Too fast! Creep, don't charge.",
  "Boo! The candy isn't running away.",
  "Ah! Slow down, little ghost.",
];

const BOWL_ARRIVE = ["You're at the bowl.", "There you are. The bowl is at my feet."];

const TREAT = [
  "Take one from the bowl at my feet.",
  "One piece. The bowl is watching.",
  "There it is. Take one.",
];

const TREAT_AFTER_SCREAM = ["Alright. Take one. Slowly.", "Fine. One piece. No grabbing."];

const LENS = [
  "The candy is at my feet, not my face!",
  "Too close! The bowl is down there.",
  "Ah! Back up. Candy is at my feet.",
];

const GOODBYE = ["Happy haunting.", "Take care, small haunt.", "Off you go."];

const GOODBYE_AFTER_SCREAM = ["Yeah. Run.", "Off you go."];

const IDLE = [
  "The bowl is waiting.",
  "Anyone brave enough?",
  "Candy. At my feet. If you dare.",
  "I can hear the street.",
];

export const halloweenLines: LineBook = {
  notice(band, side, rand) {
    const line = band === "creep" ? pick(NOTICE_CREEP, rand) : pick(NOTICE_WALK, rand);
    return withSide(line, side);
  },
  rush(rand) {
    return pick(RUSH, rand);
  },
  bowlArrive(rand) {
    return pick(BOWL_ARRIVE, rand);
  },
  treat(screamed, rand) {
    return pick(screamed ? TREAT_AFTER_SCREAM : TREAT, rand);
  },
  lens(rand) {
    return pick(LENS, rand);
  },
  goodbye(screamed, rand) {
    return pick(screamed ? GOODBYE_AFTER_SCREAM : GOODBYE, rand);
  },
  idle(rand) {
    return pick(IDLE, rand);
  },
};
