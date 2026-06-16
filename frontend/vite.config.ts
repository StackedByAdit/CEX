import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    proxy: {
      "/signup": "http://localhost:3000",
      "/login": "http://localhost:3000",
      "/order": "http://localhost:3000",
      "/orders": "http://localhost:3000",
      "/orderbook": "http://localhost:3000",
      "/balance": "http://localhost:3000",
      "/trades": "http://localhost:3000",
      "/ticker": "http://localhost:3000",
      "/fills": "http://localhost:3000",
      "/stocks": "http://localhost:3000",
      "/candles": "http://localhost:3000",
    },
  },
});
