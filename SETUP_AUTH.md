# Auth & DB Setup

İlk kurulum talimatları. Tek seferlik.

## 1. Firebase

1. [Firebase Console](https://console.firebase.google.com/) → **Add project**
2. Project Settings → **General** → **Your apps** → **Web** → ikon (`</>`) ile yeni web app oluştur
3. **Authentication** → **Get started** → **Sign-in method**:
   - **Email/Password** → enable
   - **Google** → enable (proje destek e-postası gir)
4. **Authentication → Settings → Authorized domains**: prod domainini ekle (`localhost` zaten var)
5. Web config'i kopyala (apiKey, authDomain, projectId, appId), `frontend/.env.local` oluştur:

   ```
   NEXT_PUBLIC_FIREBASE_API_KEY=...
   NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=...
   NEXT_PUBLIC_FIREBASE_PROJECT_ID=...
   NEXT_PUBLIC_FIREBASE_APP_ID=...
   ```

## 2. Cloudflare Worker + D1

```bash
cd worker
npm install
npx wrangler login        # tarayıcı açılır, hesabı bağla
```

D1 database oluştur:
```bash
npx wrangler d1 create reserve_agent
```

Çıktıdaki `database_id` UUID'sini kopyala → `worker/wrangler.toml` içinde **iki** `[[d1_databases]]` bloğunda da `REPLACE_WITH_D1_DATABASE_ID` yerine yapıştır.

Aynı `wrangler.toml`'da:
- `FIREBASE_PROJECT_ID` = Firebase Console'dan aldığın `projectId` (her iki env için)
- `ALLOWED_ORIGIN` = frontend origin'i (`http://localhost:3000` dev için, production'da gerçek domain)

Schema'yı uygula:
```bash
npm run db:migrate:local      # lokal geliştirme için
npm run db:migrate:remote     # production D1'e
```

## 3. Çalıştırma

3 servis paralel:

```bash
# Terminal 1 — backend (Render'da çalışan FastAPI'nin lokali)
cd backend && uv run uvicorn app.main:app --reload

# Terminal 2 — Worker
cd worker && npm run dev          # http://localhost:8787

# Terminal 3 — frontend
cd frontend && npm run dev        # http://localhost:3000
```

Frontend'in `.env.local`'ında:
```
NEXT_PUBLIC_API_BASE=http://localhost:8000
NEXT_PUBLIC_WORKER_BASE=http://localhost:8787
NEXT_PUBLIC_FIREBASE_*=...
```

## 4. Akış

1. `http://localhost:3000` → Landing
2. **Uygulamaya Gir** → `/login`'e yönlenir (eğer giriş yapmadıysan)
3. E-posta veya Google ile giriş → ilk seferse `/onboarding/plan`
4. Free veya Pro seç → `/reserve`
5. Veri yükle, branch oluştur → 1.5s sonra Worker'a otomatik PUT
6. Çıkış yap → `localStorage` kullanıcıya namespace'lendiği için yeni hesabın verisi karışmaz

## 5. Production deploy

```bash
cd worker
npx wrangler deploy --env production
```

Cloudflare verdiği Worker URL'sini frontend'in production env'ine yaz:
- Render dashboard → frontend service → Environment → `NEXT_PUBLIC_WORKER_BASE=https://reserve-agent-worker.<account>.workers.dev`

Production Firebase config aynı (web key public, gizlemeye gerek yok).

## 6. Şu an enforce edilmeyen şeyler

- Free planın "3 proje · 1 dönem" limiti henüz uygulanmıyor — DB'de plan saklı, frontend'de bunu okuyup kapı koymak ileride.
- Pro ödemesi (Stripe) yok — Pro seçen kullanıcı bedava Pro alıyor şu an.

İkisi de bilerek ertelendi (kullanıcı isteği: "ödeme altyapısı vve plan diffleri sonra entegre edeceğiz").

## 7. Mimari özet

```
┌────────────────┐  ID token  ┌──────────────────┐  D1 SQL  ┌────────┐
│  Next.js (FE)  │ ─────────> │  CF Worker (BFF) │ ───────> │   D1   │
│  Firebase SDK  │            │  verify JWT      │          │  user  │
└────────────────┘            │  scope by uid    │          │  state │
        │                     └──────────────────┘          └────────┘
        │ chainladder / agent
        ▼
┌────────────────┐
│  FastAPI (Render)
│  stateless calc
└────────────────┘
```

DB'de saklanan: `users(uid, email, plan, plan_selected_at, ...)` ve `user_state(uid, project_json, chat_json, version, ...)`. Tek satır/kullanıcı, JSON blob'ları `localStorage`'daki shape'i birebir yansıtır.
