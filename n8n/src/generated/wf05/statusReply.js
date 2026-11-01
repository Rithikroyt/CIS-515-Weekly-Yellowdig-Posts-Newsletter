// CIS 515 Workflow Observatory · generated from web/src/n8n/nodes/wf05.ts (statusReply) by web/scripts/build-n8n.ts. Do not edit in n8n.
let __run = null;
const __obsSet = (fn) => { __run = fn; };
(()=>{var c=new Set(["ready","ready_with_omissions","failed"]),l=1800*1e3,p=/^[A-Z][A-Z0-9_]{2,63}$/;var w=(e,r)=>{let o=Date.parse(String(e.updatedAt??e.createdAt??""));return Number.isFinite(o)&&Date.parse(r)-o>l};function u(e,r,o){let t=e.find(d=>d.run_id===r.runId);if(!t)return{found:!1};let n=String(t.status),s=typeof t.error_code=="string"&&p.test(t.error_code)?t.error_code:null;!c.has(n)&&w(t,o)&&(n="failed",s="RUN_STALE");let i={found:!0,runId:r.runId,week:Number(t.week),status:n,errorCode:n==="failed"?s??"GENERATION_FAILED":null,omittedClaims:Number.isInteger(t.omitted_claims)?t.omitted_claims:0,updatedAt:typeof t.updatedAt=="string"?t.updatedAt:null};return r.action==="artifact"&&(n==="ready"||n==="ready_with_omissions")&&typeof t.html=="string"&&(i.html=t.html),i}var f={manual:"Manual Test (synthetic)",route:"Route Request",source:"Run 01 Fetch Events",dataset:"Run 02 Normalize and Join",request:"Editorial Request",editorial:"Run 04 Editorial Intelligence"};var a=e=>{let r=e.node(f.route);return[u(e.items,r,e.now)]};__obsSet(a);})();
const __ctx = {
  items: $input.all().map((i) => i.json),
  node: (name) => { try { return $(name).first().json; } catch (e) { return null; } },
  runIndex: $runIndex,
  now: new Date().toISOString(),
};
return __run(__ctx).map((json) => ({ json }));
