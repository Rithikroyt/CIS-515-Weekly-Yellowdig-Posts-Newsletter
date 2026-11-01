// CIS 515 Workflow Observatory · generated from web/src/n8n/nodes/wf01.ts (dedupe) by web/scripts/build-n8n.ts. Do not edit in n8n.
let __run = null;
const __obsSet = (fn) => { __run = fn; };
(()=>{function s(e){if(e===null||typeof e!="object")return JSON.stringify(e);if(Array.isArray(e))return"["+e.map(s).join(",")+"]";let t=e;return"{"+Object.keys(t).filter(n=>t[n]!==void 0).sort().map(n=>JSON.stringify(n)+":"+s(t[n])).join(",")+"}"}function u(e){let t=new Map,n=[],r=0;return e.forEach(o=>{let i=s(o),a=t.get(o.eventId);a===void 0?(t.set(o.eventId,i),n.push(o)):a!==i&&(r+=1)}),{events:n,duplicateEventsRemoved:e.length-n.length,conflictingDuplicates:r}}function c(e){let t=u(e.events);return{...e,events:t.events,capabilities:{reactionEvents:t.events.some(n=>n.type==="reaction"),viewEvents:t.events.some(n=>n.type==="view")},diagnostics:{...e.diagnostics,eventsAfterDeduplication:t.events.length,duplicateEventsRemoved:t.duplicateEventsRemoved,conflictingDuplicates:t.conflictingDuplicates}}}var d=e=>[c(e.items[0])];__obsSet(d);})();
const __ctx = {
  items: $input.all().map((i) => i.json),
  node: (name) => { try { return $(name).first().json; } catch (e) { return null; } },
  runIndex: $runIndex,
  now: new Date().toISOString(),
};
return __run(__ctx).map((json) => ({ json }));
