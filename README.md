# Reserve Agent

Aktüeryal rezerv analizi için chat-first, interaktif agent / arayüz.
Zincir merdiven (Chain Ladder) metodu merkezli, aktüer uzman ve manager kullanıcılarına yönelik.

## Mimari

- **Backend:** Python 3.12 + FastAPI + `chainladder` + pandas + openpyxl
- **Frontend:** Next.js 16 + TypeScript + AG Grid + TailwindCSS
- **LLM:** OpenRouter (OpenAI-uyumlu SDK) üzerinden Claude Sonnet 4.6
- **Deploy:** Docker Compose (şirket içi)

## Veri gizliliği

LLM'e ham üçgen verisi **gönderilmez**. Agent tool'ları backend'de çalışır ve
yalnızca agrega sonuçları (LDF'ler, ultimate'lar, rezervler, latest diagonal)
LLM'e iletilir.

## Klasörler

- `backend/` — FastAPI uygulaması, hesaplama çekirdeği, agent tool'ları
- `frontend/` — Next.js arayüz (üçgen grid, sonuç paneli, chat)
- `docker-compose.yml` — tek komutla ayağa kalkma

## Lokal geliştirme

### Backend

```bash
cd backend
uv sync
uv run pytest        # 82 test
uv run uvicorn app.main:app --reload
```

### Frontend

```bash
cd frontend
npm install
npm test             # Vitest
npm run dev
```

## Docker ile çalıştırma

```bash
cp .env.example .env
# .env dosyasına OPENROUTER_API_KEY değerini ekleyin
docker compose up --build
```

Frontend: http://localhost:3000
Backend API: http://localhost:8000

## Test disiplini

Tüm hesaplama ve parser fonksiyonları TDD ile yazıldı: önce test, sonra implementation.

- Backend: `tests/` altında pytest (Triangle, LDF, Chain Ladder, Excel parser, API, Agent tool'ları)
- Frontend: component ve lib testleri Vitest ile

## Özellikler (MVP)

- Excel (xlsx) üçgen upload — akıllı format tespit (metadata satırları atlanır)
- Paid ve Incurred üçgen tipleri
- Chain Ladder: Volume Weighted, Simple Average, Geometric Average
- Son N yıl ortalaması
- Origin (kaza yılı) hariç tutma
- LDF override (manuel girme)
- Türkçe arayüz, Türkçe sayı formatı
- Chat agent: "2021'i hariç tut", "simple average ile hesapla" gibi komutlar

## Sonraki adımlar (v2)

- Mack standard error
- Bootstrap (Solvency II / IFRS 17)
- Bornhuetter-Ferguson
- Tail factor (curve fitting)
- Diagnostic testler
- Oracle / SQL Server connector
- Çok kullanıcılı versiyonlama ve peer review
- LDAP / Active Directory auth
