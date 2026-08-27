import { loadForwardConfig } from "./forward-config";
import { ForwardPaperRuntime } from "./forward-runtime";

const command = process.argv[2] ?? "status";
const runtime = new ForwardPaperRuntime(loadForwardConfig());
try {
  if (command === "status") console.log(JSON.stringify(runtime.status(), null, 2));
  else if (command === "db-verify") console.log(JSON.stringify(runtime.verifyDatabase(), null, 2));
  else if (command === "model-verify") console.log(JSON.stringify(runtime.verifyModel(), null, 2));
  else throw new Error("Usage: forward:status | forward:db:verify | forward:model:verify");
} finally { runtime.close(); }
