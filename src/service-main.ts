import { PaperBroker } from "./broker";
import { LocalPaperEngineService } from "./local-service";
import { RiskManager } from "./risk";
import { DecisionEngine } from "./decision";
import { IntelligenceEngine } from "./intelligence";
import { IntegratedPaperResearchEngine } from "./integrated-engine";

const broker = new PaperBroker({ initialCash: 100_000, feeBps: 1, slippageBps: 5 });
const risk = new RiskManager({ maxPositionValue: 10_000, maxGrossExposure: 25_000, maxDailyLoss: 1_000, maxDrawdown: 2_000, maxOrdersPerMinute: 10, feeBps: 1, slippageBps: 5 });
// The default service has no validated model/evidence configured, so its safe
// decision is NO_TRADE until an offline research artifact is explicitly loaded.
const engine = new IntegratedPaperResearchEngine(new IntelligenceEngine(), new DecisionEngine(), broker, risk);
const service = new LocalPaperEngineService(engine, { host: "127.0.0.1", port: 47821 });
await service.start();
console.log("Paper Trading Lab engine listening on http://127.0.0.1:47821 (paper-only)");
const shutdown = async () => { await service.stop(); process.exit(0); };
process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);
