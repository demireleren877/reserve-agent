// Actuarius — film paleti, tipografi ve zaman çizelgesi.
//
// Tüm kesmeler 100 BPM'lik vuruş ızgarasına oturur (1 vuruş = 18 frame @30fps).
// Müzik (scripts/score.py) aynı ızgarayı kullanır; sahne sınırları burada tek
// kaynaktan gelir ve public/cues.json'a yazılır.

export const FPS = 30;
export const W = 1920;
export const H = 1080;
export const BEAT = 18;

export const K = {
  bg: "#030306",
  bgLift: "#0a0a12",
  ink: "#f5f5f7",
  inkSoft: "#a1a1a6",
  muted: "#6e6e73",
  indigo: "#2b31ff", // logo mavisi
  indigoGlow: "#6b7bff",
  indigoDeep: "#0b0a2e",
  copper: "#c8743f", // site bakırı (#a85a33) — ışıkta daha sıcak
  copperLight: "#f2a66f",
  good: "#5fe39a",
};

export const FONT_DISPLAY = '"Inter", "SF Pro Display", system-ui, sans-serif';
export const FONT_MONO = '"JetBrains Mono", "SF Mono", ui-monospace, monospace';

/** Sahne süreleri vuruş cinsinden. Sıra = film sırası. */
export const SCENE_BEATS = {
  origin: 24, // parçacıklar → gelişim üçgeni → IBNR projeksiyonu
  chain: 10, // Chain-Ladder: faktör zinciri
  curve: 10, // kuyruk uydurma
  agent: 20, // AI Agent çekirdeği
  product: 16, // arayüz ekranları
  numbers: 10, // IBNR sayacı
  audit: 10, // denetim izi
  finale: 18, // 3D logo + imza
} as const;

export type SceneId = keyof typeof SCENE_BEATS;

export const TIMELINE = (() => {
  let at = 0;
  return (Object.keys(SCENE_BEATS) as SceneId[]).map((id) => {
    const d = SCENE_BEATS[id] * BEAT;
    const s = { id, from: at, dur: d };
    at += d;
    return s;
  });
})();

export const FILM_DURATION = TIMELINE.reduce((s, x) => s + x.dur, 0);
export const sceneFrom = (id: SceneId) => TIMELINE.find((s) => s.id === id)!.from;
