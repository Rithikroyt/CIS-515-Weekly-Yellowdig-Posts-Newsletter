// CIS 515 Workflow Observatory · generated from web/src/n8n/nodes/wf05.ts (syntheticRequest) by web/scripts/build-n8n.ts. Do not edit in n8n.
let __run = null;
const __obsSet = (fn) => { __run = fn; };
(()=>{var n=(e=>typeof require<"u"?require:typeof Proxy<"u"?new Proxy(e,{get:(o,r)=>(typeof require<"u"?require:o)[r]}):e)(function(e){if(typeof require<"u")return require.apply(this,arguments);throw Error('Dynamic require of "'+e+'" is not supported')});var t=n("crypto");var s=()=>[{action:"generate",week:2,runId:"r_"+(0,t.randomBytes)(12).toString("hex"),test:"synthetic"}];__obsSet(s);})();
const __ctx = {
  items: $input.all().map((i) => i.json),
  node: (name) => { try { return $(name).first().json; } catch (e) { return null; } },
  runIndex: $runIndex,
  now: new Date().toISOString(),
};
return __run(__ctx).map((json) => ({ json }));
