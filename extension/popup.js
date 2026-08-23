const send = (type, extra = {}) => new Promise((resolve) => chrome.runtime.sendMessage({ type, ...extra }, resolve));
const money = (value) => `$${Number(value).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
function render(state) {
  document.querySelector("[data-status]").textContent = state.connected === false ? "OFFLINE DEMO" : state.paused ? "PAUSED" : "CONNECTED";
  document.querySelector("[data-status]").style.background = state.connected === false ? "#92400e" : state.paused ? "#7f1d1d" : "#14532d";
  document.querySelector("[data-equity]").textContent = money(state.equity);
  document.querySelector("[data-cash]").textContent = money(state.cash);
  document.querySelector("[data-position]").textContent = state.position;
  document.querySelector("[data-symbol]").textContent = state.symbol;
  document.querySelector("[data-pause]").textContent = state.paused ? "Resume engine" : "Pause engine";
}
async function refresh() { const response = await send("getState"); if (response?.state) render(response.state); }
document.querySelector("[data-pause]").addEventListener("click", async () => { const current = await send("getState"); await send("setPaused", { paused: !current.state.paused }); refresh(); });
document.querySelector("[data-reset]").addEventListener("click", async () => { await send("resetDemo"); refresh(); });
refresh();
