import { workflow, node, trigger, sticky, newCredential, switchCase, expr } from '@n8n/workflow-sdk';

const calledByWorkflow = trigger({
  type: 'n8n-nodes-base.executeWorkflowTrigger',
  version: 1.3,
  config: { name: 'When Called by Another Workflow', parameters: { inputSource: 'passthrough' }, position: [0, 0] },
  output: [{ sourceMode: 'auto', week: 2, startDate: '2026-10-23', endDate: '2026-10-28', timezone: 'America/Phoenix', network: 'carey-school-of-business', communityId: '6acd2896-76e7-400f-9a00-cfd657470859', topic: 'WEEK 2 - WEEKLY WORKFLOW SHOW-AND-TELL ON YELLOWDIG', yellowdigCredentialConfigured: false }]
});

const manualTest = trigger({
  type: 'n8n-nodes-base.manualTrigger',
  version: 1,
  config: { name: 'Manual Test (fixture)', position: [0, 220] },
  output: [{}]
});

const devRunConfig = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: { name: 'Dev Run Config', parameters: { mode: 'runOnceForAllItems', language: 'javaScript', jsCode: "// wf01.devRunConfig: replaced with n8n/src/generated/wf01/devRunConfig.js after creation" }, position: [220, 220] },
  output: [{ sourceMode: 'fixture', week: 2, startDate: '2026-10-23', endDate: '2026-10-28', timezone: 'America/Phoenix', network: 'carey-school-of-business', communityId: '6acd2896-76e7-400f-9a00-cfd657470859', topic: 'WEEK 2 - WEEKLY WORKFLOW SHOW-AND-TELL ON YELLOWDIG' }]
});

const validateConfig = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: { name: 'Validate Run Configuration', parameters: { mode: 'runOnceForAllItems', language: 'javaScript', jsCode: "// wf01.validateConfig: replaced with n8n/src/generated/wf01/validateConfig.js after creation" }, position: [440, 100] },
  output: [{ config: { sourceMode: 'fixture', week: 2, pageSize: 250, maxPages: 400, maxRetries: 3 } }]
});

const resolveMode = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: { name: 'Resolve Source Mode', parameters: { mode: 'runOnceForAllItems', language: 'javaScript', jsCode: "// wf01.resolveMode: replaced with n8n/src/generated/wf01/resolveMode.js after creation" }, position: [660, 100] },
  output: [{ route: 'fixture', fallbackReason: 'FIXTURE_FORCED', sourceModeRequested: 'fixture', request: { url: 'https://data.yellowdig.app/network/n/community/c/events', probeLimit: 10, pageSize: 250, maxPages: 400 } }]
});

const routeBySource = switchCase({
  version: 3.2,
  config: {
    name: 'Route by Source',
    parameters: {
      rules: {
        values: [
          { renameOutput: true, outputKey: 'fixture', conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'strict' }, conditions: [{ leftValue: expr('{{ $json.route }}'), operator: { type: 'string', operation: 'equals' }, rightValue: 'fixture' }], combinator: 'and' } },
          { renameOutput: true, outputKey: 'yellowdig', conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'strict' }, conditions: [{ leftValue: expr('{{ $json.route }}'), operator: { type: 'string', operation: 'equals' }, rightValue: 'yellowdig' }], combinator: 'and' } }
        ]
      }
    },
    position: [880, 100]
  },
  output: [{ route: 'fixture' }]
});

const loadFixture = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: { name: 'Load Synthetic Fixture', parameters: { mode: 'runOnceForAllItems', language: 'javaScript', jsCode: "// wf01.loadFixture: replaced with n8n/src/generated/wf01/loadFixture.js after creation" }, position: [1320, -100] },
  output: [{ data: [], limit: 250, 'record-count': 0, cursor: null, 'at-end': true }]
});

const capabilityProbe = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.2,
  config: {
    name: 'Capability Probe',
    executeOnce: true,
    onError: 'continueErrorOutput',
    parameters: {
      method: 'GET',
      url: expr("{{ $('Resolve Source Mode').first().json.request.url }}"),
      authentication: 'genericCredentialType',
      genericAuthType: 'httpHeaderAuth',
      sendQuery: true,
      specifyQuery: 'keypair',
      queryParameters: { parameters: [{ name: 'limit', value: expr("{{ $('Resolve Source Mode').first().json.request.probeLimit }}") }] },
      options: { timeout: 30000, response: { response: { responseFormat: 'json' } } }
    },
    credentials: { httpHeaderAuth: newCredential('Yellowdig CIS 515') },
    position: [1100, 220]
  },
  output: [{ data: [], limit: 10, 'record-count': 0, cursor: 'c1', 'at-end': false }]
});

const checkCapability = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: { name: 'Check Capability', parameters: { mode: 'runOnceForAllItems', language: 'javaScript', jsCode: "// wf01.checkCapability: replaced with n8n/src/generated/wf01/checkCapability.js after creation" }, position: [1320, 140] },
  output: [{ capability: { sampleSize: 10, missingRequired: [] } }]
});

const fetchEventPages = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.2,
  config: {
    name: 'Fetch Event Pages',
    executeOnce: true,
    onError: 'continueErrorOutput',
    parameters: {
      method: 'GET',
      url: expr("{{ $('Resolve Source Mode').first().json.request.url }}"),
      authentication: 'genericCredentialType',
      genericAuthType: 'httpHeaderAuth',
      sendQuery: true,
      specifyQuery: 'keypair',
      queryParameters: { parameters: [{ name: 'limit', value: expr("{{ $('Resolve Source Mode').first().json.request.pageSize }}") }] },
      options: {
        timeout: 30000,
        response: { response: { responseFormat: 'json' } },
        pagination: {
          pagination: {
            paginationMode: 'updateAParameterInEachRequest',
            parameters: { parameters: [{ type: 'qs', name: 'cursor', value: expr('{{ $response.body.cursor }}') }] },
            paginationCompleteWhen: 'other',
            completeExpression: expr("{{ $response.body['at-end'] === true || !$response.body.cursor }}"),
            limitPagesFetched: true,
            maxRequests: expr("{{ $('Resolve Source Mode').first().json.request.maxPages }}"),
            requestInterval: 250
          }
        }
      }
    },
    credentials: { httpHeaderAuth: newCredential('Yellowdig CIS 515') },
    position: [1540, 140]
  },
  output: [{ data: [], limit: 250, 'record-count': 0, cursor: null, 'at-end': true }]
});

const classifyFailure = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: { name: 'Classify Fetch Failure', parameters: { mode: 'runOnceForAllItems', language: 'javaScript', jsCode: "// wf01.classifyFetchFailure: replaced with n8n/src/generated/wf01/classifyFetchFailure.js after creation" }, position: [1320, 400] },
  output: [{ action: 'retry', code: 'YELLOWDIG_RATE_LIMITED', attempt: 1, waitSeconds: 1 }]
});

const retryOrFallback = switchCase({
  version: 3.2,
  config: {
    name: 'Retry or Fall Back',
    parameters: {
      rules: {
        values: [
          { renameOutput: true, outputKey: 'retry', conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'strict' }, conditions: [{ leftValue: expr('{{ $json.action }}'), operator: { type: 'string', operation: 'equals' }, rightValue: 'retry' }], combinator: 'and' } },
          { renameOutput: true, outputKey: 'fallback', conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'strict' }, conditions: [{ leftValue: expr('{{ $json.action }}'), operator: { type: 'string', operation: 'equals' }, rightValue: 'fallback' }], combinator: 'and' } }
        ]
      }
    },
    position: [1540, 400]
  },
  output: [{ action: 'retry' }]
});

const backoffWait = node({
  type: 'n8n-nodes-base.wait',
  version: 1.1,
  config: { name: 'Backoff Wait', parameters: { resume: 'timeInterval', amount: expr('{{ $json.waitSeconds }}'), unit: 'seconds' }, position: [1760, 400] },
  output: [{ action: 'retry', waitSeconds: 1 }]
});

const collectAndMinimize = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: { name: 'Collect Pages and Minimize', parameters: { mode: 'runOnceForAllItems', language: 'javaScript', jsCode: "// wf01.collectAndMinimize: replaced with n8n/src/generated/wf01/collectAndMinimize.js after creation" }, position: [1980, 0] },
  output: [{ events: [], diagnostics: { pagesFetched: 1 } }]
});

const dedupe = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: { name: 'Deduplicate Events', parameters: { mode: 'runOnceForAllItems', language: 'javaScript', jsCode: "// wf01.dedupe: replaced with n8n/src/generated/wf01/dedupe.js after creation" }, position: [2200, 0] },
  output: [{ events: [], diagnostics: { duplicateEventsRemoved: 0 } }]
});

const filterDateTopic = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: { name: 'Date and Topic Filter', parameters: { mode: 'runOnceForAllItems', language: 'javaScript', jsCode: "// wf01.filterDateTopic: replaced with n8n/src/generated/wf01/filterDateTopic.js after creation" }, position: [2420, 0] },
  output: [{ events: [], diagnostics: { posts: 0 } }]
});

const assembleAndValidate = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: { name: 'Validate Result Shape', parameters: { mode: 'runOnceForAllItems', language: 'javaScript', jsCode: "// wf01.assembleAndValidate: replaced with n8n/src/generated/wf01/assembleAndValidate.js after creation" }, position: [2640, 0] },
  output: [{ schemaVersion: '1.0', sourceModeUsed: 'fixture', liveSourceVerified: false, events: [] }]
});

const overview = sticky(
  '## 01 · Yellowdig Fetch Events\n' +
  'Returns one **source bundle** (schemas/source-bundle.schema.json).\n\n' +
  '- **fixture**: synthetic Week 2, no credential.\n' +
  '- **yellowdig**: official API. Attach the n8n credential **Yellowdig CIS 515** (Header Auth, header name `apikey`) to Capability Probe and Fetch Event Pages. Never put the key in a node parameter. Fails on 401/403.\n' +
  '- **auto**: Yellowdig when `yellowdigCredentialConfigured` is true, otherwise fixture with `fallbackReason`.\n\n' +
  'Code nodes are generated from `web/src/n8n/nodes/wf01.ts`. Do not edit them here.\n' +
  'Live Yellowdig access is **not verified** yet.',
  [calledByWorkflow, manualTest, devRunConfig],
  { color: 4 }
);

const privacyNote = sticky(
  '### Privacy boundary\n' +
  'Raw events exist only in the HTTP nodes and **Collect Pages and Minimize**. ' +
  'After that: pseudonymous ids, display names and post text only. ' +
  'No SIS ids, LTI fields, emails or raw user ids.',
  [collectAndMinimize, dedupe],
  { color: 3 }
);

export default workflow('wf01-fetch-yellowdig-events', '01 - Yellowdig Fetch Events')
  .add(calledByWorkflow)
  .to(validateConfig)
  .add(manualTest)
  .to(devRunConfig)
  .to(validateConfig)
  .add(validateConfig)
  .to(resolveMode)
  .to(routeBySource.onCase(0, loadFixture).onCase(1, capabilityProbe))
  .add(capabilityProbe.onError(classifyFailure))
  .to(checkCapability)
  .to(fetchEventPages)
  .add(fetchEventPages.onError(classifyFailure))
  .to(collectAndMinimize)
  .add(classifyFailure)
  .to(retryOrFallback.onCase(0, backoffWait).onCase(1, loadFixture))
  .add(backoffWait)
  .to(capabilityProbe)
  .add(loadFixture)
  .to(collectAndMinimize)
  .add(collectAndMinimize)
  .to(dedupe)
  .to(filterDateTopic)
  .to(assembleAndValidate)
  .add(overview)
  .add(privacyNote)
  .group('Run configuration', [validateConfig, resolveMode], { description: 'Validates the untrusted run input and picks fixture or Yellowdig with an explicit reason.' })
  .group('Post-fetch pipeline', [collectAndMinimize, dedupe, filterDateTopic, assembleAndValidate], { description: 'Privacy minimization, dedupe by event id, Phoenix date and topic filter, schema check.' });
