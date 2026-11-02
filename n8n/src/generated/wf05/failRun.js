// CIS 515 Workflow Observatory · generated from web/src/n8n/nodes/wf05.ts (failRun) by web/scripts/build-n8n.ts. Do not edit in n8n.
let __run = null;
const __obsSet = (fn) => { __run = fn; };
(()=>{var a=1800*1e3,i=/^[A-Z][A-Z0-9_]{2,63}$/;function n(t){let e=/\[([A-Z][A-Z0-9_]{2,63})\]/.exec(String(t??""));return e&&i.test(e[1])?e[1]:"GENERATION_FAILED"}function o(t){return String(t??"").replace(/[^A-Za-z0-9 _/.:;,()#\[\]<>=-]+/g," ").replace(/\s+/g," ").trim().slice(0,240)}var s=t=>{let e=t.items[0]??{},r=typeof e.error=="object"&&e.error?e.error.message:e.error??e.message;return[{status:"failed",errorCode:n(r),errorDetail:o(r)}]};__obsSet(s);})();
const __ctx = {
  items: $input.all().map((i) => i.json),
  node: (name) => { try { return $(name).first().json; } catch (e) { return null; } },
  runIndex: $runIndex,
  now: new Date().toISOString(),
};
return __run(__ctx).map((json) => ({ json }));
