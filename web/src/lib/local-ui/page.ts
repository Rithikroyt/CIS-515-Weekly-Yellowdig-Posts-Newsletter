// The local finalize page. Self-contained: inline CSS and script, no external resources. All text from the
// newsletter is inserted with textContent, never as HTML.
export const PAGE = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Finalize newsletter images</title>
<style>
:root { --ink:#1A1A1A; --muted:#555; --line:#D4D4D4; --maroon:#8C1D40; --bg:#F2F2F2; --ok:#1E6B3A; --warn:#9A5B00; --bad:#A3122B; }
* { box-sizing: border-box; }
body { margin:0; background:var(--bg); color:var(--ink); font:15px/1.5 Arial, Helvetica, sans-serif; }
main { max-width:900px; margin:0 auto; padding:28px 16px 64px; }
h1 { font:normal 30px/1.2 Georgia, serif; margin:0 0 4px; }
.sub { color:var(--muted); margin:0 0 22px; }
section { background:#fff; border:1px solid var(--line); padding:18px 20px; margin:0 0 16px; }
h2 { font-size:12px; letter-spacing:2px; text-transform:uppercase; color:var(--maroon); margin:0 0 12px; }
label { display:block; font-weight:bold; margin:10px 0 4px; }
input[type=text], textarea { width:100%; padding:8px 10px; border:1px solid #999; font:14px/1.4 Arial, sans-serif; }
textarea { min-height:64px; }
button { background:var(--ink); color:#fff; border:0; padding:9px 16px; font-weight:bold; cursor:pointer; margin-top:10px; }
button:disabled { opacity:.5; cursor:default; }
.card h3 { font:normal 20px/1.25 Georgia, serif; margin:0; }
.meta { color:var(--muted); font-size:13px; margin:2px 0 8px; }
.meta a { color:var(--maroon); }
.thumbs { display:flex; flex-wrap:wrap; gap:12px; margin-top:12px; }
.thumb { width:200px; border:1px solid var(--line); padding:8px; font-size:12px; }
.thumb img { display:block; max-width:100%; max-height:130px; margin:0 auto 6px; background:#F7F7F7; }
.fit-good { color:var(--ok); } .fit-weak { color:var(--warn); } .fit-poor { color:var(--bad); font-weight:bold; }
.msg { margin-top:10px; font-size:14px; }
.err { color:var(--bad); } .note { color:var(--muted); font-size:13px; }
.warnbox { border-left:4px solid var(--warn); padding:6px 10px; background:#FFF6E8; margin-top:10px; }
.done { border-left:4px solid var(--ok); padding:8px 12px; background:#EEF8EF; }
code { background:#F2F2F2; padding:1px 4px; }
</style></head><body><main>
<h1>Finalize newsletter images</h1>
<p class="sub">Runs only on this computer (127.0.0.1). Images are downloaded from Yellowdig into the folder you choose and embedded into the newsletter here. Nothing is uploaded.</p>

<section id="step-open"><h2>1 · Open the generated newsletter</h2>
<label for="html">Newsletter HTML (downloaded from the generator)</label><input id="html" type="file" accept=".html,.htm,text/html">
<label for="workdir">Folder for this week's images and the finished files (full path, outside the project)</label>
<input id="workdir" type="text" placeholder="C:\\Users\\you\\OneDrive\\Desktop\\Week 3 images">
<button id="open">Open newsletter</button><div id="open-msg" class="msg"></div></section>

<div id="slots"></div>

<section id="step-final" hidden><h2>3 · Finalize</h2>
<label for="name">File name for the finished newsletter</label><input id="name" type="text">
<label><input id="pdf" type="checkbox" checked> Also make a PDF</label>
<div id="hero-warn"></div>
<button id="finalize">Finalize Newsletter</button><div id="final-msg" class="msg"></div></section>
</main>
<script>
const TOKEN = "__TOKEN__";
const $ = (id) => document.getElementById(id);
const el = (tag, attrs, ...kids) => { const e = document.createElement(tag); for (const [k, v] of Object.entries(attrs || {})) { if (k === "text") e.textContent = v; else e.setAttribute(k, v); } kids.forEach((c) => c && e.appendChild(c)); return e; };
async function api(path, body) {
  const r = await fetch("/api/" + path, { method: "POST", headers: { "content-type": "application/json", "x-finalize-token": TOKEN }, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({ error: "unexpected response" }));
  if (!r.ok) throw new Error(j.error || ("HTTP " + r.status));
  return j;
}
const state = { slots: [], images: {}, use: {}, hero: null, heroFrom: null, heroTouched: false };

function slotLabel(s) { return s.slot === "hero" ? "Hero image" : s.slot.replace("spotlight-", "Spotlight "); }

function renderSlots() {
  const box = $("slots"); box.textContent = "";
  const head = el("section", {}, el("h2", { text: "2 · Paste Yellowdig image addresses" }),
    el("p", { class: "note", text: "Open each post, right-click the screenshot, choose “Copy image address”, and paste it below (one address per line; several are fine). Then pick which image each spotlight uses, and which one is the hero." }));
  box.appendChild(head);
  for (const s of state.slots) {
    const card = el("section", { class: "card" });
    card.appendChild(el("h3", { text: slotLabel(s) + (s.author ? " — " + s.author : "") }));
    if (s.slot === "hero") card.appendChild(el("p", { class: "meta", text: "Optional: paste a separate image for the top of the issue, or pick any spotlight image below as the hero. Wide images fit best." }));
    else {
      const meta = el("p", { class: "meta" });
      meta.appendChild(document.createTextNode(s.title || ""));
      if (s.href) { meta.appendChild(document.createTextNode(" · ")); meta.appendChild(el("a", { href: s.href, target: "_blank", rel: "noopener noreferrer", text: "Open post ↗" })); }
      card.appendChild(meta);
    }
    const ta = el("textarea", { placeholder: "Paste Yellowdig image address" });
    const btn = el("button", { text: "Download images" });
    const msg = el("div", { class: "msg" });
    const thumbs = el("div", { class: "thumbs" });
    btn.onclick = async () => {
      btn.disabled = true; msg.className = "msg"; msg.textContent = "Downloading…";
      try {
        const r = await api("download", { slot: s.slot, urls: ta.value.split(/\\s+/).filter(Boolean) });
        state.images[s.slot] = r.images;
        if (s.slot !== "hero") state.use[s.slot] = r.images[0] ? r.images[0].file : null;
        if (!state.heroTouched && r.suggestedHero) { const owner = Object.keys(state.images).find((k) => state.images[k].some((x) => x.file === r.suggestedHero)); state.hero = r.suggestedHero; state.heroFrom = owner === "hero" ? null : owner; }
        msg.textContent = r.images.length + " image(s) saved to your folder.";
        renderAllThumbs();
      } catch (e) { msg.className = "msg err"; msg.textContent = e.message; }
      btn.disabled = false;
    };
    card.append(el("label", { text: "Image address(es)" }), ta, btn, msg, thumbs);
    card.dataset.slot = s.slot;
    box.appendChild(card);
  }
  $("step-final").hidden = false;
  renderAllThumbs();
}

function renderAllThumbs() {
  for (const card of document.querySelectorAll(".card")) {
    const slot = card.dataset.slot, thumbs = card.querySelector(".thumbs"); thumbs.textContent = "";
    for (const img of state.images[slot] || []) {
      const t = el("div", { class: "thumb" }, el("img", { src: img.thumb, alt: "" }));
      t.appendChild(el("div", { text: img.file + " · " + img.width + "×" + img.height + " · " + img.kb + " KB" }));
      t.appendChild(el("div", { class: "fit-" + img.fit.fit, text: img.fit.note + " (" + img.fit.ratio + ":1)" }));
      if (slot !== "hero") {
        const r = el("input", { type: "radio", name: "use-" + slot }); r.checked = state.use[slot] === img.file;
        r.onchange = () => { state.use[slot] = img.file; };
        t.appendChild(el("label", {}, r, document.createTextNode(" Use in " + slotLabel({ slot }))));
      }
      const h = el("input", { type: "radio", name: "hero" }); h.checked = state.hero === img.file;
      h.onchange = () => { state.hero = img.file; state.heroFrom = slot === "hero" ? null : slot; state.heroTouched = true; heroWarning(); };
      t.appendChild(el("label", {}, h, document.createTextNode(" Use as hero")));
      thumbs.appendChild(t);
    }
  }
  heroWarning();
}

function heroWarning() {
  const box = $("hero-warn"); box.textContent = "";
  const img = Object.values(state.images).flat().find((x) => x.file === state.hero);
  if (!img) { box.appendChild(el("p", { class: "note", text: "No hero chosen: the top of the issue will have no image." })); return; }
  if (img.fit.fit !== "good") box.appendChild(el("div", { class: "warnbox", text: img.fit.note + ": " + img.file + " is " + img.width + "×" + img.height + ". It will be shown whole (never cropped), so it will look narrow at the top. A wider screenshot fits the hero area better." }));
  else box.appendChild(el("p", { class: "note", text: "Hero: " + img.file + " (" + img.fit.note.toLowerCase() + ")." }));
}

$("open").onclick = async () => {
  const f = $("html").files[0], msg = $("open-msg"); msg.className = "msg";
  if (!f) { msg.className = "msg err"; msg.textContent = "Choose the newsletter HTML file first."; return; }
  try {
    const html = await f.text();
    const r = await api("open", { html, workdir: $("workdir").value });
    state.slots = r.slots; state.images = {}; state.use = {}; state.hero = null; state.heroFrom = null; state.heroTouched = false;
    const wk = /Week (\\d+)/.exec(html); $("name").value = "CIS515-Week" + (wk ? wk[1] : "") + "-Final";
    msg.textContent = "Found " + r.slots.length + " image slot(s): " + r.slots.map((s) => s.slot).join(", ") + ".";
    renderSlots();
  } catch (e) { msg.className = "msg err"; msg.textContent = e.message; }
};

$("finalize").onclick = async () => {
  const btn = $("finalize"), msg = $("final-msg"); btn.disabled = true; msg.className = "msg"; msg.textContent = "Embedding images…";
  try {
    const r = await api("finalize", { spotlights: state.use, hero: state.hero ? { file: state.hero, from: state.heroFrom } : null, name: $("name").value, pdf: $("pdf").checked });
    msg.textContent = "";
    const done = el("div", { class: "done" });
    done.appendChild(el("div", { text: "Saved: " + r.html }));
    if (r.pdf) done.appendChild(el("div", { text: "Saved: " + r.pdf }));
    if (r.pdfError) done.appendChild(el("div", { class: "err", text: "PDF not made: " + r.pdfError }));
    done.appendChild(el("div", { text: "Images embedded: " + r.images + " · filled: " + (r.filled.join(", ") || "none") + " · left empty: " + (r.empty.join(", ") || "none") + " · remote images: " + r.remoteImages }));
    msg.appendChild(done);
  } catch (e) { msg.className = "msg err"; msg.textContent = e.message; }
  btn.disabled = false;
};
</script></body></html>`;
