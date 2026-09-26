# Actuarius — Tanıtım Filmleri (Remotion + Three.js)

Bu klasörde iki kompozisyon var:

| Kompozisyon | Süre | Ne |
|---|---|---|
| **`ActuariusFilm`** | 70,8 sn · 1920×1080 · 30 fps · sesli | Gerçek zamanlı 3D sahnelerle sinematik reklam filmi |
| `ActuariusPromo` | 28 sn | İlk sürüm: 2D kinetik tipografi (klasik) |

## ActuariusFilm — sahne akışı

Tüm kesmeler **100 BPM** vuruş ızgarasına oturur (1 vuruş = 18 kare). Müzik aynı
ızgarayla sentezlenir; görüntü ve ses aynı zaman çizelgesinden beslenir
(`src/film/theme.ts` → `SCENE_BEATS`).

| # | Sahne | Görsel fikir |
|---|---|---|
| 1 | **Origin** | Karanlıkta binlerce parçacık (her biri bir hasar) girdapla akıp bakır metal bir **3D gelişim üçgenine** dönüşür; ardından boş hücreler indigo hologram olarak yükselir — *“Henüz görünmeyeni hesaplayın.”* (IBNR) |
| 2 | **Chain** | *Zincir merdiven* kelimesi kelimesine: krom bir zincir, halkadan halkaya geçen enerji darbesi ve her halkada gerçek LDF (×1,2717 → CDF 1,5308) |
| 3 | **Curve** | Kuyruk uydurma: veri noktaları + Exponential / Power / Weibull / Inverse Power eğrileri ışıktan tüpler olarak çizilir, R² sayacı |
| 4 | **Agent** | Topografik ışık çizgileri akan gürültü-shader'lı çekirdek, 4 yörüngede 45 araç; her vuruşta sert açı kesmesi — *Veriyi bağlar. Üçgeni kurar. Aykırıyı eler…* — ve canlı agent günlüğü |
| 5 | **Product** | Gerçek arayüz ekranları: panellerden bir tünelin içinden uçuş → kavisli duvar → Ultimate/IBNR ekranına ve **Toplam IBNR** kartına dalış |
| 6 | **Numbers** | Match-cut: dev **241.906** mekanik tambur sayaç (dikey hareket bulanıklıklı), arkada üçgen tepeden |
| 7 | **Audit** | CSS 3D denetim-izi koridoru — *Kim. Ne zaman. Ne. Neden.* |
| 8 | **Finale** | Favicon'dan izlenen “A” işareti parçacıklardan doğar, bevel'li 3D metale dönüşür, ışık süpürmesi, imza ve CTA |

### Teknik

- **Three.js / React Three Fiber** (`@remotion/three`) — tüm 3D sahneler kare-deterministik;
  her değer yalnızca kare numarasının fonksiyonu (paralel render güvenli).
- **Özel bloom zinciri** (`src/film/Post.tsx`, `UnrealBloomPass`) — `@react-three/postprocessing`
  headless SwiftShader'da siyah kare verdiği için three.js'in kendi composer'ı kullanılır.
- **Shader'lar**: yumuşak nokta bulutu, sönen ızgara zemini, simplex-noise çekirdek.
- **Logo**: `frontend/public/favicon.png` alfa kanalından OpenCV ile izlenen konturlar
  (`src/film/logoShape.ts`) → `ExtrudeGeometry` + gradyan vertex rengi.
- **Tipografi**: Inter + JetBrains Mono (yerel `@fontsource`, ağ gerekmez); maskeden yükselen
  kelimeler, harf harf odaklanma, metalik ışık hüzmesi, SVG hareket bulanıklıklı sayaçlar.
- **Müzik & ses tasarımı**: `scripts/score.py` — numpy/scipy ile tamamen sentez: pad akorları,
  bas, arp + gecikme, davul, riser, whoosh, impact, tık sesleri ve konvolüsyon reverb.

## Çalıştırma

```bash
cd promo
npm install

npm run studio        # Remotion Studio'da önizleme
npm run score         # (isteğe bağlı) müziği yeniden üret → public/score.m4a
npm run render        # out/actuarius-film.mp4
```

- GPU'suz makinede render SwiftShader ile yapılır (`--gl=swangle`); 4 çekirdekte ~45 dk.
  GPU varsa `--gl=angle` çok daha hızlıdır.
- Chrome indirilemeyen ortamlarda `--browser-executable=<chrome-headless-shell yolu>` ekleyin.
- `npm run score` için Python 3 + `numpy` + `scipy` gerekir. Üretilen `score.m4a` repoda
  olduğundan filmi render etmek için şart değildir.

## Özelleştirme

- Renk, font, sahne süreleri: `src/film/theme.ts`
- Rezerv verisi (LDF, IBNR, ULR…): `src/film/data.ts`
- Sahne metinleri ve kamera yolları: `src/film/scenes/*.tsx`
- Müzik akorları / ses olayları: `scripts/score.py` (`PROG`, sahne blokları)
