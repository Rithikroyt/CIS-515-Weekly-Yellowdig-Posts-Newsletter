// CIS 515 Workflow Observatory · generated from web/src/n8n/nodes/wf01.ts (devRunConfig) by web/scripts/build-n8n.ts. Do not edit in n8n.
let __run = null;
const __obsSet = (fn) => { __run = fn; };
(()=>{var o={id:"topic-week-2",name:"WEEK 2 - WEEKLY WORKFLOW SHOW-AND-TELL ON YELLOWDIG"};var e={sourceMode:"fixture",week:2,startDate:"2026-10-23",endDate:"2026-10-28",timezone:"America/Phoenix",network:"carey-school-of-business",communityId:"6acd2896-76e7-400f-9a00-cfd657470859",topic:o.name};var s={"community/squuid":e.communityId,"community/title":"CIS 515 (synthetic)","community/network":e.network};var t=n=>[{...e,...n.items[0]??{}}];__obsSet(t);})();
const __ctx = {
  items: $input.all().map((i) => i.json),
  node: (name) => { try { return $(name).first().json; } catch (e) { return null; } },
  runIndex: $runIndex,
  now: new Date().toISOString(),
};
return __run(__ctx).map((json) => ({ json }));
