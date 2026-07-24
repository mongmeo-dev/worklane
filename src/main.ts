import { mount } from "svelte";
import "./app.css";
import App from "./App.svelte";
import { theme } from "$lib/stores/theme.svelte";
import { terminalSettings } from "$lib/stores/terminalSettings.svelte";
import { budget } from "$lib/stores/budget.svelte";

// 첫 렌더 전에 저장된 설정을 적용한다(테마 FOUC 방지).
theme.init();
terminalSettings.init();
budget.init();

const app = mount(App, {
  target: document.getElementById("app")!,
});

export default app;
