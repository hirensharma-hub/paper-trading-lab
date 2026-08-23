(() => {
  const host = document.createElement("div");
  host.id = "paper-trading-lab-overlay";
  const shadow = host.attachShadow({ mode: "closed" });
  const panel = document.createElement("aside");
  panel.textContent = "Paper Trading Lab: connecting…";
  Object.assign(panel.style, {
    position: "fixed", top: "16px", right: "16px", zIndex: "2147483647",
    padding: "10px 12px", borderRadius: "8px", color: "#dbeafe",
    background: "#0f172a", font: "12px system-ui", boxShadow: "0 4px 18px #0006"
  });
  shadow.append(panel);
  document.documentElement.append(host);

  // Deliberately uses only the local engine API. It never reads chart values or clicks TradingView.
  fetch("http://localhost:8787/health", { credentials: "omit" })
    .then((response) => response.ok ? response.json() : Promise.reject(new Error("engine unavailable")))
    .then((health) => { panel.textContent = `Paper Trading Lab: ${health.paused ? "paused" : "ready"}`; })
    .catch(() => { panel.textContent = "Paper Trading Lab: engine offline"; });
})();
