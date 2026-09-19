const DEFAULT_CODE = `customer_name = "Ahmed"
order_value = 15000
discount = 1000
final_amount = order_value - discount
order_status = "pending"
message = "Waiting for payment"

# Change order_status to "success" and message to see the site update
# order_status = "success"
# message = "Payment received — thank you!"

print(message)
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
  runState.className = `run-state ${kind}`;
  runState.textContent = label;
}

function syncGutter() {
  const gutter = document.getElementById("gutter");
  if (!gutter) return;
  const lines = codeEl.value.split("\n").length;
  gutter.textContent = Array.from({ length: lines }, (_, i) => i + 1).join("\n");
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
  const vars = result.vars || {};
  if (v.labels && v.values) return "chart";
  if (Array.isArray(v.items) || Array.isArray(vars.items)) return "table";
  if (
    v.status ||
    vars.order_status ||
    vars.customer_name ||
    vars.final_amount ||
    vars.order_value ||
    v.message ||
    v.from_print
  ) {
    return "website";
  }
  if (Object.keys(vars).length) return "cards";
  return "console";
}

function esc(s) {
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function money(value) {
  if (value == null || value === "") return "—";
  const n = Number(value);
  if (Number.isFinite(n)) {
    return "Rs " + n.toLocaleString("en-PK");
  }
  return String(value);
}

function firstDefined(...vals) {
  for (const v of vals) {
    if (v !== undefined && v !== null && v !== "") return v;
  }
  return undefined;
}

function mergePayload(result) {
  const viz = { ...(result.viz || {}) };
  const vars = result.vars || {};
  for (const [k, val] of Object.entries(vars)) {
    if (viz[k] === undefined) viz[k] = val;
  }

  const explicitStatus = firstDefined(
    viz.status,
    vars.order_status,
    vars.payment_status,
    vars.status
  );
  if (explicitStatus !== undefined) {
    viz.status = explicitStatus;
  }

  if (!viz.message) {
    if (vars.message) viz.message = vars.message;
    else if (result.stdout && result.stdout.trim()) {
      const lines = result.stdout.trim().split(/\r?\n/);
      viz.message = lines[lines.length - 1];
    }
  }

  // Avoid treating a money print line as the order status.
  if (!explicitStatus) {
    const cls = statusClass(viz.message || "");
    if (cls !== "neutral") viz.status = viz.message;
    else if (vars.customer_name || vars.final_amount != null || vars.order_value != null) {
      viz.status = "pending";
    } else if (viz.message) {
      viz.status = viz.message;
    }
  }

  return viz;
}

function defaultItems(payload) {
  if (Array.isArray(payload.items) && payload.items.length) return payload.items;
  return [
    { name: "Wireless Keyboard", meta: "Qty 1", price: payload.order_value ? Math.round(Number(payload.order_value) * 0.6) : 9000 },
    { name: "USB-C Hub", meta: "Qty 1", price: payload.order_value ? Math.round(Number(payload.order_value) * 0.4) : 6000 },
  ];
}

function renderWebsite(payload) {
  const title = firstDefined(payload.title, payload.shop_name, "GreenCart");
  const customer = firstDefined(payload.customer_name, payload.customer, payload.name, "Guest");
  const email = firstDefined(payload.email, payload.customer_email, "ahmed@email.com");
  const city = firstDefined(payload.city, payload.address, "Karachi");
  const orderValue = firstDefined(payload.order_value, payload.subtotal, payload.total);
  const discount = firstDefined(payload.discount, 0);
  const shipping = firstDefined(payload.shipping, 0);
  let finalAmount = firstDefined(payload.final_amount, payload.amount, payload.grand_total);
  if (finalAmount == null && orderValue != null) {
    finalAmount = Number(orderValue) - Number(discount || 0) + Number(shipping || 0);
  }
  const status = firstDefined(payload.status, payload.order_status, "pending");
  const message = firstDefined(
    payload.message,
    statusClass(status) === "success"
      ? "Payment cleared. Your order is being packed."
      : statusClass(status) === "failed"
        ? "Payment failed. No charge was made."
        : "Awaiting payment confirmation."
  );
  const orderId = firstDefined(payload.order_id, payload.orderId, "GC-1042");
  const cls = statusClass(status);
  const items = defaultItems(payload);
  const rows = items
    .map((it) => {
      if (it && typeof it === "object") {
        const name = it.name ?? it.title ?? "Item";
        const meta = it.meta ?? it.qty ?? "Qty 1";
        const price = it.price ?? "";
        return `<tr>
          <td><span class="item-name">${esc(name)}</span><span class="item-meta">${esc(meta)}</span></td>
          <td class="amt">${esc(price === "" ? "" : money(price))}</td>
        </tr>`;
      }
      return `<tr>
        <td><span class="item-name">${esc(it)}</span><span class="item-meta">Qty 1</span></td>
        <td class="amt"></td>
      </tr>`;
    })
    .join("");

  const paid = cls === "success";
  const bannerTitle =
    cls === "success"
      ? "Order confirmed"
      : cls === "failed"
        ? "Checkout failed"
        : cls === "pending"
          ? "Payment pending"
          : String(status);

  const host = String(title).toLowerCase().replace(/[^a-z0-9]+/g, "") || "shop";

  return `
    <div class="browser">
      <div class="browser-chrome">
        <div class="traffic" aria-hidden="true"><i></i><i></i><i></i></div>
        <div class="urlbar">https://${esc(host)}.local/checkout</div>
      </div>
      <div class="store">
        <div class="store-nav">
          <div class="store-logo">${esc(title)}</div>
          <div class="store-links"><span>Catalog</span><span>Account</span><span>Support</span></div>
          <div class="store-cart">Cart (2)</div>
        </div>
        <div class="store-main">
          <div>
            <div class="crumbs">Cart / <strong>Checkout</strong></div>
            <h2>Checkout</h2>
            <p class="store-lead">Values on this page come from the Python on the left.</p>
            <div class="alert ${cls}">
              <div class="bar"></div>
              <div class="body">
                <p class="title">${esc(bannerTitle)}</p>
                <p class="msg">${esc(message)}</p>
              </div>
            </div>
            <p class="section-label">Customer</p>
            <dl class="detail-grid">
              <div><dt>Name</dt><dd>${esc(customer)}</dd></div>
              <div><dt>Email</dt><dd>${esc(email)}</dd></div>
              <div><dt>City</dt><dd>${esc(city)}</dd></div>
              <div><dt>Order</dt><dd>${esc(orderId)}</dd></div>
            </dl>
          </div>
          <aside class="store-aside">
            <p class="section-label">Order summary</p>
            <table class="lines">
              <thead><tr><th>Item</th><th class="amt">Amount</th></tr></thead>
              <tbody>${rows}</tbody>
            </table>
            <div class="totals">
              <div class="row"><span>Subtotal</span><span>${esc(money(orderValue))}</span></div>
              <div class="row"><span>Discount</span><span>− ${esc(money(discount))}</span></div>
              <div class="row"><span>Shipping</span><span>${esc(money(shipping))}</span></div>
              <div class="row grand"><span>Total</span><span>${esc(money(finalAmount))}</span></div>
            </div>
            <div class="pay ${paid ? "is-paid" : ""}">${paid ? "Paid" : "Pay now"}</div>
          </aside>
        </div>
        <div class="store-foot">
          <span>Demo storefront for Python lessons</span>
          <span>order_status = ${esc(status)}</span>
        </div>
      </div>
    </div>`;
}

function renderStatus(payload) {
  const status = payload.status || payload.message || "—";
  const message = payload.message && payload.message !== status ? payload.message : "";
  return `
    <div class="viz-shell big-status">
      <div>
        <div class="label">${esc(status)}</div>
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
  setState("running", "Running");
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

const homeEl = document.getElementById("home");
const labEl = document.getElementById("lab");
const openLabBtn = document.getElementById("openLabBtn");
const homeBtn = document.getElementById("homeBtn");

function showHome() {
  homeEl.classList.remove("is-hidden");
  labEl.classList.add("is-hidden");
}

function showLab() {
  homeEl.classList.add("is-hidden");
  labEl.classList.remove("is-hidden");
  syncGutter();
  runCode();
  codeEl.focus();
}

async function init() {
  codeEl.value = DEFAULT_CODE;
  syncGutter();
  preview.innerHTML = `<div class="empty">Press Run (or Ctrl+Enter) to execute the lesson.</div>`;
  showHome();

  const api = await waitForApi();
  if (api?.list_examples) {
    examples = await api.list_examples();
    exampleSelect.innerHTML =
      `<option value="">Starter</option>` +
      examples.map((e) => `<option value="${esc(e.id)}">${esc(e.title || e.id)}</option>`).join("");
  }

  openLabBtn.addEventListener("click", showLab);
  homeBtn.addEventListener("click", showHome);
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
      syncGutter();
    }
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
      e.preventDefault();
      runCode();
    }
  });

  codeEl.addEventListener("input", () => {
    syncGutter();
    clearTimeout(runTimer);
    runTimer = setTimeout(runCode, 650);
  });

  codeEl.addEventListener("scroll", () => {
    const gutter = document.getElementById("gutter");
    if (gutter) gutter.scrollTop = codeEl.scrollTop;
  });
}

init();
