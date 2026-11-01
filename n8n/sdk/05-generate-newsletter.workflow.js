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
  config: { name: 'Synthetic Request (test only)', parameters: { mode: 'runOnceForAllItems', language: 'javaScript', jsCode: "// CIS 515 Workflow Observatory · generated from web/src/n8n/nodes/wf05.ts (syntheticRequest) by web/scripts/build-n8n.ts. Do not edit in n8n.\nlet __run = null;\nconst __obsSet = (fn) => { __run = fn; };\n(()=>{var s=(e=>typeof require<\"u\"?require:typeof Proxy<\"u\"?new Proxy(e,{get:(o,n)=>(typeof require<\"u\"?require:o)[n]}):e)(function(e){if(typeof require<\"u\")return require.apply(this,arguments);throw Error('Dynamic require of \"'+e+'\" is not supported')});var t=s(\"crypto\");var r=()=>[{action:\"generate\",week:2,runId:\"r_\"+(0,t.randomBytes)(12).toString(\"hex\"),test:\"synthetic\"}];__obsSet(r);})();\nconst __ctx = {\n  items: $input.all().map((i) => i.json),\n  node: (name) => { try { return $(name).first().json; } catch (e) { return null; } },\n  runIndex: $runIndex,\n  now: new Date().toISOString(),\n};\nreturn __run(__ctx).map((json) => ({ json }));\n" }, position: [200, 520] },
  output: [{}]
});

const routeRequest = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: { name: 'Route Request', parameters: { mode: 'runOnceForAllItems', language: 'javaScript', jsCode: "// CIS 515 Workflow Observatory · generated from web/src/n8n/nodes/wf05.ts (routeRequest) by web/scripts/build-n8n.ts. Do not edit in n8n.\nlet __run = null;\nconst __obsSet = (fn) => { __run = fn; };\n(()=>{var c={1:{week:1,topic:\"Week 1 - Weekly Workflow Show-and-Tell on Yellowdig\",startDate:\"2026-10-14\",endDate:\"2026-10-28\",verifiedOn:\"2026-11-01\"},2:{week:2,topic:\"Week 2 - Weekly Workflow Show-and-Tell on Yellowdig\",startDate:\"2026-10-23\",endDate:\"2026-10-28\",verifiedOn:\"2026-11-01\"},3:{week:3,topic:null,startDate:null,endDate:null,verifiedOn:null},4:{week:4,topic:null,startDate:null,endDate:null,verifiedOn:null},5:{week:5,topic:null,startDate:null,endDate:null,verifiedOn:null}};function i(e){return typeof e==\"number\"&&Number.isInteger(e)&&e>=1&&e<=5?e:null}function a(e){return c[e]}var p=/^r_[a-f0-9]{24}$/;var k=1800*1e3;var u=32;function d(e,n){let t=e&&typeof e==\"object\"&&!Array.isArray(e)?e:{},r=typeof t.runId==\"string\"&&p.test(t.runId)?t.runId:null;if(!r)return{action:\"reject\",errorCode:\"INVALID_RUN_ID\"};if(t.action===\"status\"||t.action===\"artifact\")return{action:t.action,runId:r};if(t.action!==\"generate\")return{action:\"reject\",errorCode:\"INVALID_ACTION\"};let o=i(t.week);if(o===null)return{action:\"reject\",errorCode:\"INVALID_WEEK\"};let s=n&&t.test===\"synthetic\"?\"synthetic\":null;return!s&&!a(o).topic?{action:\"reject\",errorCode:\"WEEK_NOT_CONFIGURED\"}:!s&&(typeof t.pseudonymSalt!=\"string\"||t.pseudonymSalt.length<u)?{action:\"reject\",errorCode:\"SALT_NOT_CONFIGURED\"}:{action:\"generate\",week:o,runId:r,test:s}}var f={manual:\"Manual Test (synthetic)\",route:\"Route Request\",source:\"Run 01 Fetch Events\",dataset:\"Run 02 Normalize and Join\",request:\"Editorial Request\",editorial:\"Run 04 Editorial Intelligence\"};var l=e=>{let n=e.node(f.manual)!==null,t=e.items[0]??{};return[d(n?t:t.body,n)]};__obsSet(l);})();\nconst __ctx = {\n  items: $input.all().map((i) => i.json),\n  node: (name) => { try { return $(name).first().json; } catch (e) { return null; } },\n  runIndex: $runIndex,\n  now: new Date().toISOString(),\n};\nreturn __run(__ctx).map((json) => ({ json }));\n" }, position: [400, 300] },
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
  config: { name: 'Status Reply', parameters: { mode: 'runOnceForAllItems', language: 'javaScript', jsCode: "// CIS 515 Workflow Observatory · generated from web/src/n8n/nodes/wf05.ts (statusReply) by web/scripts/build-n8n.ts. Do not edit in n8n.\nlet __run = null;\nconst __obsSet = (fn) => { __run = fn; };\n(()=>{var c=new Set([\"ready\",\"ready_with_omissions\",\"failed\"]),l=1800*1e3,p=/^[A-Z][A-Z0-9_]{2,63}$/;var w=(e,r)=>{let o=Date.parse(String(e.updatedAt??e.createdAt??\"\"));return Number.isFinite(o)&&Date.parse(r)-o>l};function u(e,r,o){let t=e.find(d=>d.run_id===r.runId);if(!t)return{found:!1};let n=String(t.status),s=typeof t.error_code==\"string\"&&p.test(t.error_code)?t.error_code:null;!c.has(n)&&w(t,o)&&(n=\"failed\",s=\"RUN_STALE\");let i={found:!0,runId:r.runId,week:Number(t.week),status:n,errorCode:n===\"failed\"?s??\"GENERATION_FAILED\":null,omittedClaims:Number.isInteger(t.omitted_claims)?t.omitted_claims:0,updatedAt:typeof t.updatedAt==\"string\"?t.updatedAt:null};return r.action===\"artifact\"&&(n===\"ready\"||n===\"ready_with_omissions\")&&typeof t.html==\"string\"&&(i.html=t.html),i}var f={manual:\"Manual Test (synthetic)\",route:\"Route Request\",source:\"Run 01 Fetch Events\",dataset:\"Run 02 Normalize and Join\",request:\"Editorial Request\",editorial:\"Run 04 Editorial Intelligence\"};var a=e=>{let r=e.node(f.route);return[u(e.items,r,e.now)]};__obsSet(a);})();\nconst __ctx = {\n  items: $input.all().map((i) => i.json),\n  node: (name) => { try { return $(name).first().json; } catch (e) { return null; } },\n  runIndex: $runIndex,\n  now: new Date().toISOString(),\n};\nreturn __run(__ctx).map((json) => ({ json }));\n" }, position: [1080, 300] },
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
  config: { name: 'Decide Run Start', parameters: { mode: 'runOnceForAllItems', language: 'javaScript', jsCode: "// CIS 515 Workflow Observatory · generated from web/src/n8n/nodes/wf05.ts (decideRunStart) by web/scripts/build-n8n.ts. Do not edit in n8n.\nlet __run = null;\nconst __obsSet = (fn) => { __run = fn; };\n(()=>{var u=new Set([\"ready\",\"ready_with_omissions\",\"failed\"]),a=1800*1e3;var d=(t,e)=>{let r=Date.parse(String(t.updatedAt??t.createdAt??\"\"));return Number.isFinite(r)&&Date.parse(e)-r>a};function s(t,e,r){let o=t.find(n=>typeof n.run_id==\"string\"&&Number(n.week)===e.week&&!u.has(String(n.status))&&!d(n,r));return o?{reuse:!0,runId:String(o.run_id),week:e.week,status:String(o.status)}:{reuse:!1,runId:e.runId,week:e.week,status:\"queued\"}}var c={manual:\"Manual Test (synthetic)\",route:\"Route Request\",source:\"Run 01 Fetch Events\",dataset:\"Run 02 Normalize and Join\",request:\"Editorial Request\",editorial:\"Run 04 Editorial Intelligence\"};var i=t=>{let e=t.node(c.route);return[s(t.items,e,t.now)]};__obsSet(i);})();\nconst __ctx = {\n  items: $input.all().map((i) => i.json),\n  node: (name) => { try { return $(name).first().json; } catch (e) { return null; } },\n  runIndex: $runIndex,\n  now: new Date().toISOString(),\n};\nreturn __run(__ctx).map((json) => ({ json }));\n" }, position: [1080, 60] },
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
  config: { name: 'Queued Reply', parameters: { mode: 'runOnceForAllItems', language: 'javaScript', jsCode: "// CIS 515 Workflow Observatory · generated from web/src/n8n/nodes/wf05.ts (queuedReply) by web/scripts/build-n8n.ts. Do not edit in n8n.\nlet __run = null;\nconst __obsSet = (fn) => { __run = fn; };\n(()=>{var o={manual:\"Manual Test (synthetic)\",route:\"Route Request\",source:\"Run 01 Fetch Events\",dataset:\"Run 02 Normalize and Join\",request:\"Editorial Request\",editorial:\"Run 04 Editorial Intelligence\"};var t=r=>{let e=r.node(o.route);return[{runId:e.runId,week:e.week,status:\"queued\"}]};__obsSet(t);})();\nconst __ctx = {\n  items: $input.all().map((i) => i.json),\n  node: (name) => { try { return $(name).first().json; } catch (e) { return null; } },\n  runIndex: $runIndex,\n  now: new Date().toISOString(),\n};\nreturn __run(__ctx).map((json) => ({ json }));\n" }, position: [1740, 120] },
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
  config: { name: 'Source Config', parameters: { mode: 'runOnceForAllItems', language: 'javaScript', jsCode: "// CIS 515 Workflow Observatory · generated from web/src/n8n/nodes/wf05.ts (sourceConfig) by web/scripts/build-n8n.ts. Do not edit in n8n.\nlet __run = null;\nconst __obsSet = (fn) => { __run = fn; };\n(()=>{var d={1:{week:1,topic:\"Week 1 - Weekly Workflow Show-and-Tell on Yellowdig\",startDate:\"2026-10-14\",endDate:\"2026-10-28\",verifiedOn:\"2026-11-01\"},2:{week:2,topic:\"Week 2 - Weekly Workflow Show-and-Tell on Yellowdig\",startDate:\"2026-10-23\",endDate:\"2026-10-28\",verifiedOn:\"2026-11-01\"},3:{week:3,topic:null,startDate:null,endDate:null,verifiedOn:null},4:{week:4,topic:null,startDate:null,endDate:null,verifiedOn:null},5:{week:5,topic:null,startDate:null,endDate:null,verifiedOn:null}};var s={network:\"carey-school-of-business\",communityId:\"6acd2896-76e7-400f-9a00-cfd657470859\",timezone:\"America/Phoenix\"};function a(t){return d[t]}var h=1800*1e3;var i=32;var c={id:\"topic-week-2\",name:\"WEEK 2 - WEEKLY WORKFLOW SHOW-AND-TELL ON YELLOWDIG\"};var n={sourceMode:\"fixture\",week:2,startDate:\"2026-10-23\",endDate:\"2026-10-28\",timezone:\"America/Phoenix\",network:\"carey-school-of-business\",communityId:\"6acd2896-76e7-400f-9a00-cfd657470859\",topic:c.name};var w={\"community/squuid\":n.communityId,\"community/title\":\"CIS 515 (synthetic)\",\"community/network\":n.network};var l={manual:\"Manual Test (synthetic)\",route:\"Route Request\",source:\"Run 01 Fetch Events\",dataset:\"Run 02 Normalize and Join\",request:\"Editorial Request\",editorial:\"Run 04 Editorial Intelligence\"};var p=\"Newsletter Webhook\",u=t=>{let r=t.node(l.route);if(r.test===\"synthetic\")return[{...n}];let e=a(r.week);if(!e.topic||!e.startDate||!e.endDate)throw new Error(\"[WEEK_NOT_CONFIGURED] week \"+r.week);let o=t.node(p)?.body?.pseudonymSalt;if(typeof o!=\"string\"||o.length<i)throw new Error(\"[SALT_NOT_CONFIGURED] no pseudonymization salt\");return[{sourceMode:\"yellowdig\",week:e.week,startDate:e.startDate,endDate:e.endDate,topic:e.topic,...s,yellowdigCredentialConfigured:!0,pseudonymSalt:o}]};__obsSet(u);})();\nconst __ctx = {\n  items: $input.all().map((i) => i.json),\n  node: (name) => { try { return $(name).first().json; } catch (e) { return null; } },\n  runIndex: $runIndex,\n  now: new Date().toISOString(),\n};\nreturn __run(__ctx).map((json) => ({ json }));\n" }, position: [2400, 120], onError: 'continueErrorOutput' },
  output: [{}]
});

const runFetch = node({
  type: 'n8n-nodes-base.executeWorkflow',
  version: 1.2,
  config: {
    name: 'Run 01 Fetch Events', position: [2620, 120], onError: 'continueErrorOutput',
    parameters: { source: 'database', workflowId: { __rl: true, mode: 'id', value: 'dHZoXDny6WU1v62y' }, mode: 'once', options: { waitForSubWorkflow: true } }
  },
  output: [{}]
});

const runNormalize = node({
  type: 'n8n-nodes-base.executeWorkflow',
  version: 1.2,
  config: {
    name: 'Run 02 Normalize and Join', position: [2840, 120], onError: 'continueErrorOutput',
    parameters: { source: 'database', workflowId: { __rl: true, mode: 'id', value: 'ZZoqGbrNSC3nAo3f' }, mode: 'once', options: { waitForSubWorkflow: true } }
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
  config: { name: 'Editorial Request', parameters: { mode: 'runOnceForAllItems', language: 'javaScript', jsCode: "// CIS 515 Workflow Observatory · generated from web/src/n8n/nodes/wf05.ts (editorialRequest) by web/scripts/build-n8n.ts. Do not edit in n8n.\nlet __run = null;\nconst __obsSet = (fn) => { __run = fn; };\n(()=>{var E=[\"usesAI\",\"usesMultipleAgents\",\"usesCode\",\"usesHumanApproval\",\"usesExternalAPI\",\"usesEmail\",\"usesDataStore\",\"usesRetry\",\"hasBoundedRetry\",\"hasExplicitFailureHandling\",\"hasValidationGate\",\"hasCodeValidation\",\"usesLLMJudge\",\"hasFallback\",\"usesRAG\",\"usesMemory\"];function y(e,t){return e.map(l=>{let i=t.assets.filter(o=>o.asset.postRef===l.postId),c=i.filter(o=>o.asset.kind===\"workflow_screenshot\"&&o.status===\"VALIDATED\").map(o=>o.asset.originalFilename),s=i.find(o=>o.asset.kind===\"n8n_workflow_json\"&&o.status===\"PROFILED\");return!c.length&&!s?l:{...l,assets:{screenshots:c,workflowJson:s?s.asset.originalFilename:null}}})}var p=(e,t)=>e<t?-1:e>t?1:0;function k(e){let t=e.filter(l=>typeof l==\"number\");return t.length===0?null:t.reduce((l,i)=>l+i,0)}function w(e,t){let l=new Set(e.map(c=>c.postId)),i=new Map;return[...t].sort((c,s)=>p(c.assetId,s.assetId)).forEach(c=>{c.postRef&&l.has(c.postRef)&&!i.has(c.postRef)&&i.set(c.postRef,c)}),i}var N=[[\"codeChecks\",\"hasCodeValidation\"],[\"humanReview\",\"usesHumanApproval\"],[\"boundedRetry\",\"hasBoundedRetry\"],[\"errorHandling\",\"hasExplicitFailureHandling\"],[\"llmJudge\",\"usesLLMJudge\"],[\"multiAgent\",\"usesMultipleAgents\"],[\"fallback\",\"hasFallback\"],[\"rag\",\"usesRAG\"],[\"memory\",\"usesMemory\"]];function D(e){return e?N.filter(([,t])=>e.capabilities[t]).map(([t])=>t):[]}function I(e,t){let l=w(e,t),i=e.reduce((r,a)=>r+a.comments.length,0),c=new Set(e.map(r=>r.author.id)),s=new Set(e.flatMap(r=>r.comments.map(a=>a.author.id))),o=new Map;e.forEach(r=>o.set(r.topic.name,(o.get(r.topic.name)??0)+1));let d=[...o.entries()].map(([r,a])=>({topic:r,count:a})).sort((r,a)=>a.count-r.count||p(r.topic,a.topic)),f=[...l.values()],m=r=>f.filter(a=>D(a).includes(r)).length,n=new Map;f.forEach(r=>new Set(r.integrations).forEach(a=>n.set(a,(n.get(a)??0)+1)));let u=[...n.entries()].map(([r,a])=>({name:r,builds:a})).sort((r,a)=>a.builds-r.builds||p(r.name,a.name));return{provenance:\"CODE-COUNTED\",posts:e.length,comments:i,uniqueAuthors:c.size,uniqueCommenters:s.size,reactions:k(e.map(r=>r.metrics.reactionCount)),views:k(e.map(r=>r.metrics.viewCount)),workflowFiles:l.size,screenshots:e.reduce((r,a)=>r+a.assets.screenshots.length,0),avgCommentsPerPost:e.length===0?0:Math.round(i/e.length*100)/100,topicCounts:d,signals:{profiledBuilds:f.length,codeChecks:m(\"codeChecks\"),humanReview:m(\"humanReview\"),boundedRetry:m(\"boundedRetry\"),errorHandling:m(\"errorHandling\"),llmJudge:m(\"llmJudge\"),multiAgent:m(\"multiAgent\"),fallback:m(\"fallback\")},externalServices:u}}function R(e,t=5){let l=e.filter(s=>s.comments.length>0).sort((s,o)=>o.comments.length-s.comments.length||p(s.createdAt,o.createdAt)||p(s.postId,o.postId)).slice(0,t).map(s=>({postId:s.postId,title:s.title,author:s.author.displayName,commentCount:s.comments.length})),i=new Map;e.forEach(s=>s.comments.forEach(o=>{if(o.author.id===s.author.id)return;let d=i.get(o.author.id)??{name:o.author.displayName,n:0};d.n+=1,i.set(o.author.id,d)}));let c=[...i.values()].sort((s,o)=>o.n-s.n||p(s.name,o.name)).slice(0,t).map(s=>({name:s.name,commentsOnOthers:s.n}));return{mostDiscussed:l,generousCommenters:c}}function A(e,t,l){let i=c=>c.toLowerCase().replace(/[^a-z0-9]+/g,\"-\").replace(/^-|-$/g,\"\");return[i(e),i(t),\"week\",String(l).padStart(2,\"0\")].join(\"-\")}var T=\"1.0\",P=\"4.0.0\",g={postBodyChars:2500,commentBodyChars:600,commentsPerPost:25},x=e=>e.replace(/[^A-Za-z0-9._:-]+/g,\"-\"),S=(e,t)=>e.length>t?{text:e.slice(0,t),truncated:!0}:{text:e,truncated:!1};function _(e){let{dataset:t,course:l}=e,i=e.manifest?y(t.posts,e.manifest):t.posts,c=w(i,e.profiles),s=[...c.values()],o=I(i,e.profiles),d=R(i),f=[{ref:\"metric:posts\",label:\"Workflow posts\",value:o.posts},{ref:\"metric:comments\",label:\"Comments\",value:o.comments},{ref:\"metric:uniqueAuthors\",label:\"Distinct post authors\",value:o.uniqueAuthors},{ref:\"metric:uniqueCommenters\",label:\"Distinct commenters\",value:o.uniqueCommenters},{ref:\"metric:reactions\",label:\"Reactions (null when the source has none)\",value:o.reactions},{ref:\"metric:views\",label:\"Views (null when the source has none)\",value:o.views},{ref:\"metric:workflowFiles\",label:\"Workflow files profiled and matched to a post\",value:o.workflowFiles},{ref:\"metric:screenshots\",label:\"Validated screenshots matched to a post\",value:o.screenshots},{ref:\"metric:avgCommentsPerPost\",label:\"Average comments per post\",value:o.avgCommentsPerPost},...Object.entries(o.signals).map(([n,u])=>({ref:\"metric:signals.\"+n,label:\"Profiled builds with signal \"+n,value:u})),...E.map(n=>({ref:\"metric:capabilities.\"+n,label:\"Profiled builds where \"+n+\" is true\",value:s.filter(u=>u.capabilities[n]).length})),...o.externalServices.map(n=>({ref:\"metric:services.\"+x(n.name),label:\"Builds using \"+n.name,value:n.builds}))];return{schemaVersion:T,issueId:A(l.code,l.term,t.week),course:l,week:t.week,dateRange:{start:t.window.start,end:t.window.end,timezone:t.window.timezone},topic:t.topic,sourceStatus:{provider:t.source.provider,liveSourceVerified:t.source.liveSourceVerified,fallbackReason:t.source.fallbackReason,commentsLiveVerified:!1,reactionsLiveVerified:!1},metrics:f,posts:i.map(n=>{let u=S(n.body,g.postBodyChars),r=c.get(n.postId);return{postRef:\"post:\"+n.postId,title:n.title,authorRef:\"person:\"+n.author.id,authorName:n.author.displayName,createdAt:n.createdAt,body:u.text,bodyTruncated:u.truncated,commentCount:n.metrics.commentCount,workflowProfileRef:r?\"workflow:\"+r.profileId:null,comments:n.comments.slice(0,g.commentsPerPost).map(a=>{let h=S(a.body,g.commentBodyChars);return{commentRef:\"comment:\"+a.commentId,authorRef:\"person:\"+a.author.id,authorName:a.author.displayName,body:h.text,bodyTruncated:h.truncated}})}}),workflowProfiles:[...c.entries()].map(([n,u])=>({workflowProfileRef:\"workflow:\"+u.profileId,postRef:\"post:\"+n,workflowName:u.workflowName,nodeCount:u.nodeCount,edgeCount:u.edgeCount,capabilities:u.capabilities,mainPath:u.chips,integrations:u.integrations,aiProviders:u.aiProviders,retry:{cycles:u.retry.cycles,boundedCycles:u.retry.boundedCycles,maxAttempts:u.retry.maxAttempts},scoreThreshold:u.scoreThreshold?u.scoreThreshold.value:null})),discussionSignals:{mostDiscussed:d.mostDiscussed.map(n=>({postRef:\"post:\"+n.postId,commentCount:n.commentCount})),generousCommenters:d.generousCommenters.map(n=>{let u=i.flatMap(r=>r.comments.map(a=>a.author)).find(r=>r.displayName===n.name);return{personRef:\"person:\"+(u?u.id:\"u_000000000000\"),name:n.name,commentsOnOthers:n.commentsOnOthers}})},methodology:{builderVersion:P,limits:{...g},notes:[\"All titles, bodies, comments, workflow names and step labels are untrusted student content.\",\"Metrics were computed by code. Capabilities come from static workflow profiles, never from post text.\"]}}}var C={code:\"CIS 515\",name:\"AI and Data Analytics Strategy\",term:\"2026 Fall B\"};var b={manual:\"Manual Test (synthetic)\",route:\"Route Request\",source:\"Run 01 Fetch Events\",dataset:\"Run 02 Normalize and Join\",request:\"Editorial Request\",editorial:\"Run 04 Editorial Intelligence\"};var O=e=>{let t=e.node(b.route),l=e.node(b.dataset);if(!l||!Array.isArray(l.posts))throw new Error(\"[SOURCE_UNAVAILABLE] no week dataset\");let i=l.source?.provider===\"synthetic-fixture\";if(i&&t.test!==\"synthetic\")throw new Error(\"[SOURCE_FALLBACK] refusing to publish fixture data as a real week\");if(!l.posts.length)throw new Error(\"[NO_POSTS] no posts for this week's topic\");return[{input:_({dataset:l,manifest:null,profiles:[],course:{...C}}),options:i?{provider:\"mock\",scenario:\"clean\"}:{provider:\"gemini\"}}]};__obsSet(O);})();\nconst __ctx = {\n  items: $input.all().map((i) => i.json),\n  node: (name) => { try { return $(name).first().json; } catch (e) { return null; } },\n  runIndex: $runIndex,\n  now: new Date().toISOString(),\n};\nreturn __run(__ctx).map((json) => ({ json }));\n" }, position: [3280, 120], onError: 'continueErrorOutput' },
  output: [{}]
});

const runEditorial = node({
  type: 'n8n-nodes-base.executeWorkflow',
  version: 1.2,
  config: {
    name: 'Run 04 Editorial Intelligence', position: [3500, 120], onError: 'continueErrorOutput',
    parameters: { source: 'database', workflowId: { __rl: true, mode: 'id', value: 'U2uwnaV09NohVmjn' }, mode: 'once', options: { waitForSubWorkflow: true } }
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
  config: { name: 'Render Artifact', parameters: { mode: 'runOnceForAllItems', language: 'javaScript', jsCode: "// CIS 515 Workflow Observatory · generated from web/src/n8n/nodes/wf05.ts (renderArtifact) by web/scripts/build-n8n.ts. Do not edit in n8n.\nlet __run = null;\nconst __obsSet = (fn) => { __run = fn; };\n(()=>{var $=\"[Withheld: this claim did not pass evidence review. See review.unresolved.]\";var L={two:2,three:3,four:4,five:5,six:6,seven:7,eight:8,nine:9,ten:10,eleven:11,twelve:12,thirteen:13,fourteen:14,fifteen:15,sixteen:16,seventeen:17,eighteen:18,nineteen:19,twenty:20},ct=Object.fromEntries(Object.entries(L).map(([n,i])=>[i,n])),dt=new RegExp(\"(?<![\\\\w.])\\\\$?(\\\\d+(?:[.,]\\\\d+)?)%?|\\\\b(\"+Object.keys(L).join(\"|\")+\")\\\\b\",\"gi\"),ft=new RegExp(\"\\\\b(\\\\d+|\"+Object.keys(L).join(\"|\")+\")\\\\s+(?:of the\\\\s+\\\\S+\\\\s+)?(?:profiled\\\\s+|submitted\\\\s+)?(builds?|workflows?|posts?|students|classmates|comments|people|contributors|commenters|authors)\\\\b\",\"gi\");function o(n){return String(n??\"\").replace(/&/g,\"&amp;\").replace(/</g,\"&lt;\").replace(/>/g,\"&gt;\").replace(/\"/g,\"&quot;\").replace(/'/g,\"&#39;\")}var f=(n,i)=>n.length>i?n.slice(0,i-1).trimEnd()+\"\\u2026\":n,X=n=>n&&/^https:\\/\\/yellowdig\\.app\\/[^\\s\"'<>]*$/.test(n)?o(n):null,rt=n=>n&&/^data:image\\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(n)?n:null,Q=n=>f(n.trim().split(/\\s+/)[0]||n,40),m=\"Georgia, 'Times New Roman', serif\",p=\"Arial, Helvetica, sans-serif\",l=\"#1A1A1A\",w=\"#555555\",k=\"#3D3D3D\",h=\"#8C1D40\",Z=\"#D4D4D4\",I=[\"Jan\",\"Feb\",\"Mar\",\"Apr\",\"May\",\"Jun\",\"Jul\",\"Aug\",\"Sep\",\"Oct\",\"Nov\",\"Dec\"];function at(n,i){let u=c=>{let[R,S,g]=c.slice(0,10).split(\"-\").map(Number);return{y:R,m:S,d:g}},s=u(n),r=u(i);return[s.y,s.m,s.d,r.y,r.m,r.d].every(Number.isFinite)?s.y!==r.y?I[s.m-1]+\" \"+s.d+\", \"+s.y+\"\\u2013\"+I[r.m-1]+\" \"+r.d+\", \"+r.y:s.m!==r.m?I[s.m-1]+\" \"+s.d+\"\\u2013\"+I[r.m-1]+\" \"+r.d+\", \"+r.y:I[s.m-1]+\" \"+s.d+\"\\u2013\"+r.d+\", \"+r.y:\"\"}var lt={trigger:\"Trigger\",ai:\"Model\",judge:\"Judge\",code:\"Logic\",validator:\"Logic\",gate:\"Logic\",approval:\"Human\",action:\"Action\",storage:\"Storage\",tool:\"Tool\",errorPath:\"Fallback\",other:\"Step\"};function pt(n){let i=n.slice(0,7).map(s=>{let r=s.category===\"approval\";return'<span style=\"display:inline-block;vertical-align:middle;'+(r?\"border:1px solid \"+h+\";background:\"+h+\";color:#FFFFFF\":\"border:1px solid \"+l+\";background:#FFFFFF;color:\"+l)+';padding:5px 8px;margin:0 0 6px\"><span style=\"display:block;font-family:'+p+\";font-size:9px;letter-spacing:1px;text-transform:uppercase;color:\"+(r?\"#FFFFFF\":w)+'\">'+o(lt[s.category]??\"Step\")+'</span><span style=\"display:block;font-family:'+p+';font-size:12px\">'+o(f(s.label,40))+\"</span></span>\"}),u='<span style=\"display:inline-block;vertical-align:middle;font-family:'+p+\";font-size:12px;color:\"+w+';padding:0 5px 6px\">&rarr;</span>';return i.length?'<div style=\"margin:0 0 14px\">'+i.join(u)+\"</div>\":\"\"}var C=n=>'<tr><td style=\"border-top:3px solid '+l+\";padding:10px 0 0;font-family:\"+p+\";font-size:12px;letter-spacing:2px;text-transform:uppercase;font-weight:bold;color:\"+h+'\">'+o(n)+\"</td></tr>\",D=n=>'<div style=\"font-family:'+p+\";font-size:11px;letter-spacing:1.5px;text-transform:uppercase;font-weight:bold;color:\"+l+';margin:0 0 6px\">'+o(n)+\"</div>\",O=(n,i=14)=>'<p style=\"font-family:'+p+\";font-size:\"+i+\"px;line-height:1.55;color:\"+l+';margin:0 0 14px\">'+o(n)+\"</p>\";function tt(n){let{input:i,draft:u}=n,s=u.newsletter;if(!s)throw new Error(\"renderNewsletter: the draft has no newsletter (status \"+u.status+\")\");let r=0,c=t=>t?t.text===$||!t.text.trim()?(r++,!1):!0:!1,R=new Map(i.posts.map(t=>[t.postRef,t])),S=new Map(i.workflowProfiles.map(t=>[t.workflowProfileRef,t])),g=t=>i.metrics.find(a=>a.ref===t)?.value??null,N=i.week,M=at(i.dateRange.start,i.dateRange.end),F=i.sourceStatus.provider===\"synthetic-fixture\",U=c(s.hero.title)?s.hero.title.text:\"CIS 515 Community Dispatch \\xB7 Week \"+N,v=c(s.hero.dek)?s.hero.dek.text:\"\",W=[],e=t=>W.push(t);e(\"<!doctype html>\"),e('<html lang=\"en\"><head><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\"><meta name=\"color-scheme\" content=\"light\">'),e(\"<meta http-equiv=\\\"Content-Security-Policy\\\" content=\\\"default-src 'none'; style-src 'unsafe-inline'; img-src data:\\\">\"),e(\"<title>\"+o(U)+\"</title>\"),e(\"<style>@media only screen and (max-width: 620px) { .pad { padding: 24px 18px 32px !important; } .h1 { font-size: 32px !important; } .dek { font-size: 17px !important; } .num { font-size: 24px !important; } .lbl { font-size: 9px !important; letter-spacing: 0 !important; } .stat { padding-left: 8px !important; } .mast td { display: block !important; text-align: left !important; padding-bottom: 4px !important; } .two td { display: block !important; width: 100% !important; padding: 0 0 18px !important; } img { width: 100% !important; } }</style>\"),e('</head><body style=\"margin:0;padding:0;background:#F2F2F2\">'),v&&e('<div style=\"display:none;max-height:0;overflow:hidden\">'+o(f(v,200))+\"</div>\"),e('<table role=\"presentation\" width=\"100%\" cellpadding=\"0\" cellspacing=\"0\" border=\"0\" style=\"background:#F2F2F2\"><tr><td align=\"center\" style=\"padding:24px 12px\">'),e('<table role=\"presentation\" width=\"640\" cellpadding=\"0\" cellspacing=\"0\" border=\"0\" style=\"width:100%;max-width:640px;background:#FFFFFF\">'),e('<tr><td class=\"pad\" style=\"padding:36px 48px 48px\"><table role=\"presentation\" width=\"100%\" cellpadding=\"0\" cellspacing=\"0\" border=\"0\">'),e('<tr><td style=\"border-bottom:3px solid '+l+';padding:0 0 10px\"><table role=\"presentation\" class=\"mast\" width=\"100%\" cellpadding=\"0\" cellspacing=\"0\" border=\"0\"><tr>'),e('<td style=\"font-family:'+p+\";font-size:11px;letter-spacing:2px;text-transform:uppercase;font-weight:bold;color:\"+l+'\">ASU &middot; '+o(i.course.code)+\" &middot; Community Dispatch</td>\"),e('<td align=\"right\" style=\"font-family:'+p+\";font-size:11px;letter-spacing:1px;text-transform:uppercase;color:\"+w+'\">Week '+o(N)+(M?\" &middot; \"+o(M):\"\")+\"</td>\"),e(\"</tr></table></td></tr>\"),F&&e('<tr><td style=\"padding:16px 0 0\"><div style=\"border:2px solid '+h+\";padding:10px 12px;font-family:\"+p+\";font-size:13px;line-height:1.5;color:\"+l+'\"><strong>Synthetic test issue.</strong> Every name, post and number here is invented to test the format. It is not real CIS 515 class data.</div></td></tr>'),e('<tr><td style=\"padding:26px 0 0\">'),e('<h1 class=\"h1\" style=\"font-family:'+m+\";font-weight:normal;font-size:44px;line-height:1.08;color:\"+l+';margin:0 0 14px\">'+o(U)+\"</h1>\"),v&&e('<p class=\"dek\" style=\"font-family:'+m+\";font-size:19px;line-height:1.45;color:\"+k+';margin:0 0 14px\">'+o(v)+\"</p>\");let z=rt(n.heroImage);z&&e('<img src=\"'+z+'\" width=\"544\" alt=\"\" style=\"display:block;width:100%;max-width:544px;height:auto;border:0;margin:6px 0 18px\">'),e('<p style=\"font-family:'+p+\";font-size:12px;color:\"+w+';margin:0 0 24px\">Built with n8n &mdash; drafted by AI, checked by code against the week&#39;s posts.</p>'),e(\"</td></tr>\");let H=[[\"builds\",g(\"metric:posts\")],[\"comments\",g(\"metric:comments\")],[\"workflow files\",g(\"metric:workflowFiles\")],[\"people posting\",g(\"metric:uniqueAuthors\")]];e('<tr><td style=\"border-top:1px solid '+l+\";border-bottom:1px solid \"+l+'\"><table role=\"presentation\" width=\"100%\" cellpadding=\"0\" cellspacing=\"0\" border=\"0\"><tr>'),H.forEach(([t,a],d)=>{let b=d===0?\"padding:14px 0 14px 0;\":\"padding:14px 0 14px 14px;\",x=d<H.length-1?\"border-right:1px solid \"+Z+\";\":\"\";e('<td width=\"25%\" valign=\"top\" class=\"'+(d?\"stat\":\"\")+'\" style=\"'+b+x+'\"><div class=\"num\" style=\"font-family:'+m+\";font-size:32px;line-height:1;color:\"+l+'\">'+(a===null?\"&ndash;\":o(a))+'</div><div class=\"lbl\" style=\"font-family:'+p+\";font-size:11px;letter-spacing:1px;text-transform:uppercase;color:\"+w+';padding-top:6px\">'+o(t)+\"</div></td>\")}),e(\"</tr></table></td></tr>\");let j=s.executiveSummary.filter(c).map(t=>t.text).join(\" \");j&&e('<tr><td style=\"padding:26px 0 36px\"><p style=\"font-family:'+m+\";font-size:17px;line-height:1.6;color:\"+l+';margin:0\">'+o(j)+\"</p></td></tr>\");let q=new Set,B=s.spotlights.filter(t=>R.has(t.postRef)),E=1;if(B.length){e(C(String(E++).padStart(2,\"0\")+\" \\u2014 Spotlights\"));for(let t of B){let a=R.get(t.postRef),d=c(t.text)?t.text.text:null,b=c(t.worthBorrowing)?t.worthBorrowing.text:null;if(!d&&!b)continue;q.add(t.postRef);let x=a.workflowProfileRef?S.get(a.workflowProfileRef):void 0,y=s.failurePath&&s.failurePath.postRef===t.postRef?s.failurePath:null;if(e('<tr><td style=\"padding:24px 0 30px;border-bottom:1px solid '+Z+'\">'),e('<div style=\"font-family:'+p+\";font-size:11px;letter-spacing:1.5px;text-transform:uppercase;font-weight:bold;color:\"+h+';margin:0 0 6px\">'+o(t.label)+\"</div>\"),e('<h2 style=\"font-family:'+m+\";font-weight:normal;font-size:27px;line-height:1.15;color:\"+l+';margin:4px 0 6px\">'+o(f(a.title,140))+\"</h2>\"),e('<div style=\"font-family:'+p+\";font-size:13px;color:\"+w+';margin:0 0 16px\">'+o(f(a.authorName,80))+\" &middot; \"+o(a.commentCount)+(a.commentCount===1?\" comment\":\" comments\")+(x?\" &middot; pipeline read from the workflow file\":\"\")+\"</div>\"),d&&e(O(d,15)),x&&e(pt(x.mainPath)),y&&c(y.control)&&e('<p style=\"font-family:'+p+\";font-size:12px;font-style:italic;color:\"+w+';margin:0 0 18px\">'+o(y.control.text)+\"</p>\"),y){let Y=[y.failure,y.recovery].filter(c).map(it=>it.text).join(\" \");Y&&e(D(\"What the test showed\")+O(Y)),c(y.lesson)&&e(D(\"Lesson\")+O(y.lesson.text))}b&&e('<p style=\"font-family:'+m+\";font-size:16px;font-style:italic;color:\"+k+';margin:6px 0 14px\">Worth borrowing: '+o(b)+\"</p>\");let V=X(n.postUrls?.[t.postRef]);V&&e('<a href=\"'+V+'\" style=\"font-family:'+p+\";font-size:13px;font-weight:bold;color:\"+h+';text-decoration:none\">Read '+o(Q(a.authorName))+\"&#39;s post &rarr;</a>\"),e(\"</td></tr>\")}e('<tr><td style=\"height:40px\"></td></tr>')}let K=s.themes.filter(t=>c(t.text));if(K.length&&(e(C(String(E++).padStart(2,\"0\")+\" \\u2014 Themes this week\")),e('<tr><td style=\"padding:18px 0 30px\">'),K.forEach(t=>e('<div style=\"font-family:'+m+\";font-size:18px;color:\"+l+';margin:0 0 4px\">'+o(f(t.title,120))+'</div><p style=\"font-family:'+p+\";font-size:14px;line-height:1.55;color:\"+k+';margin:0 0 16px\">'+o(t.text.text)+\"</p>\")),e(\"</td></tr>\")),i.posts.length){e(C(String(E++).padStart(2,\"0\")+\" \\u2014 In brief: every build this week\")),e('<tr><td style=\"padding:10px 0 0\"><p style=\"font-family:'+m+\";font-size:15px;font-style:italic;color:\"+k+';margin:0 0 6px\">All '+o(i.posts.length)+\" builds. Red numbers are comment counts.</p></td></tr>\");for(let t of i.posts){let a=X(n.postUrls?.[t.postRef]),d=a?'<a href=\"'+a+'\" style=\"font-weight:bold;color:'+l+';text-decoration:none\">'+o(f(t.authorName,80))+\"</a>\":\"<b>\"+o(f(t.authorName,80))+\"</b>\";e('<tr><td style=\"padding:10px 0;border-bottom:1px solid #E5E5E5;font-family:'+p+\";font-size:13px;line-height:1.5;color:\"+l+'\">'+d+\" &mdash; <i>\"+o(f(t.title,160))+\"</i>\"+(q.has(t.postRef)?' <span style=\"color:'+h+'\">See the spotlight above.</span>':\"\")+(t.commentCount?' <span style=\"color:'+h+'\">'+o(t.commentCount)+\"</span>\":\"\")+\"</td></tr>\")}}let _=i.discussionSignals.mostDiscussed.filter(t=>R.has(t.postRef)&&t.commentCount>0).slice(0,4),P=i.discussionSignals.generousCommenters.filter(t=>t.commentsOnOthers>0).slice(0,3);if(_.length||P.length){let t=(a,d)=>'<td width=\"50%\" valign=\"top\" style=\"padding:0 16px 0 0\">'+D(a)+d.map(b=>'<div style=\"font-family:'+p+\";font-size:14px;line-height:1.9;color:\"+l+'\">'+b+\"</div>\").join(\"\")+\"</td>\";e('<tr><td style=\"padding:36px 0 40px\"><table role=\"presentation\" class=\"two\" width=\"100%\" cellpadding=\"0\" cellspacing=\"0\" border=\"0\"><tr>'),_.length&&e(t(\"Most discussed\",_.map(a=>{let d=R.get(a.postRef);return o(Q(d.authorName))+\" &mdash; \"+o(f(d.title,90))+' <span style=\"color:'+h+'\">'+o(a.commentCount)+\"</span>\"}))),P.length&&e(t(\"Most generous commenters\",P.map(a=>o(f(a.name,60))+' <span style=\"color:'+h+'\">'+o(a.commentsOnOthers)+\"</span>\"))),e(\"</tr></table></td></tr>\")}let G=s.discussionHighlights.filter(c);G.length&&(e(C(String(E++).padStart(2,\"0\")+\" \\u2014 From the discussion\")),e('<tr><td style=\"padding:18px 0 30px\">'+G.map(t=>O(t.text)).join(\"\")+\"</td></tr>\"));let T=s.takeaways.filter(t=>c(t.text)),A=s.borrowThisPattern.filter(t=>c(t.why));(T.length||A.length)&&(e(C(String(E++).padStart(2,\"0\")+\" \\u2014 What to carry into Week \"+(N+1))),T.length&&(e('<tr><td style=\"padding:18px 0 6px\">'),T.forEach(t=>e('<div style=\"font-family:'+m+\";font-size:18px;color:\"+l+';margin:0 0 4px\">'+o(f(t.title,120))+'</div><p style=\"font-family:'+p+\";font-size:14px;line-height:1.55;color:\"+k+';margin:0 0 16px\">'+o(t.text.text)+\"</p>\")),e(\"</td></tr>\")),A.length&&e('<tr><td style=\"padding:0 0 40px\"><ol style=\"font-family:'+m+\";font-size:17px;line-height:1.7;color:\"+l+';margin:0;padding-left:22px\">'+A.map(t=>\"<li>\"+o(f(t.title,120))+\": \"+o(t.why.text)+\"</li>\").join(\"\")+\"</ol></td></tr>\"));let st=g(\"metric:posts\"),J=g(\"metric:comments\"),nt=[\"Generated from \"+(st??i.posts.length)+\" Week \"+N+\" posts\"+(J!==null?\" and \"+J+\" comments\":\"\")+(F?\" in a synthetic test dataset.\":\" on Yellowdig.\"),\"Numbers are counted in code. Summaries are AI-drafted and evidence-checked against the posts; they have not been reviewed by an instructor.\",r?r+(r===1?\" statement that did\":\" statements that did\")+\" not pass evidence review \"+(r===1?\"was\":\"were\")+\" left out.\":\"\"].filter(Boolean).join(\" \");return e('<tr><td style=\"border-top:1px solid '+l+\";padding:14px 0 0;font-family:\"+p+\";font-size:11px;line-height:1.6;color:\"+w+'\">'+o(nt)+\"</td></tr>\"),e(\"</table></td></tr></table></td></tr></table></body></html>\"),{html:W.join(\"\\n\")+\"\\n\",status:r?\"ready_with_omissions\":\"ready\",omittedClaims:r}}var et={manual:\"Manual Test (synthetic)\",route:\"Route Request\",source:\"Run 01 Fetch Events\",dataset:\"Run 02 Normalize and Join\",request:\"Editorial Request\",editorial:\"Run 04 Editorial Intelligence\"};var ot=n=>{let i=n.node(et.editorial),u=n.node(et.request),s=i?.draft;if(!s||!u)throw new Error(\"[EDITORIAL_FAILED] no editorial draft\");if(s.status===\"failed\"||!s.newsletter)throw new Error(\"[\"+(s.run?.errorCode??\"EDITORIAL_FAILED\")+\"] editorial run failed\");let r=tt({input:u.input,draft:s});return[{status:r.status,html:r.html,omittedClaims:r.omittedClaims}]};__obsSet(ot);})();\nconst __ctx = {\n  items: $input.all().map((i) => i.json),\n  node: (name) => { try { return $(name).first().json; } catch (e) { return null; } },\n  runIndex: $runIndex,\n  now: new Date().toISOString(),\n};\nreturn __run(__ctx).map((json) => ({ json }));\n" }, position: [3940, 120], onError: 'continueErrorOutput' },
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
  config: { name: 'Fail Run', parameters: { mode: 'runOnceForAllItems', language: 'javaScript', jsCode: "// CIS 515 Workflow Observatory · generated from web/src/n8n/nodes/wf05.ts (failRun) by web/scripts/build-n8n.ts. Do not edit in n8n.\nlet __run = null;\nconst __obsSet = (fn) => { __run = fn; };\n(()=>{var i=1800*1e3,s=/^[A-Z][A-Z0-9_]{2,63}$/;function r(e){let t=/\\[([A-Z][A-Z0-9_]{2,63})\\]/.exec(String(e??\"\"));return t&&s.test(t[1])?t[1]:\"GENERATION_FAILED\"}var n=e=>{let t=e.items[0]??{},o=typeof t.error==\"object\"&&t.error?t.error.message:t.error??t.message;return[{status:\"failed\",errorCode:r(o)}]};__obsSet(n);})();\nconst __ctx = {\n  items: $input.all().map((i) => i.json),\n  node: (name) => { try { return $(name).first().json; } catch (e) { return null; } },\n  runIndex: $runIndex,\n  now: new Date().toISOString(),\n};\nreturn __run(__ctx).map((json) => ({ json }));\n" }, position: [3280, 420] },
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
