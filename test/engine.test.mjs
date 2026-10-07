import assert from "node:assert/strict";
import { test } from "node:test";
import { DEFAULT_TUNING } from "../dist/config.js";
import { initialHauntState, tickHaunt } from "../dist/engine.js";
import { halloweenLines } from "../dist/lines.js";
import { closestSector } from "../dist/range.js";

const rand = () => 0;

function step(state, now, distanceM, side = "center") {
  return tickHaunt(state, { now, distanceM, side }, DEFAULT_TUNING, halloweenLines, rand);
}

test("an empty porch stays quiet until the idle interval", () => {
  let state = initialHauntState(0);
  let result = step(state, 1000, 3.2);
  assert.equal(result.cue, null);
  assert.equal(result.state.inVisit, false);
  result = step(result.state, DEFAULT_TUNING.idleIntervalMs + 1, null);
  assert.equal(result.cue?.role, "idle");
  assert.equal(result.cue?.text, "The bowl is waiting.");
});

test("two calm samples start a visit and greet", () => {
  let result = step(initialHauntState(0), 0, 2.2);
  assert.equal(result.state.inVisit, false);
  assert.equal(result.cue, null);
  result = step(result.state, 400, 2.12, "left");
  assert.equal(result.state.inVisit, true);
  assert.equal(result.state.visitorCount, 1);
  assert.equal(result.cue?.role, "notice");
  assert.match(result.cue?.text ?? "", /On my left\./);
});

test("a creep gets the quiet line", () => {
  let result = step(initialHauntState(0), 0, 2.4);
  result = step(result.state, 800, 2.2);
  assert.equal(result.state.band, "creep");
  assert.equal(result.cue?.kind, "gasp");
  assert.equal(result.cue?.text, "Ooooh. A careful one.");
});

test("a rush screams once, then does not scream again", () => {
  let result = step(initialHauntState(0), 0, 2.4);
  result = step(result.state, 200, 1.5);
  assert.equal(result.cue?.role, "rush");
  assert.equal(result.cue?.kind, "scream");
  assert.equal(result.cue?.text, "Too fast! Creep, don't charge.");
  result = step(result.state, 400, 1.15);
  assert.notEqual(result.cue?.role, "rush");
  assert.equal(result.state.visitorCount, 1);
});

test("holding at the bowl earns a treat line", () => {
  const frames = [
    [0, 2.2],
    [400, 2.15],
    [1400, 1.7],
    [2400, 1.35],
    [3400, 1.0],
    [4400, 0.78],
    [5400, 0.72],
    [6400, 0.7],
  ];
  let result = { state: initialHauntState(0), cue: null };
  const roles = [];
  for (const [now, distanceM] of frames) {
    result = step(result.state, now, distanceM);
    if (result.cue) roles.push(result.cue.role);
  }
  assert.equal(result.cue?.role, "treat");
  assert.equal(result.cue?.text, "Take one from the bowl at my feet.");
  assert.ok(roles.includes("notice"));
  assert.equal(roles.includes("rush"), false);
});

test("leaning into the lens screams about the bowl at the feet", () => {
  let result = step(initialHauntState(0), 0, 2.2);
  result = step(result.state, 300, 2.1);
  result = step(result.state, 500, 0.32);
  result = step(result.state, 700, 0.3);
  assert.equal(result.cue?.role, "lens");
  assert.match(result.cue?.text ?? "", /feet/);
});

test("backing out ends the visit with a goodbye", () => {
  let result = step(initialHauntState(0), 0, 2.2);
  result = step(result.state, 300, 2.1);
  assert.ok(result.cue);
  let goodbye = null;
  for (let i = 1; i <= 6; i += 1) {
    result = step(result.state, 300 + i * 200, 3.4);
    if (result.cue?.role === "goodbye") goodbye = result.cue;
  }
  assert.equal(goodbye?.text, "Happy haunting.");
  assert.equal(result.state.inVisit, false);
  assert.equal(result.state.visitorCount, 1);
});

test("a scream changes the goodbye", () => {
  let result = step(initialHauntState(0), 0, 2.4);
  result = step(result.state, 200, 1.5);
  result = step(result.state, 400, 1.15);
  assert.equal(result.state.screamed, true);
  let goodbye = null;
  for (let i = 1; i <= 6; i += 1) {
    result = step(result.state, 400 + i * 200, 3.5);
    if (result.cue?.role === "goodbye") goodbye = result.cue;
  }
  assert.equal(goodbye?.text, "Yeah. Run.");
  assert.equal(result.state.inVisit, false);
});

test("one close glitch does not scream", () => {
  let result = step(initialHauntState(0), 0, 2.3);
  result = step(result.state, 200, 2.25);
  assert.equal(result.cue?.role, "notice");
  result = step(result.state, 400, 0.35);
  assert.notEqual(result.cue?.kind, "scream");
});

test("closest sector ignores the bowl and reports the side", () => {
  const range = closestSector(
    { valid: true, left_m: 1.2, center_m: 0.2, right_m: 2.4 },
    0.3,
    4,
  );
  assert.deepEqual(range, { distanceM: 1.2, side: "left" });
  assert.deepEqual(
    closestSector({ valid: true, left_m: 1.2, center_m: 1.3, right_m: 2.4 }, 0.3, 4),
    { distanceM: 1.2, side: "center" },
  );
  assert.equal(
    closestSector({ valid: true, left_m: 0.2, center_m: 0.22, right_m: 0.25 }, 0.3, 4),
    null,
  );
  assert.equal(closestSector({ valid: false, left_m: 1, center_m: 1, right_m: 1 }, 0.3, 4), null);
});

test("a second kid is a new visit after the first leaves", () => {
  let result = step(initialHauntState(0), 0, 2.2);
  result = step(result.state, 300, 2.1, "right");
  for (let i = 1; i <= 6; i += 1) {
    result = step(result.state, 300 + i * 200, 3.4);
  }
  result = step(result.state, 5000, 2.0, "right");
  result = step(result.state, 5400, 1.9, "right");
  result = step(result.state, 5800, 1.85, "right");
  assert.equal(result.state.visitorCount, 2);
  assert.match(result.cue?.text ?? "", /On my right\./);
});
