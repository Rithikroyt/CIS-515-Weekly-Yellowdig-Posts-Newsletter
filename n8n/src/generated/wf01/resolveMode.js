// CIS 515 Workflow Observatory · generated from web/src/n8n/nodes/wf01.ts (resolveMode) by web/scripts/build-n8n.ts. Do not edit in n8n.
let __run = null;
const __obsSet = (fn) => { __run = fn; };
(()=>{var r={calledByWorkflow:"When Called by Another Workflow",devRunConfig:"Dev Run Config",validateConfig:"Validate Run Configuration",resolveMode:"Resolve Source Mode",checkCapability:"Check Capability",classifyFailure:"Classify Fetch Failure"};var s="https://data.yellowdig.app";var o=class extends Error{constructor(t,n,u=null){super("["+t+"] "+n),this.name="SourceError",this.code=t,this.httpStatus=u}};function a(e){if(e.sourceMode==="fixture")return{route:"fixture",fallbackReason:"FIXTURE_FORCED"};if(e.yellowdigCredentialConfigured)return{route:"yellowdig",fallbackReason:"NONE"};if(e.sourceMode==="yellowdig")throw new o("YELLOWDIG_CREDENTIAL_NOT_CONFIGURED","sourceMode is yellowdig but no Yellowdig credential is configured");return{route:"fixture",fallbackReason:"YELLOWDIG_CREDENTIAL_NOT_CONFIGURED"}}function i(e,t){return t+"/network/"+encodeURIComponent(e.network)+"/community/"+encodeURIComponent(e.communityId)+"/events"}var d=e=>e.node(r.validateConfig).config;var c=e=>{let t=d(e),n=a(t);return[{route:n.route,fallbackReason:n.fallbackReason,sourceModeRequested:t.sourceMode,request:{url:i(t,s),probeLimit:10,pageSize:t.pageSize,maxPages:t.maxPages}}]};__obsSet(c);})();
const __ctx = {
  items: $input.all().map((i) => i.json),
  node: (name) => { try { return $(name).first().json; } catch (e) { return null; } },
  runIndex: $runIndex,
  now: new Date().toISOString(),
};
return __run(__ctx).map((json) => ({ json }));
