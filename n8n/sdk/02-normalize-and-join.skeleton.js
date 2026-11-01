import { workflow, node, trigger, sticky } from '@n8n/workflow-sdk';

const calledByWorkflow = trigger({
  type: 'n8n-nodes-base.executeWorkflowTrigger',
  version: 1.3,
  config: { name: 'When Called by Another Workflow', parameters: { inputSource: 'passthrough' }, position: [0, 0] },
  output: [{ schemaVersion: '1.0', sourceModeUsed: 'fixture', liveSourceVerified: false, provider: 'synthetic-fixture', events: [] }]
});

const manualTest = trigger({
  type: 'n8n-nodes-base.manualTrigger',
  version: 1,
  config: { name: 'Manual Test (fixture)', position: [0, 220] },
  output: [{}]
});

const fixtureRunConfig = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: { name: 'Fixture Run Config', parameters: { mode: 'runOnceForAllItems', language: 'javaScript', jsCode: "// wf02.fixtureRunConfig: replaced with n8n/src/generated/wf02/fixtureRunConfig.js after creation" }, position: [220, 220] },
  output: [{ sourceMode: 'fixture', week: 2, startDate: '2026-10-23', endDate: '2026-10-28' }]
});

const runFetch = node({
  type: 'n8n-nodes-base.executeWorkflow',
  version: 1.2,
  config: {
    name: 'Run 01 Fetch Events',
    parameters: {
      source: 'database',
      workflowId: { __rl: true, mode: 'id', value: 'dHZoXDny6WU1v62y' },
      mode: 'once',
      options: { waitForSubWorkflow: true }
    },
    position: [440, 220]
  },
  output: [{ schemaVersion: '1.0', sourceModeUsed: 'fixture', liveSourceVerified: false, provider: 'synthetic-fixture', events: [] }]
});

const validateSource = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: { name: 'Validate Source Metadata', parameters: { mode: 'runOnceForAllItems', language: 'javaScript', jsCode: "// wf02.validateSourceMetadata: replaced with n8n/src/generated/wf02/validateSourceMetadata.js after creation" }, position: [660, 0] },
  output: [{ schemaVersion: '1.0', sourceModeUsed: 'fixture', events: [] }]
});

const classifyEvents = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: { name: 'Classify Events', parameters: { mode: 'runOnceForAllItems', language: 'javaScript', jsCode: "// wf02.classifyEvents: replaced with n8n/src/generated/wf02/classifyEvents.js after creation" }, position: [880, 0] },
  output: [{ post: [], comment: [], reaction: [], view: [], unknownEventTypes: 0 }]
});

const joinToPosts = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: { name: 'Join Comments, Reactions and Views', parameters: { mode: 'runOnceForAllItems', language: 'javaScript', jsCode: "// wf02.joinToPosts: replaced with n8n/src/generated/wf02/joinToPosts.js after creation" }, position: [1100, 0] },
  output: [{ posts: [], orphans: [], counters: { duplicatePostEvents: 0 } }]
});

const computeMetrics = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: { name: 'Compute Deterministic Metrics', parameters: { mode: 'runOnceForAllItems', language: 'javaScript', jsCode: "// wf02.computeMetrics: replaced with n8n/src/generated/wf02/computeMetrics.js after creation" }, position: [1320, 0] },
  output: [{ schemaVersion: '1.0', posts: [], metrics: { posts: 0 }, orphans: [], diagnostics: { missingParents: 0 } }]
});

const validateDataset = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: { name: 'Validate Against Contract', parameters: { mode: 'runOnceForAllItems', language: 'javaScript', jsCode: "// wf02.validateDataset: replaced with n8n/src/generated/wf02/validateDataset.js after creation" }, position: [1540, 0] },
  output: [{ schemaVersion: '1.0', posts: [], metrics: { posts: 0 } }]
});

const overview = sticky(
  '## 02 · Yellowdig Normalize and Join\n' +
  'Input: the source bundle from **01**. Output: one **week dataset** (schemas/week-dataset.schema.json).\n\n' +
  'No AI. Every number comes from `web/src/lib/metrics.ts` and `web/src/lib/source/normalize.ts`, bundled into these Code nodes.\n' +
  'Missing parents and unknown event types are reported in `diagnostics` and `orphans`, never guessed.\n\n' +
  'The manual trigger runs 01 in **fixture** mode for testing.',
  [calledByWorkflow, manualTest, fixtureRunConfig, runFetch],
  { color: 4 }
);

export default workflow('wf02-normalize-and-join', '02 - Yellowdig Normalize and Join')
  .add(calledByWorkflow)
  .to(validateSource)
  .add(manualTest)
  .to(fixtureRunConfig)
  .to(runFetch)
  .to(validateSource)
  .add(validateSource)
  .to(classifyEvents)
  .to(joinToPosts)
  .to(computeMetrics)
  .to(validateDataset)
  .add(overview)
  .group('Normalize and join', [validateSource, classifyEvents, joinToPosts, computeMetrics, validateDataset], { description: 'Contract check, classify, join to posts, code-counted metrics, schema check. No AI nodes.' });
