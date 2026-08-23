import { PaperBroker } from "./broker";
import { LocalPaperEngineService } from "./local-service";
import { EmaCrossStrategy } from "./strategy";
import { RiskManager } from "./risk";
import { ResearchEngine } from "./engine";

const broker = new PaperBroker({ initialCash: 100_000, feeBps: 1, slippageBps: 5 });
const risk = new RiskManager({ maxPositionValue: 10_000, maxGrossExposure: 25_000, maxDailyLoss: 1_000, maxDrawdown: 2_000, maxOrdersPerMinute: 10, feeBps: 1, slippageBps: 5 });
const engine = new ResearchEngine(new EmaCrossStrategy(), broker, risk);
const service = new LocalPaperEngineService(engine, { host: "127.0.0.1", port: 47821 });
await service.start();
console.log("Paper Trading Lab engine listening on http://127.0.0.1:47821 (paper-only)");
const shutdown = async () => { await service.stop(); process.exit(0); };
process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);
