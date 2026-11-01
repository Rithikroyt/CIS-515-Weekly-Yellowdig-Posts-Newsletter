// CIS 515 Workflow Observatory · generated from web/src/n8n/nodes/wf05.ts (statusReply) by web/scripts/build-n8n.ts. Do not edit in n8n.
let __run = null;
const __obsSet = (fn) => { __run = fn; };
(()=>{var l=new Set(["ready","ready_with_omissions","failed"]),c=1800*1e3,p=/^[A-Z][A-Z0-9_]{2,63}$/;var f=(t,n)=>{let o=Date.parse(String(t.updatedAt??t.createdAt??""));return Number.isFinite(o)&&Date.parse(n)-o>c};function a(t,n,o){let e=t.find(d=>d.run_id===n.runId);if(!e)return{found:!1};let r=String(e.status),s=typeof e.error_code=="string"&&p.test(e.error_code)?e.error_code:null;!l.has(r)&&f(e,o)&&(r="failed",s="RUN_STALE");let i={found:!0,runId:n.runId,week:Number(e.week),status:r,errorCode:r==="failed"?s??"GENERATION_FAILED":null,omittedClaims:Number.isInteger(e.omitted_claims)?e.omitted_claims:0,updatedAt:typeof e.updatedAt=="string"?e.updatedAt:null};return n.action==="artifact"&&(r==="ready"||r==="ready_with_omissions")&&typeof e.html=="string"&&(i.html=e.html),i}var m={manual:"Manual Test (synthetic)",route:"Route Request",source:"Run 01 Fetch Events",dataset:"Run 02 Normalize and Join",assets:"Collect Assets",request:"Editorial Request",editorial:"Run 04 Editorial Intelligence"};var u=t=>{let n=t.node(m.route);return[a(t.items,n,t.now)]};__obsSet(u);})();
const __ctx = {
  items: $input.all().map((i) => i.json),
  node: (name) => { try { return $(name).first().json; } catch (e) { return null; } },
  runIndex: $runIndex,
  now: new Date().toISOString(),
};
return __run(__ctx).map((json) => ({ json }));
