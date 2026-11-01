import { workflow, node, trigger, sticky, ifElse, switchCase, expr, newCredential } from '@n8n/workflow-sdk';

const webhook = trigger({
  type: 'n8n-nodes-base.webhook',
  version: 2.2,
  config: {
    name: 'Newsletter Webhook',
    position: [0, 300],
    parameters: { httpMethod: 'POST', path: 'cis515-newsletter', authentication: 'headerAuth', responseMode: 'responseNode', options: {} },
    credentials: { httpHeaderAuth: newCredential('CIS 515 Newsletter Webhook') }
  },
  output: [{ body: { action: 'generate', week: 2, runId: 'r_000000000000000000000000' } }]
});

const manualTest = trigger({
  type: 'n8n-nodes-base.manualTrigger',
  version: 1,
  config: { name: 'Manual Test (synthetic)', position: [0, 520] },
  output: [{}]
});

const syntheticRequest = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: { name: 'Synthetic Request (test only)', parameters: { mode: 'runOnceForAllItems', language: 'javaScript', jsCode: "__CODE:syntheticRequest__" }, position: [200, 520] },
  output: [{}]
});

const routeRequest = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: { name: 'Route Request', parameters: { mode: 'runOnceForAllItems', language: 'javaScript', jsCode: "__CODE:routeRequest__" }, position: [400, 300] },
  output: [{}]
});

const byAction = switchCase({
  version: 3.2,
  config: {
    name: 'By Action',
    position: [620, 300],
    parameters: {
      rules: {
        values: [
          { renameOutput: true, outputKey: 'generate', conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'strict' }, conditions: [{ leftValue: expr('{{ $json.action }}'), operator: { type: 'string', operation: 'equals' }, rightValue: 'generate' }], combinator: 'and' } },
          { renameOutput: true, outputKey: 'lookup', conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'strict' }, conditions: [{ leftValue: expr("{{ ['status', 'artifact'].includes($json.action) }}"), operator: { type: 'boolean', operation: 'true', singleValue: true } }], combinator: 'and' } },
          { renameOutput: true, outputKey: 'reject', conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'strict' }, conditions: [{ leftValue: expr('{{ $json.action }}'), operator: { type: 'string', operation: 'equals' }, rightValue: 'reject' }], combinator: 'and' } }
        ]
      }
    }
  },
  output: [{ action: 'generate' }]
});

const findRun = node({
  type: 'n8n-nodes-base.dataTable',
  version: 1.1,
  config: {
    name: 'Find Run', position: [860, 300], alwaysOutputData: true,
    parameters: { resource: 'row', operation: 'get', dataTableId: { __rl: true, mode: 'id', value: 'uWls7HHm5Ek7u1SQ', cachedResultName: 'newsletter_runs' }, matchType: 'allConditions', filters: { conditions: [{ keyName: 'run_id', condition: 'eq', keyValue: expr("{{ $('Route Request').first().json.runId }}") }] }, returnAll: false, limit: 1 }
  },
  output: [{ run_id: 'r_000000000000000000000000', week: 2, status: 'queued' }]
});

const statusReply = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: { name: 'Status Reply', parameters: { mode: 'runOnceForAllItems', language: 'javaScript', jsCode: "__CODE:statusReply__" }, position: [1080, 300] },
  output: [{}]
});

const respondStatus = node({
  type: 'n8n-nodes-base.respondToWebhook',
  version: 1.5,
  config: { name: 'Respond Status', position: [1300, 300], parameters: { respondWith: 'firstIncomingItem', options: {} } }
});

const respondRejected = node({
  type: 'n8n-nodes-base.respondToWebhook',
  version: 1.5,
  config: { name: 'Respond Rejected', position: [860, 520], parameters: { respondWith: 'firstIncomingItem', options: { responseCode: 400 } } }
});

const findWeekRuns = node({
  type: 'n8n-nodes-base.dataTable',
  version: 1.1,
  config: {
    name: 'Find Week Runs', position: [860, 60], alwaysOutputData: true,
    parameters: {
      resource: 'row', operation: 'get', dataTableId: { __rl: true, mode: 'id', value: 'uWls7HHm5Ek7u1SQ', cachedResultName: 'newsletter_runs' }, matchType: 'allConditions',
      filters: { conditions: [{ keyName: 'week', condition: 'eq', keyValue: expr("{{ $('Route Request').first().json.week }}") }] },
      returnAll: false, limit: 20, orderBy: true, orderByColumn: 'createdAt', orderByDirection: 'DESC'
    }
  },
  output: [{ run_id: 'r_000000000000000000000000', week: 2, status: 'ready' }]
});

const decideStart = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: { name: 'Decide Run Start', parameters: { mode: 'runOnceForAllItems', language: 'javaScript', jsCode: "__CODE:decideRunStart__" }, position: [1080, 60] },
  output: [{}]
});

const reuseRun = ifElse({
  version: 2.2,
  config: {
    name: 'Run Already Active?',
    position: [1300, 60],
    parameters: {
      conditions: {
        options: { caseSensitive: true, leftValue: '', typeValidation: 'strict' },
        conditions: [{ leftValue: expr('{{ $json.reuse }}'), operator: { type: 'boolean', operation: 'true', singleValue: true } }],
        combinator: 'and'
      }
    }
  }
});

const respondActive = node({
  type: 'n8n-nodes-base.respondToWebhook',
  version: 1.5,
  config: { name: 'Respond Active Run', position: [1520, -60], parameters: { respondWith: 'firstIncomingItem', options: {} } }
});

const insertRun = node({
  type: 'n8n-nodes-base.dataTable',
  version: 1.1,
  config: {
    name: 'Insert Run', position: [1520, 120],
    parameters: {
      resource: 'row', operation: 'insert', dataTableId: { __rl: true, mode: 'id', value: 'uWls7HHm5Ek7u1SQ', cachedResultName: 'newsletter_runs' },
      columns: {
        mappingMode: 'defineBelow',
        value: { run_id: expr('{{ $json.runId }}'), week: expr('{{ $json.week }}'), status: 'queued', error_code: '', omitted_claims: 0, html: '' },
        schema: [{ id: 'run_id', displayName: 'run_id', required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: true }, { id: 'week', displayName: 'week', required: false, defaultMatch: false, display: true, type: 'number', canBeUsedToMatch: true }, { id: 'status', displayName: 'status', required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: true }, { id: 'error_code', displayName: 'error_code', required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: true }, { id: 'omitted_claims', displayName: 'omitted_claims', required: false, defaultMatch: false, display: true, type: 'number', canBeUsedToMatch: true }, { id: 'html', displayName: 'html', required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: true }]
      }
    }
  },
  output: [{ id: 1 }]
});

const queuedReply = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: { name: 'Queued Reply', parameters: { mode: 'runOnceForAllItems', language: 'javaScript', jsCode: "__CODE:queuedReply__" }, position: [1740, 120] },
  output: [{}]
});

const respondStarted = node({
  type: 'n8n-nodes-base.respondToWebhook',
  version: 1.5,
  config: { name: 'Respond Started', position: [1960, 120], parameters: { respondWith: 'firstIncomingItem', options: {} } }
});

const stageFetching = node({
  type: 'n8n-nodes-base.dataTable',
  version: 1.1,
  config: {
    name: 'Stage: Fetching Yellowdig', position: [2180, 120], executeOnce: true,
    parameters: {
      resource: 'row', operation: 'update', dataTableId: { __rl: true, mode: 'id', value: 'uWls7HHm5Ek7u1SQ', cachedResultName: 'newsletter_runs' }, matchType: 'allConditions', filters: { conditions: [{ keyName: 'run_id', condition: 'eq', keyValue: expr("{{ $('Route Request').first().json.runId }}") }] },
      columns: { mappingMode: 'defineBelow', value: { status: 'fetching_yellowdig' }, schema: [{ id: 'status', displayName: 'status', required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: true }] }
    }
  },
  output: [{ id: 1 }]
});

const sourceConfig = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: { name: 'Source Config', parameters: { mode: 'runOnceForAllItems', language: 'javaScript', jsCode: "__CODE:sourceConfig__" }, position: [2400, 120], onError: 'continueErrorOutput' },
  output: [{}]
});

const runFetch = node({
  type: 'n8n-nodes-base.executeWorkflow',
  version: 1.2,
  config: {
    name: 'Run 01 Fetch Events', position: [2620, 120], onError: 'continueErrorOutput',
    parameters: { source: 'database', workflowId: { __rl: true, mode: 'id', value: '__WORKFLOW_ID:wf01__' }, mode: 'once', options: { waitForSubWorkflow: true } }
  },
  output: [{}]
});

const runNormalize = node({
  type: 'n8n-nodes-base.executeWorkflow',
  version: 1.2,
  config: {
    name: 'Run 02 Normalize and Join', position: [2840, 120], onError: 'continueErrorOutput',
    parameters: { source: 'database', workflowId: { __rl: true, mode: 'id', value: '__WORKFLOW_ID:wf02__' }, mode: 'once', options: { waitForSubWorkflow: true } }
  },
  output: [{}]
});

const stageGenerating = node({
  type: 'n8n-nodes-base.dataTable',
  version: 1.1,
  config: {
    name: 'Stage: Generating Editorial', position: [3060, 120], executeOnce: true,
    parameters: {
      resource: 'row', operation: 'update', dataTableId: { __rl: true, mode: 'id', value: 'uWls7HHm5Ek7u1SQ', cachedResultName: 'newsletter_runs' }, matchType: 'allConditions', filters: { conditions: [{ keyName: 'run_id', condition: 'eq', keyValue: expr("{{ $('Route Request').first().json.runId }}") }] },
      columns: { mappingMode: 'defineBelow', value: { status: 'generating_editorial' }, schema: [{ id: 'status', displayName: 'status', required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: true }] }
    }
  },
  output: [{ id: 1 }]
});

const editorialRequest = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: { name: 'Editorial Request', parameters: { mode: 'runOnceForAllItems', language: 'javaScript', jsCode: "__CODE:editorialRequest__" }, position: [3280, 120], onError: 'continueErrorOutput' },
  output: [{}]
});

const runEditorial = node({
  type: 'n8n-nodes-base.executeWorkflow',
  version: 1.2,
  config: {
    name: 'Run 04 Editorial Intelligence', position: [3500, 120], onError: 'continueErrorOutput',
    parameters: { source: 'database', workflowId: { __rl: true, mode: 'id', value: '__WORKFLOW_ID:wf04__' }, mode: 'once', options: { waitForSubWorkflow: true } }
  },
  output: [{}]
});

const stageRendering = node({
  type: 'n8n-nodes-base.dataTable',
  version: 1.1,
  config: {
    name: 'Stage: Rendering', position: [3720, 120], executeOnce: true,
    parameters: {
      resource: 'row', operation: 'update', dataTableId: { __rl: true, mode: 'id', value: 'uWls7HHm5Ek7u1SQ', cachedResultName: 'newsletter_runs' }, matchType: 'allConditions', filters: { conditions: [{ keyName: 'run_id', condition: 'eq', keyValue: expr("{{ $('Route Request').first().json.runId }}") }] },
      columns: { mappingMode: 'defineBelow', value: { status: 'rendering' }, schema: [{ id: 'status', displayName: 'status', required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: true }] }
    }
  },
  output: [{ id: 1 }]
});

const renderArtifact = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: { name: 'Render Artifact', parameters: { mode: 'runOnceForAllItems', language: 'javaScript', jsCode: "__CODE:renderArtifact__" }, position: [3940, 120], onError: 'continueErrorOutput' },
  output: [{}]
});

const saveResult = node({
  type: 'n8n-nodes-base.dataTable',
  version: 1.1,
  config: {
    name: 'Save Result', position: [4160, 120],
    parameters: {
      resource: 'row', operation: 'update', dataTableId: { __rl: true, mode: 'id', value: 'uWls7HHm5Ek7u1SQ', cachedResultName: 'newsletter_runs' }, matchType: 'allConditions', filters: { conditions: [{ keyName: 'run_id', condition: 'eq', keyValue: expr("{{ $('Route Request').first().json.runId }}") }] },
      columns: {
        mappingMode: 'defineBelow',
        value: { status: expr('{{ $json.status }}'), html: expr('{{ $json.html }}'), omitted_claims: expr('{{ $json.omittedClaims }}'), error_code: '' },
        schema: [{ id: 'status', displayName: 'status', required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: true }, { id: 'html', displayName: 'html', required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: true }, { id: 'omitted_claims', displayName: 'omitted_claims', required: false, defaultMatch: false, display: true, type: 'number', canBeUsedToMatch: true }, { id: 'error_code', displayName: 'error_code', required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: true }]
      }
    }
  },
  output: [{ id: 1 }]
});

const failRun = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: { name: 'Fail Run', parameters: { mode: 'runOnceForAllItems', language: 'javaScript', jsCode: "__CODE:failRun__" }, position: [3280, 420] },
  output: [{}]
});

const saveFailure = node({
  type: 'n8n-nodes-base.dataTable',
  version: 1.1,
  config: {
    name: 'Save Failure', position: [3500, 420], executeOnce: true,
    parameters: {
      resource: 'row', operation: 'update', dataTableId: { __rl: true, mode: 'id', value: 'uWls7HHm5Ek7u1SQ', cachedResultName: 'newsletter_runs' }, matchType: 'allConditions', filters: { conditions: [{ keyName: 'run_id', condition: 'eq', keyValue: expr("{{ $('Route Request').first().json.runId }}") }] },
      columns: { mappingMode: 'defineBelow', value: { status: 'failed', error_code: expr('{{ $json.errorCode }}') }, schema: [{ id: 'status', displayName: 'status', required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: true }, { id: 'error_code', displayName: 'error_code', required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: true }] }
    }
  },
  output: [{ id: 1 }]
});

const overview = sticky(
  '## 05 · Generate Newsletter\n' +
  'One authenticated webhook (Header Auth credential) with three actions: generate {week, runId}, status {runId}, artifact {runId}. Called only by the Next.js server.\n\n' +
  'generate validates the week (1-5, topic configured in web/src/lib/weeks.ts), reuses an in-progress run for that week, inserts a newsletter_runs row and responds at once. It then runs 01 Fetch (Yellowdig only, no fixture fallback) -> 02 Normalize -> editorial input (no workflow files, so no profile claims) -> 04 Editorial Intelligence (Gemini, evidence review, at most 2 revisions) -> render (web/src/lib/render/newsletter.ts) -> store the HTML. Any failure stores failed with a safe code.\n\n' +
  'Statuses: queued, fetching_yellowdig, generating_editorial, rendering, ready, ready_with_omissions, failed. The manual trigger runs the synthetic fixture with the mock model only.',
  [webhook, manualTest, routeRequest],
  { color: 4 }
);

export default workflow('wf05-generate-newsletter', '05 - Generate Newsletter')
  .add(webhook)
  .to(routeRequest)
  .add(manualTest)
  .to(syntheticRequest)
  .to(routeRequest)
  .add(routeRequest)
  .to(byAction
    .onCase(0, findWeekRuns.to(decideStart).to(reuseRun.onTrue(respondActive).onFalse(insertRun.to(queuedReply).to(respondStarted).to(stageFetching).to(sourceConfig))))
    .onCase(1, findRun.to(statusReply).to(respondStatus))
    .onCase(2, respondRejected))
  .add(sourceConfig.onError(failRun))
  .to(runFetch)
  .add(runFetch.onError(failRun))
  .to(runNormalize)
  .add(runNormalize.onError(failRun))
  .to(stageGenerating)
  .to(editorialRequest)
  .add(editorialRequest.onError(failRun))
  .to(runEditorial)
  .add(runEditorial.onError(failRun))
  .to(stageRendering)
  .to(renderArtifact)
  .add(renderArtifact.onError(failRun))
  .to(saveResult)
  .add(failRun)
  .to(saveFailure)
  .add(overview);
