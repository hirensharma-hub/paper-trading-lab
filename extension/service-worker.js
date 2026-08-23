const DEFAULT_STATE = {
  demoMode: true, connected: false, dataFresh: false, paused: false, killSwitch: false, symbol: "SPY", strategy: "ema-cross v1.0.0",
  equity: 100000, cash: 100000, realisedPnl: 0, position: 0, lastPrice: 500,
  orders: 0, updatedAt: Date.now()
};
const ENGINE_API = "http://127.0.0.1:47821";

async function readState() {
  const stored = await chrome.storage.local.get("paperState");
  return { ...DEFAULT_STATE, ...(stored.paperState ?? {}) };
}

async function writeState(state) {
  await chrome.storage.local.set({ paperState: { ...state, updatedAt: Date.now() } });
  return state;
}

async function engineRequest(path, options = {}) {
  try {
    const response = await fetch(`${ENGINE_API}${path}`, { ...options, headers: { "Content-Type": "application/json", ...(options.headers ?? {}) } });
    if (!response.ok) return null;
    return await response.json();
  } catch { return null; }
}

chrome.runtime.onInstalled.addListener(async () => {
  const stored = await chrome.storage.local.get("paperState");
  if (!stored.paperState) await writeState(DEFAULT_STATE);
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  (async () => {
    let state = await readState();
    const remote = await engineRequest("/state");
    if (remote?.ok) state = { ...state, connected: true, paused: remote.health.paused, killSwitch: remote.health.killSwitch, dataFresh: remote.health.dataFresh, engineHealth: remote.health, equity: remote.snapshot.equity, cash: remote.snapshot.cash, position: remote.health.positions.find((position) => position.symbol === state.symbol)?.quantity ?? 0 };
    else state = { ...state, connected: false, dataFresh: false };
    if (message.type === "getState") sendResponse({ ok: true, state });
    else if (message.type === "setPaused") {
      const remoteControl = await engineRequest(message.paused ? "/control/pause" : "/control/resume", { method: "POST" });
      if (remoteControl?.ok) state = await writeState({ ...state, paused: message.paused, connected: true });
      else state = await writeState({ ...state, connected: false, dataFresh: false, paused: Boolean(message.paused) });
      sendResponse({ ok: true, state });
    } else if (message.type === "resetDemo") {
      state = await writeState(DEFAULT_STATE);
      sendResponse({ ok: true, state });
    } else if (message.type === "simulateTick") {
      const drift = (Math.random() - 0.48) * 1.5;
      const nextPrice = Math.max(1, state.lastPrice + drift);
      state = await writeState({ ...state, lastPrice: nextPrice, equity: state.cash + state.position * nextPrice });
      sendResponse({ ok: true, state });
    } else sendResponse({ ok: false, error: "Unknown message" });
  })();
  return true;
});
