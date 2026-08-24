export type ExecutionMethod = "NEXT_BAR_OPEN" | "NEXT_QUOTE";
export interface ExecutionPolicy { version: string; entryMethod: ExecutionMethod; exitMethod: ExecutionMethod; }
