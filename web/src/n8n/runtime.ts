// The contract between an n8n Code node and a bundled entry in ./nodes.
// The generated wrapper (scripts/build-n8n.ts) builds this context from $input, $() and $runIndex.
// Entries stay thin: parse the context, call one shared stage from src/lib, return plain JSON items.

export type NodeContext = {
  /** JSON of every input item. */
  items: Array<Record<string, unknown>>;
  /** First output item of another node, or null when that node has not run in this execution. */
  node: (name: string) => Record<string, unknown> | null;
  /** How many times this node has already run in this execution (0 on the first run). */
  runIndex: number;
  /** Current time as ISO 8601. The only clock an entry may read. */
  now: string;
};

export type NodeEntry = (ctx: NodeContext) => Array<Record<string, unknown>>;

/** Node names that entries read through ctx.node(). Renaming a node in n8n means changing it here. */
export const NODE = {
  calledByWorkflow: "When Called by Another Workflow",
  devRunConfig: "Dev Run Config",
  validateConfig: "Validate Run Configuration",
  resolveMode: "Resolve Source Mode",
  checkCapability: "Check Capability",
  classifyFailure: "Classify Fetch Failure",
} as const;

/** Marker the fixture provider puts on each page so later nodes know the source without guessing. */
export const FIXTURE_MARK = "x-observatory-source";
