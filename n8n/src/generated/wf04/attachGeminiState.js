// CIS 515 Workflow Observatory · generated from web/src/n8n/nodes/wf04.ts (attachGeminiState) by web/scripts/build-n8n.ts. Do not edit in n8n.
let __run = null;
const __obsSet = (fn) => { __run = fn; };
(()=>{var i=class extends Error{constructor(r,n){super("["+r+"] "+n);this.code=r;this.name="EditorialError"}};function l(t){let e=t??{},r=typeof e.error=="string"?{message:e.error}:e.error;if(r){let o=String(r.message??r.description??"provider error").slice(0,160);return{ok:!1,code:/timeout|timed out|ETIMEDOUT|ECONNABORTED/i.test(o)?"MODEL_TIMEOUT":"MODEL_PROVIDER_ERROR",detail:o}}let n=e.promptFeedback?.blockReason;if(n)return{ok:!1,code:"MODEL_PROVIDER_ERROR",detail:"blocked by provider: "+String(n)};let s=e.candidates?.[0],a=(s?.content?.parts??[]).map(o=>o.text??"").join("");return a?{ok:!0,text:a}:{ok:!1,code:"MODEL_PROVIDER_ERROR",detail:"empty response (finishReason "+String(s?.finishReason??"unknown")+")"}}var p=t=>{let e=t.node("Use Mock Model?");if(!e?.state)throw new i("MODEL_PROVIDER_ERROR","run state missing before the Gemini call");return[{state:e.state,scenario:null,stepCount:e.state.steps,modelResponse:l(t.items[0])}]};__obsSet(p);})();
const __ctx = {
  items: $input.all().map((i) => i.json),
  node: (name) => { try { return $(name).first().json; } catch (e) { return null; } },
  runIndex: $runIndex,
  now: new Date().toISOString(),
};
return __run(__ctx).map((json) => ({ json }));
