import test from "node:test";
import assert from "node:assert/strict";
import { LocalPaperEngineService, type LocalEnginePort } from "../src/local-service";

const fakeEngine = (): LocalEnginePort => ({ health: { dataFresh: false, lastQuoteTs: {}, engineMode: "INTEGRATED_RESEARCH", protocolVersion: "1" }, portfolioSnapshot: () => ({ equity: 100, cash: 100 }), setOperationalNow() {}, onBar() {}, pause() {}, resume() {}, activateKillSwitch() {}, resetKillSwitch() {} });
test("service trusts only configured extension origins and rejects non-loopback binding", async () => {
  await assert.rejects(() => new LocalPaperEngineService(fakeEngine(), { host: "0.0.0.0" }).start(), /Non-loopback/);
  const service = new LocalPaperEngineService(fakeEngine(), { port: 0, allowedOrigins: ["chrome-extension://trusted"] }); await service.start(); try { const address = service.address()!; const blocked = await fetch(`http://${address.host}:${address.port}/health`, { headers: { Origin: "chrome-extension://other" } }); assert.equal(blocked.status, 403); const allowed = await fetch(`http://${address.host}:${address.port}/health`, { headers: { Origin: "chrome-extension://trusted" } }); assert.equal(allowed.status, 200); } finally { await service.stop(); }
});
