(() => {
  if (document.getElementById("paper-trading-lab-overlay")) return;
  const host = document.createElement("div");
  host.id = "paper-trading-lab-overlay";
  const shadow = host.attachShadow({ mode: "closed" });
  const panel = document.createElement("aside");
  panel.innerHTML = `<div class="header"><strong>Paper Trading Lab</strong><span class="dot"></span></div>
    <div class="mode">DEMO PAPER MODE · display only</div>
    <div class="grid"><span>Equity</span><b data-equity>—</b><span>Position</span><b data-position>—</b><span>Strategy</span><b data-strategy>—</b></div>
    <button data-pause>Pause engine</button>`;
  const style = document.createElement("style");
  style.textContent = `aside{position:fixed;top:16px;right:16px;z-index:2147483647;width:190px;padding:12px;border:1px solid #334155;border-radius:10px;color:#e2e8f0;background:#0f172a;font:12px system-ui;box-shadow:0 8px 28px #0008}.header{display:flex;justify-content:space-between;align-items:center;font-size:13px}.dot{width:7px;height:7px;border-radius:50%;background:#22c55e}.mode{margin:7px 0 10px;color:#94a3b8;font-size:9px;letter-spacing:.06em}.grid{display:grid;grid-template-columns:1fr auto;gap:6px}.grid span{color:#94a3b8}.grid b{font-weight:600}.grid b[data-strategy]{font-size:10px}button{width:100%;margin-top:11px;padding:6px;border:0;border-radius:6px;color:#e2e8f0;background:#1e293b;cursor:pointer}`;
  shadow.append(style, panel);
  document.documentElement.append(host);

  const money = (value) => `$${Number(value).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
  const update = (state) => {
    panel.querySelector("[data-equity]").textContent = money(state.equity);
    panel.querySelector("[data-position]").textContent = `${state.position} ${state.symbol}`;
    panel.querySelector("[data-strategy]").textContent = state.strategy;
    panel.querySelector("[data-pause]").textContent = state.paused ? "Resume engine" : "Pause engine";
    panel.querySelector(".dot").style.background = state.connected === false ? "#f59e0b" : state.dataFresh === false ? "#ef4444" : "#22c55e";
  };
  const refresh = () => chrome.runtime.sendMessage({ type: "getState" }, (response) => response?.state && update(response.state));
  panel.querySelector("[data-pause]").addEventListener("click", () => {
    chrome.runtime.sendMessage({ type: "getState" }, (response) => chrome.runtime.sendMessage({ type: "setPaused", paused: !response.state.paused }, (next) => update(next.state)));
  });
  refresh();
  window.setInterval(refresh, 5000);
})();
