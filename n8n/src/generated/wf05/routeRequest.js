// CIS 515 Workflow Observatory · generated from web/src/n8n/nodes/wf05.ts (routeRequest) by web/scripts/build-n8n.ts. Do not edit in n8n.
let __run = null;
const __obsSet = (fn) => { __run = fn; };
(()=>{var c={1:{week:1,topic:"Week 1 - Weekly Workflow Show-and-Tell on Yellowdig",startDate:"2026-10-14",endDate:"2026-10-28",verifiedOn:"2026-11-01"},2:{week:2,topic:"Week 2 - Weekly Workflow Show-and-Tell on Yellowdig",startDate:"2026-10-23",endDate:"2026-10-28",verifiedOn:"2026-11-01"},3:{week:3,topic:null,startDate:null,endDate:null,verifiedOn:null},4:{week:4,topic:null,startDate:null,endDate:null,verifiedOn:null},5:{week:5,topic:null,startDate:null,endDate:null,verifiedOn:null}};function i(e){return typeof e=="number"&&Number.isInteger(e)&&e>=1&&e<=5?e:null}function a(e){return c[e]}var p=/^r_[a-f0-9]{24}$/;var k=1800*1e3;var u=32;function d(e,n){let t=e&&typeof e=="object"&&!Array.isArray(e)?e:{},r=typeof t.runId=="string"&&p.test(t.runId)?t.runId:null;if(!r)return{action:"reject",errorCode:"INVALID_RUN_ID"};if(t.action==="status"||t.action==="artifact")return{action:t.action,runId:r};if(t.action!=="generate")return{action:"reject",errorCode:"INVALID_ACTION"};let o=i(t.week);if(o===null)return{action:"reject",errorCode:"INVALID_WEEK"};let s=n&&t.test==="synthetic"?"synthetic":null;return!s&&!a(o).topic?{action:"reject",errorCode:"WEEK_NOT_CONFIGURED"}:!s&&(typeof t.pseudonymSalt!="string"||t.pseudonymSalt.length<u)?{action:"reject",errorCode:"SALT_NOT_CONFIGURED"}:{action:"generate",week:o,runId:r,test:s}}var f={manual:"Manual Test (synthetic)",route:"Route Request",source:"Run 01 Fetch Events",dataset:"Run 02 Normalize and Join",request:"Editorial Request",editorial:"Run 04 Editorial Intelligence"};var l=e=>{let n=e.node(f.manual)!==null,t=e.items[0]??{};return[d(n?t:t.body,n)]};__obsSet(l);})();
const __ctx = {
  items: $input.all().map((i) => i.json),
  node: (name) => { try { return $(name).first().json; } catch (e) { return null; } },
  runIndex: $runIndex,
  now: new Date().toISOString(),
};
return __run(__ctx).map((json) => ({ json }));
