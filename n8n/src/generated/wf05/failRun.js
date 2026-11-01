// CIS 515 Workflow Observatory · generated from web/src/n8n/nodes/wf05.ts (failRun) by web/scripts/build-n8n.ts. Do not edit in n8n.
let __run = null;
const __obsSet = (fn) => { __run = fn; };
(()=>{var i=1800*1e3,s=/^[A-Z][A-Z0-9_]{2,63}$/;function r(t){let e=/\[([A-Z][A-Z0-9_]{2,63})\]/.exec(String(t??""));return e&&s.test(e[1])?e[1]:"GENERATION_FAILED"}var n=t=>{let e=t.items[0]??{},o=typeof e.error=="object"&&e.error?e.error.message:e.error??e.message;return[{status:"failed",errorCode:r(o)}]};__obsSet(n);})();
const __ctx = {
  items: $input.all().map((i) => i.json),
  node: (name) => { try { return $(name).first().json; } catch (e) { return null; } },
  runIndex: $runIndex,
  now: new Date().toISOString(),
};
return __run(__ctx).map((json) => ({ json }));
