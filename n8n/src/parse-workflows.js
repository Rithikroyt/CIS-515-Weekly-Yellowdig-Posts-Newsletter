// LEGACY (superseded in Phase 3 by web/src/lib/assets, bundled into n8n workflow 03). Kept for reference only;
// nothing imports it. Remove during cleanup after confirming no workflow still uses it.
// Dispatch · Parse — body of the "Parse · Extract pipelines and patterns" Code node.
// Pure code, no AI. Reads the canonical ingest payload and adds, per post, the workflow pipeline,
// node roles, detected patterns and newsletter chips, plus the week's stats.
const d = $input.first().json;

const lc = (s) => String(s || '').toLowerCase();
const asText = (x) => (typeof x === 'string' ? x : JSON.stringify(x || ''));
const NAME_WRITER_RE = /\b(writer|drafter|draft(ing)?|generat\w*|compos\w*|author)\b/;
const NAME_JUDGE_RE = /\b(score[rsd]?|scoring|judge|judging|evaluat\w*|rubric|critic|critique|reviewer|grader|quality ?gate)\b/;
const PROMPT_JUDGE_RE = /you are[^.\n]{0,80}\b(judge|critic|evaluator|grader|reviewer)\b|\b(score|rate|grade|evaluate)\s+(the|this|each|every)\s+(draft|output|answer|response|analysis|reply|email|summary|plan)\b/;
const MODEL_TYPE_RE = /langchain\.(agent|agenttool|chainllm|chainretrievalqa|chainsummarization|informationextractor|textclassifier|sentimentanalysis|openai|anthropic|googlegemini|mistralai|ollama|perplexity|groq|deepseek)$/;
const LOGIC_TYPE_RE = /\.(if|switch|filter|merge|splitinbatches|set|aggregate|splitout|sort|limit|removeduplicates|summarize|noop|datetime|itemlists|comparedatasets|executeworkflow|stopanderror|html|markdown|xml|crypto|renamekeys|converttofile|extractfromfile|compression|wait_for_time)$/;
const WRITE_OP_RE = /^(send|create|append|update|upsert|insert|post|delete|reply|add|draft|upload|move|copy|share|publish)/;

function cleanLabel(name) {
  const s = String(name || '')
    .replace(/[^\p{L}\p{N}\s&+/().,:'-]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return s.length > 28 ? s.slice(0, 27).trimEnd() + '…' : s;
}

function promptText(p) {
  const o = p.options || {};
  return lc([p.text, p.prompt, p.messages, p.systemMessage, o.systemMessage, p.instructions].map(asText).join(' '));
}

function classify(n) {
  const t = lc(n.type);
  const name = lc(n.name);
  const p = n.parameters || {};
  const op = lc(p.operation);
  if (t.endsWith('.stickynote')) return null;
  if (t.endsWith('trigger') || t.endsWith('.webhook')) return 'Trigger';
  if (op === 'sendandwait' || t.endsWith('.wait') || t === 'n8n-nodes-base.form') return 'Human';
  if (t.includes('memory')) return 'Memory';
  if (/(vectorstore|retriever|embeddings|documentloader|textsplitter|reranker)/.test(t)) return 'Retrieval';
  if (MODEL_TYPE_RE.test(t)) {
    if (NAME_JUDGE_RE.test(name)) return 'Judge';
    if (NAME_WRITER_RE.test(name)) return 'Model';
    return PROMPT_JUDGE_RE.test(promptText(p)) ? 'Judge' : 'Model';
  }
  if (/langchain\.(lmchat|lm|outputparser|tool|mcpclienttool|code)/.test(t)) return 'SubNode';
  if (/\.(code|function|functionitem)$/.test(t)) return 'Code';
  if (LOGIC_TYPE_RE.test(t)) return 'Logic';
  if (t.endsWith('.respondtowebhook')) return 'Action';
  if (t.endsWith('.datatable')) return WRITE_OP_RE.test(op) ? 'Action' : 'Tool';
  if (t.endsWith('.httprequest')) return /^(post|put|patch|delete)$/.test(lc(p.method)) ? 'Action' : 'Tool';
  if (WRITE_OP_RE.test(op)) return 'Action';
  if (/(gmail|slack|telegram|discord|emailsend|microsoftteams|whatsapp|twilio)/.test(t) && !op) return 'Action';
  return 'Tool';
}

function mainEdges(wf) {
  const edges = {};
  const conns = wf.connections || {};
  for (const src of Object.keys(conns)) {
    const outs = (conns[src] && conns[src].main) || [];
    edges[src] = [];
    outs.forEach((list) => (list || []).forEach((c) => { if (c && c.node) edges[src].push(c.node); }));
  }
  return edges;
}

// Tarjan's strongly connected components over main connections.
function sccs(names, edges) {
  let index = 0;
  const idx = {};
  const low = {};
  const onStack = {};
  const stack = [];
  const out = [];
  function strong(v) {
    idx[v] = index; low[v] = index; index += 1;
    stack.push(v); onStack[v] = true;
    for (const w of edges[v] || []) {
      if (idx[w] === undefined) { strong(w); low[v] = Math.min(low[v], low[w]); }
      else if (onStack[w]) low[v] = Math.min(low[v], idx[w]);
    }
    if (low[v] === idx[v]) {
      const comp = [];
      let w;
      do { w = stack.pop(); onStack[w] = false; comp.push(w); } while (w !== v);
      const selfLoop = (edges[v] || []).includes(v);
      if (comp.length > 1 || selfLoop) out.push(comp);
    }
  }
  names.forEach((n) => { if (idx[n] === undefined) strong(n); });
  return out;
}

function findThreshold(nodes, roleOf) {
  const candidates = [];
  const numRe = '(\\d+(?:\\.\\d+)?)';
  const cmpAfter = new RegExp('score\\w*["\\]\\)\\s]*(>=|>|<=|<|≥)\\s*' + numRe);
  const cmpBefore = new RegExp(numRe + '\\s*(<=|<|>=|>)\\s*\\$?\\w*\\.?\\w*score');
  const prose = new RegExp('(?:at least|minimum(?: of)?|threshold(?: of| is|:)?|pass(?:es|ing)?(?: at| with| score(?: of| is)?)?)\\s*' + numRe + '(?:\\s*(?:/|out of)\\s*(\\d+))?');
  const proseB = new RegExp(numRe + '\\s*(?:/|out of)\\s*(\\d+)\\s*(?:or (?:higher|above|more)|to pass|passes)');
  const named = new RegExp('(?:quality|pass(?:ing)?|min(?:imum)?|score|judge)_?(?:threshold|score|min|cutoff)["\']?\\s*[:=]\\s*' + numRe + '(?:[^\\n]{0,60}?(\\d+)\\s*-\\s*(\\d+)\\s*scale)?');
  for (const n of nodes) {
    const role = roleOf[n.name];
    const t = lc(n.type);
    const p = n.parameters || {};
    if (role) {
      const m = lc(JSON.stringify(p)).match(named);
      if (m) candidates.push({ value: Number(m[1]), out_of: m[3] ? Number(m[3]) : null, source_node: n.name, rank: 0 });
    }
    if (/\.(if|switch|filter)$/.test(t)) {
      const conds = JSON.stringify(p);
      const m = conds.match(/"leftValue":"[^"]*score[^"]*"[^{}]*?"rightValue":"?(\d+(?:\.\d+)?)/i);
      if (m) candidates.push({ value: Number(m[1]), out_of: null, source_node: n.name, rank: 1 });
    }
    if (role === 'Code' || /\.(if|switch|filter)$/.test(t)) {
      const code = lc(asText(p.jsCode || p.functionCode || ''));
      let m = code.match(cmpAfter);
      if (m) candidates.push({ value: Number(m[2]), out_of: null, source_node: n.name, rank: 2 });
      else { m = code.match(cmpBefore); if (m) candidates.push({ value: Number(m[1]), out_of: null, source_node: n.name, rank: 2 }); }
    }
    if (role === 'Judge') {
      const text = promptText(p);
      let m = text.match(proseB);
      if (m) candidates.push({ value: Number(m[1]), out_of: Number(m[2]), source_node: n.name, rank: 3 });
      else { m = text.match(prose); if (m) candidates.push({ value: Number(m[1]), out_of: m[2] ? Number(m[2]) : null, source_node: n.name, rank: 4 }); }
    }
  }
  candidates.sort((a, b) => a.rank - b.rank || a.source_node.localeCompare(b.source_node));
  if (!candidates.length) return null;
  const best = candidates[0];
  return { value: best.value, out_of: best.out_of, source_node: best.source_node };
}

function buildChips(pipeline) {
  const groups = [];
  for (const step of pipeline) {
    const last = groups[groups.length - 1];
    if (last && last.role === step.role) last.count += 1;
    else groups.push({ role: step.role, label: cleanLabel(step.name), count: 1 });
  }
  const chips = groups.map((g, i) => ({ role: g.role, label: g.count > 1 ? g.label + ' ×' + g.count : g.label, nodes: g.count, order: i }));
  if (chips.length <= 7) return chips.map(({ order, ...c }) => c);
  // Too long: keep a skeleton of the build in pipeline order.
  // Priority: trigger, AI steps and human steps, then the first tool, the last action, then the rest.
  const pick = new Set();
  const add = (c) => { if (c && pick.size < 7) pick.add(c.order); };
  add(chips.find((c) => c.role === 'Trigger'));
  chips.filter((c) => ['Model', 'Judge', 'Human'].includes(c.role)).forEach(add);
  add(chips.find((c) => c.role === 'Tool' || c.role === 'Retrieval'));
  add([...chips].reverse().find((c) => c.role === 'Action'));
  chips.filter((c) => c.role !== 'Logic' && c.role !== 'Code').forEach(add);
  chips.forEach(add);
  return chips.filter((c) => pick.has(c.order)).map(({ order, ...c }) => c);
}

function analyze(file) {
  const wf = file.json;
  if (!wf || !Array.isArray(wf.nodes)) return null;
  const nodes = wf.nodes.filter((n) => n && n.name);
  const byName = {};
  const roleOf = {};
  nodes.forEach((n) => { byName[n.name] = n; roleOf[n.name] = classify(n); });
  const edges = mainEdges(wf);
  const pos = (name) => (byName[name] && byName[name].position) || [0, 0];

  const triggers = nodes.filter((n) => roleOf[n.name] === 'Trigger')
    .sort((a, b) => pos(a.name)[0] - pos(b.name)[0] || pos(a.name)[1] - pos(b.name)[1] || a.name.localeCompare(b.name));
  function reach(start) {
    const depth = {};
    depth[start] = 0;
    const queue = [start];
    while (queue.length) {
      const v = queue.shift();
      for (const w of edges[v] || []) if (depth[w] === undefined && byName[w]) { depth[w] = depth[v] + 1; queue.push(w); }
    }
    return depth;
  }
  // Main pipeline: the trigger whose path reaches the most AI steps, then the most nodes.
  let main = null;
  for (const t of triggers) {
    const r = reach(t.name);
    const ai = Object.keys(r).filter((n) => roleOf[n] === 'Model' || roleOf[n] === 'Judge').length;
    const size = Object.keys(r).length;
    if (!main || ai > main.ai || (ai === main.ai && size > main.size)) main = { trigger: t.name, depth: r, ai, size };
  }
  const order = main ? Object.keys(main.depth).sort((a, b) => main.depth[a] - main.depth[b] || pos(a)[0] - pos(b)[0] || pos(a)[1] - pos(b)[1] || a.localeCompare(b)) : [];
  const pipeline = order.filter((n) => roleOf[n] && roleOf[n] !== 'SubNode')
    .map((n) => ({ name: n, type: byName[n].type, role: roleOf[n] }));

  const all = nodes.filter((n) => roleOf[n.name] && roleOf[n.name] !== 'SubNode');
  const judges = all.filter((n) => roleOf[n.name] === 'Judge').map((n) => n.name).sort();
  const models = all.filter((n) => roleOf[n.name] === 'Model' || roleOf[n.name] === 'Judge');
  const humans = all.filter((n) => roleOf[n.name] === 'Human').map((n) => n.name).sort();

  const loops = sccs(nodes.map((n) => n.name), edges);
  const revisionCycles = loops.filter((c) => c.some((n) => roleOf[n] === 'Model' || roleOf[n] === 'Judge') && !c.some((n) => lc(byName[n] && byName[n].type).endsWith('.splitinbatches')));
  const namedRevision = all.filter((n) => /revis|refine|rewrite|retry|regenerat/.test(lc(n.name)) && (roleOf[n.name] === 'Model' || roleOf[n.name] === 'Judge')).map((n) => n.name).sort();
  const revision = revisionCycles.length > 0 || (namedRevision.length > 0 && judges.length > 0);

  const errorHandling = nodes.some((n) => /continue/.test(lc(n.onError)) || n.retryOnFail === true || /\.(errortrigger|stopanderror)$/.test(lc(n.type)))
    || Boolean(wf.settings && wf.settings.errorWorkflow);

  const patterns = {
    llm_judge: judges.length > 0,
    judge_nodes: judges,
    score_threshold: findThreshold(nodes, roleOf),
    revision_loop: revision,
    revision_evidence: revisionCycles.length ? 'graph cycle' : (revision ? 'revision step after judge' : ''),
    human_in_the_loop: humans.length > 0,
    human_nodes: humans,
    multi_agent: models.length >= 2,
    model_count: models.length,
    rag: nodes.some((n) => roleOf[n.name] === 'Retrieval'),
    memory: nodes.some((n) => roleOf[n.name] === 'Memory'),
    error_handling: errorHandling
  };
  const patternList = ['llm_judge', 'score_threshold', 'revision_loop', 'human_in_the_loop', 'multi_agent', 'rag', 'memory', 'error_handling']
    .filter((k) => Boolean(patterns[k]));
  const roleCounts = {};
  all.forEach((n) => { roleCounts[roleOf[n.name]] = (roleCounts[roleOf[n.name]] || 0) + 1; });

  return {
    file_name: file.file_name,
    workflow_name: String(wf.name || ''),
    node_count: all.length,
    trigger: main ? main.trigger : '',
    trigger_count: triggers.length,
    role_counts: roleCounts,
    pipeline,
    chips: buildChips(pipeline),
    patterns,
    pattern_list: patternList
  };
}

const analysesByFile = {};
for (const f of d.workflow_files) analysesByFile[f.file_name] = analyze(f);

const posts = d.posts.map((p) => {
  const a = p.workflow_file_name ? analysesByFile[p.workflow_file_name] || null : null;
  return { ...p, analysis: a };
});

const PATTERN_LABELS = {
  llm_judge: 'used an AI judge',
  score_threshold: 'set a score threshold',
  revision_loop: 'had a revision loop',
  human_in_the_loop: 'added a human approval step',
  multi_agent: 'used two or more AI models',
  rag: 'used retrieval (RAG)',
  memory: 'used memory',
  error_handling: 'handled errors explicitly'
};
const builds = posts.length;
const withFile = posts.filter((p) => p.analysis);
const patternCounts = {};
Object.keys(PATTERN_LABELS).forEach((k) => { patternCounts[k] = withFile.filter((p) => p.analysis.pattern_list.includes(k)).length; });
const postImages = posts.reduce((s, p) => s + (Number(p.image_count) || 0), 0);
const stats = {
  week: d.week,
  builds,
  comments: posts.reduce((s, p) => s + p.comments.length, 0),
  workflow_files: d.workflow_files.filter((f) => f.json).length,
  images: postImages || Number(d.ingest_report && d.ingest_report.uploaded_image_count) || 0,
  builds_with_file: withFile.length,
  pattern_counts: patternCounts,
  pattern_summary: Object.keys(PATTERN_LABELS)
    .filter((k) => patternCounts[k] > 0)
    .sort((a, b) => patternCounts[b] - patternCounts[a] || a.localeCompare(b))
    .map((k) => patternCounts[k] + ' of ' + builds + ' builds ' + PATTERN_LABELS[k])
};

const unmatched = d.workflow_files.filter((f) => !f.post_id && f.json).map((f) => analysesByFile[f.file_name]);

return [{ json: {
  week: d.week, date_range: d.date_range, editor: d.editor,
  posts,
  workflow_files: d.workflow_files.map((f) => ({ file_name: f.file_name, author: f.author, post_id: f.post_id, match_method: f.match_method, error: f.error })),
  unmatched_file_analyses: unmatched,
  stats,
  ingest_report: d.ingest_report
} }];
