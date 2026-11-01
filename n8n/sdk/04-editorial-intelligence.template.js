import { workflow, node, trigger, sticky, ifElse, expr } from '@n8n/workflow-sdk';

const calledByWorkflow = trigger({
  type: 'n8n-nodes-base.executeWorkflowTrigger',
  version: 1.3,
  config: { name: 'When Called by Another Workflow', parameters: { inputSource: 'passthrough' }, position: [0, 0] },
  output: [{ input: { schemaVersion: '1.0' }, options: { provider: 'gemini' } }]
});

const manualTest = trigger({
  type: 'n8n-nodes-base.manualTrigger',
  version: 1,
  config: { name: 'Manual Test (synthetic input)', position: [0, 220] },
  output: [{}]
});

const syntheticRun = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: { name: 'Synthetic Input (test only)', parameters: { mode: 'runOnceForAllItems', language: 'javaScript', jsCode: "__CODE:syntheticEditorialRun__" }, position: [130, 220] },
  output: [{ input: { schemaVersion: '1.0' }, options: { provider: 'mock', scenario: 'revise-once' } }]
});

const step = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: { name: 'Editorial Step', parameters: { mode: 'runOnceForAllItems', language: 'javaScript', jsCode: "__CODE:editorialStep__" }, position: [260, 100] },
  output: [{ done: false, stepCount: 1, useMock: true }]
});

const isDone = ifElse({
  version: 2.2,
  config: {
    name: 'Run Complete?',
    position: [500, 100],
    parameters: {
      conditions: {
        options: { caseSensitive: true, leftValue: '', typeValidation: 'strict' },
        conditions: [{ leftValue: expr('{{ $json.done }}'), operator: { type: 'boolean', operation: 'true', singleValue: true } }],
        combinator: 'and'
      }
    }
  }
});

const humanReview = node({
  type: 'n8n-nodes-base.noOp',
  version: 1,
  config: { name: 'Human Review Ready', position: [760, 0] }
});

const useMock = ifElse({
  version: 2.2,
  config: {
    name: 'Use Mock Model?',
    position: [760, 220],
    parameters: {
      conditions: {
        options: { caseSensitive: true, leftValue: '', typeValidation: 'strict' },
        conditions: [{ leftValue: expr('{{ $json.useMock }}'), operator: { type: 'boolean', operation: 'true', singleValue: true } }],
        combinator: 'and'
      }
    }
  }
});

const mockModel = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: { name: 'Mock Model (synthetic only)', parameters: { mode: 'runOnceForAllItems', language: 'javaScript', jsCode: "__CODE:mockModel__" }, position: [1000, 140] },
  output: [{ stepCount: 1, modelResponse: { ok: true, text: '{}' } }]
});

const geminiCall = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.2,
  config: {
    name: 'Gemini generateContent',
    position: [1000, 320],
    onError: 'continueRegularOutput',
    parameters: {
      method: 'POST',
      url: expr('{{ $json.gemini.url }}'),
      authentication: 'predefinedCredentialType',
      nodeCredentialType: 'googlePalmApi',
      sendBody: true,
      contentType: 'json',
      specifyBody: 'json',
      jsonBody: expr('{{ JSON.stringify($json.gemini.body) }}'),
      options: { timeout: 120000, response: { response: { neverError: true } } }
    }
  },
  output: [{ candidates: [] }]
});

const attachState = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: { name: 'Attach Gemini State', parameters: { mode: 'runOnceForAllItems', language: 'javaScript', jsCode: "__CODE:attachGeminiState__" }, position: [1240, 320] },
  output: [{ stepCount: 1, modelResponse: { ok: true, text: '{}' } }]
});

const budget = ifElse({
  version: 2.2,
  config: {
    name: 'Step Budget Left?',
    position: [1480, 220],
    parameters: {
      conditions: {
        options: { caseSensitive: true, leftValue: '', typeValidation: 'strict' },
        conditions: [{ leftValue: expr('{{ $json.stepCount }}'), rightValue: 30, operator: { type: 'number', operation: 'lte' } }],
        combinator: 'and'
      }
    }
  }
});

const stopBudget = node({
  type: 'n8n-nodes-base.stopAndError',
  version: 1,
  config: { name: 'Stop: Step Budget Exceeded', position: [1720, 320], parameters: { errorType: 'errorMessage', errorMessage: '[STEP_BUDGET_EXCEEDED] editorial run exceeded 30 model calls' } }
});

const overview = sticky(
  '## 04 · Editorial Intelligence\n' +
  'Input: `{input: editorial-input, options: {provider, model?, parentRunId?, feedback?}}`. Output: an **editorial draft** at status `human_review` (schemas/editorial-draft.schema.json). Nothing is approved here.\n\n' +
  'All logic is the shared state machine in `web/src/lib/editorial` (bundled into **Editorial Step**): extractor → themes → spotlights/failure path/patterns → discussion → newsletter → code evidence review → model review → at most 2 revisions.\n\n' +
  'Model calls: **Gemini** via the n8n credential (none attached in exports; live use unverified), or the **mock** for synthetic input only. Numbers, refs, names and capabilities are checked by code.',
  [calledByWorkflow, manualTest, step],
  { color: 4 }
);

export default workflow('wf04-editorial-intelligence', '04 - Editorial Intelligence')
  .add(calledByWorkflow)
  .to(step)
  .add(manualTest)
  .to(syntheticRun)
  .to(step)
  .add(step)
  .to(isDone
    .onTrue(humanReview)
    .onFalse(useMock
      .onTrue(mockModel.to(budget))
      .onFalse(geminiCall.to(attachState.to(budget)))))
  .add(budget.onTrue(step).onFalse(stopBudget))
  .add(overview);
