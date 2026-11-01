// CIS 515 Workflow Observatory · generated from web/src/n8n/nodes/wf05.ts (decideRunStart) by web/scripts/build-n8n.ts. Do not edit in n8n.
let __run = null;
const __obsSet = (fn) => { __run = fn; };
(()=>{var a=new Set(["ready","ready_with_omissions","failed"]),u=1800*1e3;var d=(e,t)=>{let r=Date.parse(String(e.updatedAt??e.createdAt??""));return Number.isFinite(r)&&Date.parse(t)-r>u};function s(e,t,r){let o=e.find(n=>typeof n.run_id=="string"&&Number(n.week)===t.week&&!a.has(String(n.status))&&!d(n,r));return o?{reuse:!0,runId:String(o.run_id),week:t.week,status:String(o.status)}:{reuse:!1,runId:t.runId,week:t.week,status:"queued"}}var l={manual:"Manual Test (synthetic)",route:"Route Request",source:"Run 01 Fetch Events",dataset:"Run 02 Normalize and Join",assets:"Collect Assets",request:"Editorial Request",editorial:"Run 04 Editorial Intelligence"};var i=e=>{let t=e.node(l.route);return[s(e.items,t,e.now)]};__obsSet(i);})();
const __ctx = {
  items: $input.all().map((i) => i.json),
  node: (name) => { try { return $(name).first().json; } catch (e) { return null; } },
  runIndex: $runIndex,
  now: new Date().toISOString(),
};
return __run(__ctx).map((json) => ({ json }));
