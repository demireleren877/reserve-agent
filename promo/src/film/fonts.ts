// Yerel fontlar (@fontsource) — render ağ erişimi gerektirmez.
import "@fontsource/inter/300.css";
import "@fontsource/inter/400.css";
import "@fontsource/inter/500.css";
import "@fontsource/inter/600.css";
import "@fontsource/inter/700.css";
import "@fontsource/inter/800.css";
import "@fontsource/jetbrains-mono/400.css";
import "@fontsource/jetbrains-mono/500.css";
import { continueRender, delayRender } from "remotion";

const handle = delayRender("Fontlar yükleniyor");
Promise.all(
  ["300", "400", "500", "600", "700", "800"].map((w) => document.fonts.load(`${w} 40px Inter`, "Aktüeryal İşğş")),
)
  .then(() => document.fonts.load(`500 20px "JetBrains Mono"`, "0123"))
  .then(() => document.fonts.ready)
  .then(() => continueRender(handle));
