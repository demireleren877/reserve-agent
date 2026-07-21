# Actuarius Enterprise — Tanıtım Videosu (Remotion)

Uygulamayı tanıtan ~28 saniyelik animasyonlu video (1920×1080, 30 fps).

## Sahneler
1. **Intro** — gelişim üçgeni marka animasyonu + başlık
2. **Değer** — "Hasar verisinden ultimate rezerve, tek platformda"
3. **Üçgen → LDF → IBNR** — gelişim üçgeni kurulur, chain-ladder → CDF → IBNR
4. **Large-Loss Ayrımı** — Gross − Large = Attritional (sayaçlı)
5. **Özellikler** — roll-forward, curve fit, frekans-şiddet, formüllü Excel, çok-kullanıcı, offline
6. **Outro** — marka + slogan

## Çalıştırma

```bash
cd promo
npm install          # ilk sefer

npm run studio       # Remotion Studio'da önizle/düzenle (tarayıcıda açılır)
npm run render       # out/actuarius.mp4 üretir
```

> Render için sistemde uygun bir Chrome/Chromium bulunmalı (Remotion ilk çalıştırmada
> gerekiyorsa indirir). Ses yoktur; istenirse müzik eklenebilir.

## Özelleştirme
- Renk & tipografi: `src/theme.ts`
- Sahne süreleri: `src/Promo.tsx` (`SCENES`)
- Metin/sayılar: `src/scenes.tsx`
