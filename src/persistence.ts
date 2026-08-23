import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import type { ClosedTrade } from "./domain";
import type { EventRepository, Experiment, ExperimentRepository, ResearchEvent, ResearchEventType, TradeRepository } from "./research-ledger";
import type { ExperienceRecord, PredictionRecord } from "./experience";
import type { ModelArtifact } from "./ml";

function ensureParent(filePath: string) { mkdirSync(dirname(filePath), { recursive: true }); }
function readJsonLines<T>(filePath: string): T[] { if (!existsSync(filePath)) return []; const contents = readFileSync(filePath, "utf8").trim(); return contents ? contents.split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line) as T) : []; }

export class JsonlEventRepository implements EventRepository {
  constructor(private readonly filePath: string) { ensureParent(filePath); }
  append(event: ResearchEvent) { const events = readJsonLines<ResearchEvent>(this.filePath); if (events.some((existing) => existing.id === event.id)) throw new Error(`Duplicate event id: ${event.id}`); if (events.at(-1) && event.timestamp < events.at(-1)!.timestamp) throw new Error("Event journal must be monotonic"); appendFileSync(this.filePath, `${JSON.stringify(event)}\n`, "utf8"); }
  all() { return readJsonLines<ResearchEvent>(this.filePath).map((event) => structuredClone(event)); }
  byType(type: ResearchEventType) { return this.all().filter((event) => event.eventType === type); }
}

export class JsonExperimentRepository implements ExperimentRepository {
  constructor(private readonly filePath: string) { ensureParent(filePath); }
  private read() { if (!existsSync(this.filePath)) return [] as Experiment[]; const contents = readFileSync(this.filePath, "utf8").trim(); return contents ? JSON.parse(contents) as Experiment[] : []; }
  save(experiment: Experiment) { const records = this.read(); if (records.some((record) => record.experimentId === experiment.experimentId)) throw new Error(`Experiment already exists: ${experiment.experimentId}`); records.push(structuredClone(experiment)); writeFileSync(this.filePath, JSON.stringify(records, null, 2) + "\n", "utf8"); }
  get(id: string) { const value = this.read().find((record) => record.experimentId === id); return value ? structuredClone(value) : undefined; }
  all() { return this.read().map((record) => structuredClone(record)); }
}

export class JsonlTradeRepository implements TradeRepository<ClosedTrade> {
  constructor(private readonly filePath: string) { ensureParent(filePath); }
  append(trade: ClosedTrade) { if (this.all().some((existing) => existing.tradeId === trade.tradeId)) throw new Error(`Duplicate trade id: ${trade.tradeId}`); appendFileSync(this.filePath, `${JSON.stringify(trade)}\n`, "utf8"); }
  all() { return readJsonLines<ClosedTrade>(this.filePath).map((trade) => structuredClone(trade)); }
}

export class JsonlExperienceRepository implements TradeRepository<ExperienceRecord> {
  constructor(private readonly filePath: string) { ensureParent(filePath); }
  append(record: ExperienceRecord) { if (this.all().some((existing) => existing.predictionId === record.predictionId)) throw new Error(`Duplicate prediction id: ${record.predictionId}`); appendFileSync(this.filePath, `${JSON.stringify(record)}\n`, "utf8"); }
  all() { return readJsonLines<ExperienceRecord>(this.filePath).map((record) => structuredClone(record)); }
}

export class JsonPredictionQueueRepository implements TradeRepository<PredictionRecord> {
  constructor(private readonly filePath: string) { ensureParent(filePath); }
  append(record: PredictionRecord) { if (this.all().some((existing) => existing.predictionId === record.predictionId)) throw new Error(`Duplicate prediction id: ${record.predictionId}`); appendFileSync(this.filePath, `${JSON.stringify(record)}\n`, "utf8"); }
  all() { return readJsonLines<PredictionRecord>(this.filePath).map((record) => structuredClone(record)); }
}

export class JsonModelArtifactRepository implements TradeRepository<ModelArtifact> {
  constructor(private readonly filePath: string) { ensureParent(filePath); }
  append(artifact: ModelArtifact) { if (this.all().some((existing) => existing.artifactId === artifact.artifactId)) throw new Error(`Duplicate artifact id: ${artifact.artifactId}`); appendFileSync(this.filePath, `${JSON.stringify(artifact)}\n`, "utf8"); }
  all() { return readJsonLines<ModelArtifact>(this.filePath).map((artifact) => structuredClone(artifact)); }
}
