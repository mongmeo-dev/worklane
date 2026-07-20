import { defineConfig } from "vite";
import { svelte } from "@sveltejs/vite-plugin-svelte";

// @ts-expect-error process는 Node 런타임에서 주입된다
const host = process.env.TAURI_DEV_HOST;

// https://vite.dev/config/
export default defineConfig(async () => ({
  plugins: [svelte()],

  // Tauri가 CLI 오류를 명확히 볼 수 있도록 설정
  clearScreen: false,
  // Tauri는 고정 포트를 기대하며, 포트를 못 잡으면 실패해야 한다
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      // src-tauri 변경은 Vite가 감시하지 않는다 (Rust 쪽에서 처리)
      ignored: ["**/src-tauri/**"],
    },
  },
}));
