import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

function bypassSpaDocument(req: { method?: string; headers: { accept?: string | string[] } }) {
  const accept = req.headers.accept;
  const acceptValue = Array.isArray(accept) ? accept.join(",") : (accept ?? "");
  if (req.method === "GET" && acceptValue.includes("text/html")) {
    return "/index.html";
  }
}

const apiProxy = "http://localhost:3000";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    proxy: {
      "/signup": { target: apiProxy, bypass: bypassSpaDocument },
      "/login": { target: apiProxy, bypass: bypassSpaDocument },
      "/logout": "http://localhost:3000",
      "/deposit": "http://localhost:3000",
      "/order": "http://localhost:3000",
      "/orders": "http://localhost:3000",
      "/orderbook": "http://localhost:3000",
      "/balance": "http://localhost:3000",
      "/trades": "http://localhost:3000",
      "/ticker": "http://localhost:3000",
      "/fills": "http://localhost:3000",
      "/stocks": "http://localhost:3000",
      "/candles": "http://localhost:3000",
      "/ws": {
        target: "http://localhost:8080",
        ws: true,
      },
    },
  },
});
