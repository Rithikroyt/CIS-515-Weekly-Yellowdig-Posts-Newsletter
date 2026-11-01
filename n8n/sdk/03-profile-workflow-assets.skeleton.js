import { workflow, node, trigger, sticky } from '@n8n/workflow-sdk';

const calledByWorkflow = trigger({
  type: 'n8n-nodes-base.executeWorkflowTrigger',
  version: 1.3,
  config: { name: 'When Called by Another Workflow', parameters: { inputSource: 'passthrough' }, position: [0, 0] },
  output: [{ week: 4, knownPostRefs: [], assets: [] }]
});

const manualTest = trigger({
  type: 'n8n-nodes-base.manualTrigger',
  version: 1,
  config: { name: 'Manual Test (synthetic)', position: [0, 220] },
  output: [{}]
});

const syntheticBatch = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: { name: 'Synthetic Asset Batch', parameters: { mode: 'runOnceForAllItems', language: 'javaScript', jsCode: "// wf03.syntheticBatch: replaced with n8n/src/generated/wf03/syntheticBatch.js after creation" }, position: [220, 220] },
  output: [{ week: 4, knownPostRefs: [], assets: [] }]
});

const checkFiles = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: { name: 'Check Files', parameters: { mode: 'runOnceForAllItems', language: 'javaScript', jsCode: "// wf03.checkFiles: replaced with n8n/src/generated/wf03/checkFiles.js after creation" }, position: [440, 0] },
  output: [{ week: 4, entries: [], workflows: [] }]
});

const sanitize = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: { name: 'Parse and Sanitize', parameters: { mode: 'runOnceForAllItems', language: 'javaScript', jsCode: "// wf03.sanitize: replaced with n8n/src/generated/wf03/sanitize.js after creation" }, position: [660, 0] },
  output: [{ week: 4, entries: [], sanitized: [] }]
});

const profile = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: { name: 'Profile Workflows', parameters: { mode: 'runOnceForAllItems', language: 'javaScript', jsCode: "// wf03.profile: replaced with n8n/src/generated/wf03/profile.js after creation" }, position: [880, 0] },
  output: [{ week: 4, entries: [], profiles: [] }]
});

const assemble = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: { name: 'Assemble and Validate Manifest', parameters: { mode: 'runOnceForAllItems', language: 'javaScript', jsCode: "// wf03.assembleAndValidate: replaced with n8n/src/generated/wf03/assembleAndValidate.js after creation" }, position: [1100, 0] },
  output: [{ manifest: { schemaVersion: '2.0', week: 4, assets: [] }, profiles: [] }]
});

const overview = sticky(
  '## 03 · Profile Workflow Assets\n' +
  'Input: one batch of manually supplied assets (`week`, `knownPostRefs`, `assets`). Output: an **asset manifest** and **workflow profiles** (schemas/asset-manifest.schema.json, schemas/workflow-profile.schema.json).\n\n' +
  'Uploaded workflow JSON is **data only**: parsed statically, never executed, imported, evaluated or followed. No AI, no HTTP, no credentials.\n' +
  'Credentials, pinned/static/execution data and webhook ids are removed; secrets and emails are redacted and only counted.\n\n' +
  'The manual trigger runs a **synthetic** batch only.',
  [calledByWorkflow, manualTest, syntheticBatch],
  { color: 4 }
);

export default workflow('wf03-profile-workflow-assets', '03 - Profile Workflow Assets')
  .add(calledByWorkflow)
  .to(checkFiles)
  .add(manualTest)
  .to(syntheticBatch)
  .to(checkFiles)
  .add(checkFiles)
  .to(sanitize)
  .to(profile)
  .to(assemble)
  .add(overview)
  .group('Profile assets', [checkFiles, sanitize, profile, assemble], { description: 'File checks, static parse and sanitize, deterministic profile, schema check. No AI, no HTTP.' });
