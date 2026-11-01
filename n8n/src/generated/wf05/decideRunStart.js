// CIS 515 Workflow Observatory · generated from web/src/n8n/nodes/wf05.ts (decideRunStart) by web/scripts/build-n8n.ts. Do not edit in n8n.
let __run = null;
const __obsSet = (fn) => { __run = fn; };
(()=>{var u=new Set(["ready","ready_with_omissions","failed"]),a=1800*1e3;var d=(t,e)=>{let r=Date.parse(String(t.updatedAt??t.createdAt??""));return Number.isFinite(r)&&Date.parse(e)-r>a};function s(t,e,r){let o=t.find(n=>typeof n.run_id=="string"&&Number(n.week)===e.week&&!u.has(String(n.status))&&!d(n,r));return o?{reuse:!0,runId:String(o.run_id),week:e.week,status:String(o.status)}:{reuse:!1,runId:e.runId,week:e.week,status:"queued"}}var c={manual:"Manual Test (synthetic)",route:"Route Request",source:"Run 01 Fetch Events",dataset:"Run 02 Normalize and Join",request:"Editorial Request",editorial:"Run 04 Editorial Intelligence"};var i=t=>{let e=t.node(c.route);return[s(t.items,e,t.now)]};__obsSet(i);})();
const __ctx = {
  items: $input.all().map((i) => i.json),
  node: (name) => { try { return $(name).first().json; } catch (e) { return null; } },
  runIndex: $runIndex,
  now: new Date().toISOString(),
};
return __run(__ctx).map((json) => ({ json }));
