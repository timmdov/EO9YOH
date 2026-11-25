import { boot } from "./boot";
import { showUnsupported } from "./graphics/gfx";
import "./style.css";

boot().catch((err: unknown) => {
  console.error("[boot] fatal:", err);
  showUnsupported(`Startup failed: ${String(err)}`);
});
