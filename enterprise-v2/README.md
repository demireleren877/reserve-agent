# Actuarius Enterprise — Masaüstü (Offline)

Çift tıkla açılan, tamamen çevrimdışı Windows masaüstü uygulaması. İnternet
gerektirmez. Veritabanı olarak şirket ağındaki (LAN) Oracle kullanılır.

```
Kullanıcı → Actuarius.exe (çift tık)
              │
              ├─ pywebview penceresi (native, tarayıcı yok)
              │     └─ Next.js statik arayüz  ──┐
              │                                  │ aynı origin (127.0.0.1:<port>)
              └─ FastAPI backend (gömülü)  ──────┘
                    └─ Oracle (şirket ağı, LAN)
```

## Neden bu mimari

- **Tek dil, tek build**: backend zaten Python. pywebview + PyInstaller her şeyi
  (Python + FastAPI + oracledb thin + statik arayüz) **tek klasöre** toplar.
  Rust/Node runtime gerekmez, kullanıcının Python kurması gerekmez.
- **Aynı origin**: arayüz ve API tek yerel sunucudan gelir → CORS yok, port sorunu yok.
- **oracledb thin mode**: Oracle Instant Client kurulumu gerekmez.
- **Offline ≠ veritabanısız**: internet yok, ama Oracle şirket ağında erişilebilir.

Kod, `enterprise/` klasöründeki mevcut backend ve frontend'i **yeniden kullanır**
(fork yok). `enterprise-v2/` yalnızca masaüstü kabuğunu ve paketlemeyi içerir.

## İlk açılış akışı

1. **Kurulum ekranı** (yalnızca ilk kez): Oracle sunucu/port/servis + veritabanı
   kullanıcısı/şifresi + ilk yönetici hesabı. "Bağlantıyı test et" → "Kur ve devam et".
   Şema otomatik kurulur, ilk admin oluşturulur.
2. **Giriş ekranı**: kullanıcı adı + şifre (Oracle `users` tablosu).
3. Klasik uygulama — tüm modüller (rezerv, nakit akışı, iskonto, veri).

Bağlantı bilgileri bu bilgisayarda saklanır (`%APPDATA%\ReserveAgentEnterprise\`),
şifre mümkünse Windows Credential Manager'da (keyring). Sonraki açılışlarda doğrudan
giriş ekranı gelir.

> **Agent (LLM)** çevrimdışı modda kapalıdır (internet gerektirir). İsteğe bağlı
> olarak şirket-içi bir LLM ağ geçidine bağlanacak şekilde genişletilebilir.

## Geliştirme (macOS/Linux/Windows)

```bash
# 1) Bağımlılıklar
cd enterprise-v2/desktop
python -m venv .venv && source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt

# 2) Frontend statik export (aynı origin için boş API base)
cd ../../enterprise/frontend
DESKTOP_BUILD=1 NEXT_PUBLIC_API_BASE= npm run build   # → out/

# 3) Uygulamayı çalıştır (repodaki kaynakları kullanır)
cd ../../enterprise-v2/desktop
python launcher.py
```

İlk açılışta bir test Oracle'ı gerekir. Elinizde yoksa Docker:

```bash
docker run -d --name oracle -p 1521:1521 -e ORACLE_PASSWORD=oracle gvenzl/oracle-free
# Bağlantı: host 127.0.0.1, port 1521, servis FREEPDB1, kullanıcı system, şifre oracle
```

## Paketleme (Windows'ta → .exe)

```bat
cd enterprise-v2\desktop
python build.py
```

`build.py` sırasıyla: frontend export'u alır, PyInstaller ile paketler.
Sonuç: `enterprise-v2\desktop\dist\Actuarius\Actuarius.exe` (tek klasör, taşınabilir).

> PyInstaller cross-compile **etmez** — Windows exe'si Windows'ta üretilmelidir.
> CI ile otomatik üretim için `.github/workflows/enterprise-desktop.yml` kullanılır
> (GitHub Actions `windows-latest`).

## Kurulum paketi (opsiyonel, MSI/EXE installer)

`dist\Actuarius\` klasörü olduğu gibi taşınabilir (portable). "Kur" deneyimi
istenirse [Inno Setup](https://jrsoftware.org/isinfo.php) ile tek tıklık installer:
`installer\actuarius.iss` (bkz. o dosya) → `Actuarius-Setup.exe`.

## Dağıtım (offline)

- Üretilen `dist\Actuarius\` klasörünü (veya installer'ı) USB/ağ paylaşımıyla dağıtın.
- Otomatik güncelleme yoktur (internet yok) — yeni sürüm yeni klasör/installer ile gelir.
- Her istemci ilk açılışta Oracle bağlantısını bir kez girer.
