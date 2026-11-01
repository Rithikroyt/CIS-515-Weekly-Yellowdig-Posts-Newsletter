// CIS 515 Workflow Observatory · generated from web/src/n8n/nodes/wf02.ts (classifyEvents) by web/scripts/build-n8n.ts. Do not edit in n8n.
let __run = null;
const __obsSet = (fn) => { __run = fn; };
(()=>{var s=["post","comment","reaction","view"];function c(e){let o={post:[],comment:[],reaction:[],view:[]},n=0;return e.forEach(t=>{s.includes(t.type)?o[t.type].push(t):n+=1}),{...o,unknownEventTypes:n}}function r(e){return{bundle:e,...c(e.events)}}var i=e=>[r(e.items[0])];__obsSet(i);})();
const __ctx = {
  items: $input.all().map((i) => i.json),
  node: (name) => { try { return $(name).first().json; } catch (e) { return null; } },
  runIndex: $runIndex,
  now: new Date().toISOString(),
};
return __run(__ctx).map((json) => ({ json }));
