import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("extension does not advertise the legacy EMA strategy", () => { const worker = readFileSync(new URL("../extension/service-worker.js", import.meta.url), "utf8"); assert.equal(worker.includes("ema-cross v1.0.0"), false); assert.equal(worker.includes("PROTOCOL_MISMATCH"), true); });
