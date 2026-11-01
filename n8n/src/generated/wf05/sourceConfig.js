// CIS 515 Workflow Observatory · generated from web/src/n8n/nodes/wf05.ts (sourceConfig) by web/scripts/build-n8n.ts. Do not edit in n8n.
let __run = null;
const __obsSet = (fn) => { __run = fn; };
(()=>{var i={1:{week:1,topic:"Week 1 - Weekly Workflow Show-and-Tell on Yellowdig",startDate:"2026-10-14",endDate:"2026-10-28",verifiedOn:"2026-11-01"},2:{week:2,topic:"Week 2 - Weekly Workflow Show-and-Tell on Yellowdig",startDate:"2026-10-23",endDate:"2026-10-28",verifiedOn:"2026-11-01"},3:{week:3,topic:null,startDate:null,endDate:null,verifiedOn:null},4:{week:4,topic:null,startDate:null,endDate:null,verifiedOn:null},5:{week:5,topic:null,startDate:null,endDate:null,verifiedOn:null}};var o={network:"carey-school-of-business",communityId:"6acd2896-76e7-400f-9a00-cfd657470859",timezone:"America/Phoenix"};function s(n){return i[n]}var u={id:"topic-week-2",name:"WEEK 2 - WEEKLY WORKFLOW SHOW-AND-TELL ON YELLOWDIG"};var t={sourceMode:"fixture",week:2,startDate:"2026-10-23",endDate:"2026-10-28",timezone:"America/Phoenix",network:"carey-school-of-business",communityId:"6acd2896-76e7-400f-9a00-cfd657470859",topic:u.name};var l={"community/squuid":t.communityId,"community/title":"CIS 515 (synthetic)","community/network":t.network};var d={manual:"Manual Test (synthetic)",route:"Route Request",source:"Run 01 Fetch Events",dataset:"Run 02 Normalize and Join",request:"Editorial Request",editorial:"Run 04 Editorial Intelligence"};var a=n=>{let r=n.node(d.route);if(r.test==="synthetic")return[{...t}];let e=s(r.week);if(!e.topic||!e.startDate||!e.endDate)throw new Error("[WEEK_NOT_CONFIGURED] week "+r.week);return[{sourceMode:"yellowdig",week:e.week,startDate:e.startDate,endDate:e.endDate,topic:e.topic,...o,yellowdigCredentialConfigured:!0}]};__obsSet(a);})();
const __ctx = {
  items: $input.all().map((i) => i.json),
  node: (name) => { try { return $(name).first().json; } catch (e) { return null; } },
  runIndex: $runIndex,
  now: new Date().toISOString(),
};
return __run(__ctx).map((json) => ({ json }));
