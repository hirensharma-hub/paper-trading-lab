const DEFAULT_STATE = {
  demoMode: true, paused: false, symbol: "SPY", strategy: "ema-cross v1.0.0",
  equity: 100000, cash: 100000, realisedPnl: 0, position: 0, lastPrice: 500,
  orders: 0, updatedAt: Date.now()
};

async function readState() {
  const stored = await chrome.storage.local.get("paperState");
  return { ...DEFAULT_STATE, ...(stored.paperState ?? {}) };
}

async function writeState(state) {
  await chrome.storage.local.set({ paperState: { ...state, updatedAt: Date.now() } });
  return state;
}

chrome.runtime.onInstalled.addListener(async () => {
  const stored = await chrome.storage.local.get("paperState");
  if (!stored.paperState) await writeState(DEFAULT_STATE);
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  (async () => {
    let state = await readState();
    if (message.type === "getState") sendResponse({ ok: true, state });
    else if (message.type === "setPaused") {
      state = await writeState({ ...state, paused: Boolean(message.paused) });
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
