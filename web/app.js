const DEFAULT_CODE = `print("pending")

# Try changing the print to:
# print("Order successful")
#
# Or use the viz helpers:
# viz.status("success", "Your order is confirmed!")
`;

const codeEl = document.getElementById("code");
const vizSelect = document.getElementById("vizSelect");
const exampleSelect = document.getElementById("exampleSelect");
const runBtn = document.getElementById("runBtn");
const preview = document.getElementById("preview");
const rawOut = document.getElementById("rawOut");
const runState = document.getElementById("runState");
const hintText = document.getElementById("hintText");

let examples = [];
let lastResult = null;
let runTimer = null;

function setState(kind, label) {
  runState.className = `state ${kind}`;
  runState.textContent = label;
}

function normalizeStatus(value) {
  if (value == null) return "";
  return String(value).trim().toLowerCase();
}

function statusClass(status) {
  const s = normalizeStatus(status);
  if (!s) return "neutral";
  if (/(success|ok|paid|done|complete|confirm)/.test(s)) return "success";
  if (/(pending|process|wait|loading)/.test(s)) return "pending";
  if (/(fail|error|cancel|reject|denied)/.test(s)) return "failed";
  return "neutral";
}

function pickAutoMode(result) {
  const v = result.viz || {};
  if (v.labels && v.values) return "chart";
  if (Array.isArray(v.items) || Array.isArray(result.vars?.items)) return "table";
  if (v.status || v.message || v.from_print) return "website";
  if (Object.keys(result.vars || {}).length) return "cards";
  return "console";
}

function esc(s) {
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function mergePayload(result) {
  const viz = { ...(result.viz || {}) };
  const vars = result.vars || {};
  for (const [k, val] of Object.entries(vars)) {
    if (viz[k] === undefined) viz[k] = val;
  }
  if (!viz.message && result.stdout && result.stdout.trim()) {
    const lines = result.stdout.trim().split(/\r?\n/);
    viz.message = lines[lines.length - 1];
  }
  if (!viz.status && viz.message) viz.status = viz.message;
  return viz;
}

function renderWebsite(payload) {
  const title = payload.title || "Demo Shop";
  const status = payload.status || "unknown";
  const message = payload.message || "Run your code to update this page.";
  const items = Array.isArray(payload.items) ? payload.items : ["Notebook", "USB cable"];
  const cls = statusClass(status);
  const rows = items
    .map((it) => {
      if (it && typeof it === "object") {
        const name = it.name ?? it.title ?? JSON.stringify(it);
        const price = it.price ?? it.qty ?? "";
        return `<li><span>${esc(name)}</span><span>${esc(price)}</span></li>`;
      }
      return `<li><span>${esc(it)}</span><span></span></li>`;
    })
    .join("");

  return `
    <div class="viz-shell">
      <div class="site-bar">
        <div class="shop">${esc(title)}</div>
        <div class="cart">Cart · Checkout</div>
      </div>
      <div class="site-body">
        <h3>Checkout</h3>
        <p class="sub">This fake website listens to your Python.</p>
        <div class="status-pill ${cls}">● ${esc(status)}</div>
        <p style="margin:0.9rem 0 0;color:var(--muted)">${esc(message)}</p>
        <ul class="item-list">${rows}</ul>
      </div>
    </div>`;
}

function renderStatus(payload) {
  const status = payload.status || payload.message || "—";
  const message = payload.message && payload.message !== status ? payload.message : "";
  const cls = statusClass(status);
  const icon = cls === "success" ? "✓" : cls === "failed" ? "✕" : cls === "pending" ? "…" : "○";
  return `
    <div class="viz-shell big-status">
      <div>
        <div class="emoji">${icon}</div>
        <div class="label" style="color:inherit">${esc(status)}</div>
        ${message ? `<div class="msg">${esc(message)}</div>` : ""}
      </div>
    </div>`;
}

function renderCards(payload, result) {
  const data = { ...payload };
  delete data.from_print;
  const entries = Object.entries(data);
  const varEntries = Object.entries(result.vars || {});
  const all = entries.length ? entries : varEntries;
  if (!all.length) {
    return `<div class="empty">No variables yet. Assign something like <code>total = 42</code> or use <code>viz.set(...)</code>.</div>`;
  }
  return `<div class="cards">${all
    .map(
      ([k, v]) => `
      <div class="card">
        <div class="k">${esc(k)}</div>
        <div class="v">${esc(typeof v === "object" ? JSON.stringify(v) : v)}</div>
      </div>`
    )
    .join("")}</div>`;
}

function renderTable(payload, result) {
  const items = payload.items || result.vars?.items || result.vars?.orders || null;
  if (Array.isArray(items)) {
    if (!items.length) return `<div class="empty">Empty list.</div>`;
    if (typeof items[0] === "object" && items[0] !== null) {
      const keys = [...new Set(items.flatMap((row) => Object.keys(row)))];
      return `<div class="viz-shell table-wrap"><table class="data">
        <thead><tr>${keys.map((k) => `<th>${esc(k)}</th>`).join("")}</tr></thead>
        <tbody>${items
          .map(
            (row) =>
              `<tr>${keys.map((k) => `<td>${esc(row[k] ?? "")}</td>`).join("")}</tr>`
          )
          .join("")}</tbody></table></div>`;
    }
    return `<div class="viz-shell table-wrap"><table class="data">
      <thead><tr><th>#</th><th>Value</th></tr></thead>
      <tbody>${items
        .map((v, i) => `<tr><td>${i}</td><td>${esc(v)}</td></tr>`)
        .join("")}</tbody></table></div>`;
  }

  const rows = Object.entries({ ...payload, ...(result.vars || {}) }).filter(
    ([k]) => k !== "from_print"
  );
  if (!rows.length) return `<div class="empty">Nothing to tabulate yet.</div>`;
  return `<div class="viz-shell table-wrap"><table class="data">
    <thead><tr><th>Name</th><th>Value</th></tr></thead>
    <tbody>${rows
      .map(
        ([k, v]) =>
          `<tr><td>${esc(k)}</td><td>${esc(typeof v === "object" ? JSON.stringify(v) : v)}</td></tr>`
      )
      .join("")}</tbody></table></div>`;
}

function renderChart(payload, result) {
  let labels = payload.labels || result.vars?.labels;
  let values = payload.values || result.vars?.values;
  if (!labels || !values) {
    const nums = Object.entries(result.vars || {}).filter(([, v]) => typeof v === "number");
    if (nums.length) {
      labels = nums.map(([k]) => k);
      values = nums.map(([, v]) => v);
    }
  }
  if (!labels || !values || !labels.length) {
    return `<div class="empty">Use <code>viz.chart(["A","B"], [3,7])</code> or number variables.</div>`;
  }
  const max = Math.max(...values.map(Number), 1);
  const cols = labels
    .map((label, i) => {
      const val = Number(values[i] ?? 0);
      const h = Math.max(4, Math.round((val / max) * 180));
      return `<div class="bar-col"><div class="bar" style="height:${h}px" title="${esc(val)}"></div><div class="lbl">${esc(label)}<br>${esc(val)}</div></div>`;
    })
    .join("");
  return `<div class="viz-shell"><div class="chart">${cols}</div></div>`;
}

function renderConsole(result) {
  const text = [result.stdout, result.stderr].filter(Boolean).join("\n") || "(no output)";
  return `<pre class="console-box">${esc(text)}</pre>`;
}

function renderPreview(result) {
  let mode = vizSelect.value;
  if (mode === "auto") mode = pickAutoMode(result);
  const payload = mergePayload(result);

  if (!result.ok) {
    preview.innerHTML = `<div class="viz-shell"><pre class="console-box" style="color:var(--bad)">${esc(result.stderr || "Error")}</pre></div>`;
    return;
  }

  const map = {
    website: () => renderWebsite(payload),
    status: () => renderStatus(payload),
    cards: () => renderCards(payload, result),
    table: () => renderTable(payload, result),
    chart: () => renderChart(payload, result),
    console: () => renderConsole(result),
  };
  preview.innerHTML = (map[mode] || map.website)();
}

function showRaw(result) {
  rawOut.textContent = JSON.stringify(
    {
      ok: result.ok,
      stdout: result.stdout,
      stderr: result.stderr,
      viz: result.viz,
      vars: result.vars,
    },
    null,
    2
  );
}

async function waitForApi(timeoutMs = 8000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (window.pywebview?.api?.run) return window.pywebview.api;
    await new Promise((r) => setTimeout(r, 50));
  }
  return null;
}

async function runCode() {
  const api = await waitForApi();
  if (!api) {
    setState("err", "Desktop API missing");
    preview.innerHTML = `<div class="empty">Open this app with <code>python main.py</code> (not as a plain HTML file).</div>`;
    return;
  }
  runBtn.disabled = true;
  setState("running", "Running…");
  try {
    const result = await api.run(codeEl.value);
    lastResult = result;
    renderPreview(result);
    showRaw(result);
    setState(result.ok ? "ok" : "err", result.ok ? "Updated" : "Error");
  } catch (err) {
    setState("err", "Failed");
    preview.innerHTML = `<div class="empty">${esc(err)}</div>`;
  } finally {
    runBtn.disabled = false;
  }
}

function loadExample(id) {
  const ex = examples.find((e) => e.id === id);
  if (!ex) return;
  codeEl.value = ex.code;
  if (ex.viz) vizSelect.value = ex.viz;
  hintText.textContent = ex.hint || "";
  runCode();
}

async function init() {
  codeEl.value = DEFAULT_CODE;
  preview.innerHTML = `<div class="empty">Press <strong>Run</strong> to see your code change this preview.</div>`;

  const api = await waitForApi();
  if (api?.list_examples) {
    examples = await api.list_examples();
    exampleSelect.innerHTML =
      `<option value="">— starter —</option>` +
      examples.map((e) => `<option value="${esc(e.id)}">${esc(e.title || e.id)}</option>`).join("");
  }

  runBtn.addEventListener("click", runCode);
  vizSelect.addEventListener("change", () => {
    if (lastResult) renderPreview(lastResult);
  });
  exampleSelect.addEventListener("change", () => {
    if (exampleSelect.value) loadExample(exampleSelect.value);
  });

  codeEl.addEventListener("keydown", (e) => {
    if (e.key === "Tab") {
      e.preventDefault();
      const start = codeEl.selectionStart;
      const end = codeEl.selectionEnd;
      codeEl.value = codeEl.value.slice(0, start) + "    " + codeEl.value.slice(end);
      codeEl.selectionStart = codeEl.selectionEnd = start + 4;
    }
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
      e.preventDefault();
      runCode();
    }
  });

  // Live-ish: re-run shortly after typing stops
  codeEl.addEventListener("input", () => {
    clearTimeout(runTimer);
    runTimer = setTimeout(runCode, 650);
  });

  await runCode();
}

init();
