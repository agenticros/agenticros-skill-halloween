import assert from "node:assert/strict";
import { test } from "node:test";
import { gateDepthWithPerson, sideFromNormX } from "../dist/gate.js";

test("requirePerson drops depth when nobody is seen", () => {
  const gated = gateDepthWithPerson(
    { distanceM: 1.2, side: "center" },
    { present: false, side: null },
    true,
  );
  assert.equal(gated.distanceM, null);
  assert.equal(gated.side, null);
});

test("requirePerson keeps depth and prefers YOLO side", () => {
  const gated = gateDepthWithPerson(
    { distanceM: 1.4, side: "center" },
    { present: true, side: "left" },
    true,
  );
  assert.equal(gated.distanceM, 1.4);
  assert.equal(gated.side, "left");
});

test("depth-only mode ignores presence", () => {
  const gated = gateDepthWithPerson(
    { distanceM: 0.9, side: "right" },
    { present: false, side: null },
    false,
  );
  assert.equal(gated.distanceM, 0.9);
  assert.equal(gated.side, "right");
});

test("sideFromNormX buckets left/center/right", () => {
  assert.equal(sideFromNormX(0.2), "left");
  assert.equal(sideFromNormX(0.5), "center");
  assert.equal(sideFromNormX(0.8), "right");
});
