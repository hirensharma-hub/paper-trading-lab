import { ExperimentRunner } from "./experiment";
const args = process.argv.slice(2); const configPath = args[args.indexOf("--config") + 1]; const dataPath = args[args.indexOf("--data") + 1];
if (args.includes("--synthetic") || !dataPath || !configPath) { console.log(JSON.stringify(new ExperimentRunner().syntheticSmoke(), null, 2)); } else { console.error("Dataset/config loading is intentionally explicit and offline; provide a validated manifest to ExperimentRunner."); process.exitCode = 2; }
