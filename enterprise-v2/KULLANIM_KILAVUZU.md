# Actuarius Enterprise — Kullanım Kılavuzu

Aktüeryal rezerv / IBNR analiz uygulaması (masaüstü, offline). Bu kılavuz uygulamanın
mevcut sürümündeki tüm modülleri ve iş akışlarını kapsar.

---

## İçindekiler
1. [Genel Bakış](#1-genel-bakış)
2. [Kurulum ve Giriş](#2-kurulum-ve-giriş)
3. [Proje · Dönem · Branş Yapısı](#3-proje--dönem--branş-yapısı)
4. [Veri Modülü](#4-veri-modülü)
5. [Rezerv Modülü](#5-rezerv-modülü)
   - [Veri sekmesi](#51-veri-sekmesi)
   - [Dosya sekmesi](#52-dosya-sekmesi)
   - [LDF sekmesi](#53-ldf-sekmesi)
   - [Curve sekmesi](#54-curve-sekmesi)
   - [ILR sekmesi](#55-ilr-sekmesi)
   - [BF sekmesi](#56-bf-sekmesi)
   - [Frekans-Şiddet sekmesi](#57-frekans-şiddet-sekmesi)
   - [Ultimate / IBNR sekmesi](#58-ultimate--ibnr-sekmesi)
   - [Özet sekmesi](#59-özet-sekmesi)
6. [Large-Loss Ayrımı (Attritional / Large)](#6-large-loss-ayrımı)
7. [Roll-Forward (Dönem İlerletme)](#7-roll-forward-dönem-ilerletme)
8. [Nakit Akışı ve İskonto](#8-nakit-akışı-ve-iskonto)
9. [Excel'e Aktarma](#9-excele-aktarma)
10. [Çok-Kullanıcı Çalışma](#10-çok-kullanıcı-çalışma)
11. [Sık Karşılaşılan Durumlar](#11-sık-karşılaşılan-durumlar)

---

## 1. Genel Bakış

Uygulama; hasar verisinden gelişim üçgenleri kurar, chain-ladder (CL) ve
Bornhuetter-Ferguson (BF) yöntemleriyle **ultimate** ve **IBNR** hesaplar, curve
(tail) modelleriyle CDF projeksiyonu yapar, nakit akışı pattern'i üretir ve
iskonto uygular. Büyük hasarları (large-loss) ana modelden ayırıp ayrı
modelleyebilir; dönemler arası roll-forward yapabilirsiniz.

Uygulama **internet gerektirmez**; şirket ağındaki (LAN) Oracle veritabanına
bağlanır. Tüm hesaplar yereldedir.

---

## 2. Kurulum ve Giriş

1. Uygulamayı başlatın (masaüstü kısayolu / `Actuarius.exe`). Açılışta kısa bir
   **"Yükleniyor"** ekranı görünür, ardından giriş ekranı gelir.
2. **İlk açılış — bağlantı kurulumu:** Kurulum ekranında Oracle bağlantısını
   (kullanıcı, şifre, DSN) ve ilk **admin** hesabını girin. Bu bilgi bu
   bilgisayarda güvenli saklanır.
3. **Giriş:** Kullanıcı adı + şifre ile giriş yapın. Yöneticiler yeni kullanıcı
   ekleyebilir (Yönetim → Kullanıcılar).

> **Offline makinede açılış yavaşsa:** Windows'un sertifika iptal kontrolü
> (CRL/OCSP) internete ulaşamayıp beklediği için olabilir. Çözüm: İnternet
> Seçenekleri → Gelişmiş → "sertifika iptalini denetle" kutucuklarını kapatın ve
> **WebView2 Runtime**'ın kurulu olduğundan emin olun.

---

## 3. Proje · Dönem · Branş Yapısı

Veriler üç seviyede düzenlenir:

- **Proje / Dönem:** Değerleme dönemi (ör. `2025Q4`, `2026Q1`). Her dönem kendi
  verisini ve modelini tutar.
- **Branş:** Sigorta branşı (ör. Kasko, Trafik). Her branşın kendi üçgeni ve
  model parametreleri vardır.
- **Model:** Bir branşın bir dönemdeki tüm varsayımları (elemeler, curve seçimi,
  premium, LR, basis vb.).

Üst gezinme çubuğundan proje → dönem → branş arasında geçiş yaparsınız.

---

## 4. Veri Modülü

Ham verilerin içe aktarıldığı ve saklandığı yer. Her dönem için ayrı veri
tipleri vardır:

| Tip | İçerik | Kolonlar |
|---|---|---|
| **Hasar Verisi** | Dosya bazlı hasar kayıtları | Dosya No, Branş, Hasar Tarihi, Gelişim Tarihi, Ödeme, Muallak |
| **Büyük Hasar (Large)** | Large-loss dosya bazlı kayıtlar | (Hasar ile aynı) |
| **Prim Verisi** | Dönemsel kazanılmış prim | Branş, Dönem, Prim/EP |
| **Üçgen Verisi** | Hazır paid/incurred üçgeni | Branş, Üçgen Türü, Kaza Dönemi, Gelişim Dönemi |
| **Large Üçgen** | Hazır large paid/incurred üçgeni | (Üçgen ile aynı) |

**İçe aktarma:** İlgili kartta **İçe Aktar** → dosya seç (Excel/CSV) → sütun
eşleştirme sihirbazı → onayla. Yüklenen dataset kartta listelenir; **Görüntüle**
ile içeriğini, **Sil** ile kaldırırsınız.

> Dosya bazlı hasar verisinde her hasarın **Dosya No** ile takip edilmesi, ileride
> "Dosya" analizi ve LDF değişim attribution'ı için gereklidir.

---

## 5. Rezerv Modülü

Bir branş açtığınızda üstte sekmeler görünür: **Veri · Dosya · LDF · Curve · ILR ·
BF · Frekans-Şiddet · Ultimate/IBNR · Özet**. Sağ üstteki **↓ Excel** ile analizi
dışa aktarabilirsiniz.

Modele veri yüklemek için **Veri** sekmesinde **"Veri Modülünden Yükle"**
kullanılır:
- **Hasar verisi** → dosya kayıtlarından üçgen kurar (dosya kırılımı da dolar).
- **Hazır üçgen** → önceden yüklenmiş üçgeni yükler.
- **Roll-forward** → önceki dönemin üzerine yeni dönemi taşır (bkz. Bölüm 7).

### 5.1 Veri sekmesi

Yüklü üçgeni gösterir. Üst kontrol şeridi görünümü ayarlar (veriyi değiştirmez):

- **Değer:** Kümülatif ↔ Artımsal.
- **Sütun:** *Gelişim* (klasik üçgen) ↔ *Takvim* (köşegenleri sütuna taşır;
  takvim-yılı etkilerini görmek için). Takvim görünümünde son sütun = rapor dönemi.
- **Düzen:** Transpoze (eksen takası).
- **Kaza / Gelişim dönemi:** Granülarite. Yalnızca yukarı toplama yapılabilir
  (kayıt granülaritesinin altına inilmez). Gelişim tavanı 1 yıl; kaza tavanı veri
  süresi. **Max** butonu tam toplar.
- **Ondalık:** Gösterilen ondalık basamak (0–10).

Tür sekmeleri: **Ödeme · Muallak · Gerçekleşen**. Her üçgenin altında **Toplam**
satırı (sütun toplamları) bulunur.

Bu sekmeden **"+ Large üçgeni"** ile large verisi de yüklenir (bkz. Bölüm 6).

### 5.2 Dosya sekmesi

Dosya (DOSYA_NO) bazlı analizler: istatistikler, büyük hasar listesi, dosya
gelişimi ve dönemler arası runoff karşılaştırması. Yalnızca dosya kırılımlı
(hasar kaydından kurulmuş) branşlarda doludur.

### 5.3 LDF sekmesi

Gelişim faktörlerinin (age-to-age) hesaplandığı ve seçildiği yer.

- **Link-ratio üçgeni:** Her hücre bir gelişim oranı. **Hücreye tıklayınca**
  o oran elenir (aykırı değerleri dışlamak için); tekrar tıklayınca geri gelir.
- **Volume (window) satırları:** Seçili LDF'yi hangi geçmiş pencereyle
  hesaplayacağınızı belirler — **Son 4 / 5 / 6 / 7 / Tüm** ve en altta
  **kullanıcı tanımlı "Son N"** satırı (varsayılan 10; istediğiniz sayıyı
  yazabilirsiniz).
  - **Satır etiketine tıkla** → tüm adımlar için o pencere.
  - **Tek hücreye tıkla** → yalnızca o gelişim adımı için (karma/per-step volume).
- **CDF satırı:** Seçili LDF'lerden türeyen kümülatif faktörler (Curve
  override'ları yansıtır).
- **Heatmap:** Kolon bazlı aykırı değer renklendirmesi (varsayılan kapalı).
- **Ondalık:** Faktör gösterim ondalığı.
- **Dönem karşılaştırma (hover):** Bir hücrenin üzerine gelince küçük bir popup;
  **bu dönem** ve **önceki dönem** LDF değeri, farkı ve — değişim varsa —
  **buna sebep olan dosyalar** (dosya no, önceki→bu ödeme, durum: *large'a geçti /
  yeni / arttı / azaldı*). Önceki döneme göre **değişen hücreler amber** vurgulanır.

### 5.4 Curve sekmesi

CDF kuyruk (tail) modellemesi.

- Her gelişim dönemi için model seçilir: **Initial** (LDF'den), **Exp. Decay**,
  **Inv. Power**, **Power**, **Weibull**, veya **User Value** (elle CDF).
- Sürükleyerek birden çok döneme aynı modeli uygularsınız.
- **Include (Yes/No):** Bir dönemin eğri regresyonuna dahil edilip edilmeyeceği.
  LDF ≤ 1 olan dönemler otomatik hariç.
- **Grafik:** Fit edilmiş eğrileri ve gözlenen noktaları gösterir (R², χ² fit
  istatistikleriyle).
- **Selected / Cumul CDF / Cumul% / Incr%** kolonları projeksiyonu özetler.

### 5.5 ILR sekmesi

Incremental Loss Ratio üçgeni — her hücre kümülatif hasarın (düzeltilmiş) prime
oranı. Prim gelişimini ve olgunlaşmayı izlemek için.

### 5.6 BF sekmesi

Bornhuetter-Ferguson girdileri: origin bazında **prim**, **düzeltme katsayısı
(k)** (çeyreklik/kısmi dönem yıllığa tamamlama), **beklenen loss ratio (ELR)** ve
**temel (CL/BF)** seçimi. Formül desteğiyle Selected LR girilebilir.

### 5.7 Frekans-Şiddet sekmesi

Average Cost per Claim yöntemi: **adet üçgeni × ortalama maliyet**. Adet üçgeni
DOSYA_NO'dan türetilir. Büyük hasarların ayrı modellenmesinde alternatif yöntem
olarak kullanılabilir.

### 5.8 Ultimate / IBNR sekmesi

Origin bazında **Latest · Exposure · CL Ultimate · BF Ultimate · IBNR · ULR**.
Her origin için CL veya BF hücresine tıklayarak (veya sürükleyerek) **temel**
seçilir. Toplam Ultimate/IBNR/ULR üstte özetlenir.

### 5.9 Özet sekmesi

Modelin tek sayfalık raporu:

- **Hero:** Seçili IBNR + Latest→IBNR kompozisyon çubuğu + ikincil metrikler
  (Ultimate, Exposure, ULR).
- **Aktüer Müdahaleleri:** Default'tan sapan tüm seçimler (eleme, curve override,
  BF correction, manuel LR…) chip olarak.
- **Segment Kırılımı** (large yüklüyse): Attritional / Large / **Toplam**.
- **Origin Bazında Final** tablosu (k, CDF, %Dev, temel, Sel.LR, Ult, IBNR, ULR).
  Eleme yapıldıysa **Eleme** sütunu ve **"Eleme detayı"** modalı (hangi hücre
  elemesi IBNR'ı ne kadar etkiledi).

---

## 6. Large-Loss Ayrımı

Büyük hasarlar ana modelin LDF'lerini oynatır (bir dosya bir dönem attritional
iken sonra large limite takılıp modelden çıkabilir). Bunu önlemek için large'ı
ayırabilirsiniz.

**Mantık:** `Attritional = Gross − Large`. Ana model **Attritional** üzerinde
çalışır (stabil); **Large** kendi bağımsız modeliyle ayrıca modellenir;
**Toplam = Attritional + Large**.

**Nasıl yüklenir:**
1. **Veri Modülü**'nde large verisini içe aktarın — **"Büyük Hasar (Large)"**
   (dosya bazlı) veya **"Large Üçgen"** (hazır üçgen) kartından.
2. Rezerv → **Veri** sekmesi → **"+ Large üçgeni"** → yükleyicide kaynağı seçip
   (Hasar verisi / Hazır üçgen) yükleyin.

Large yüklenince:
- Üstte **segment seçici** çıkar: **[Attritional | Large]**.
  - *Attritional:* ana model (Gross − Large), branşın kendi parametreleriyle.
  - *Large:* kendi **bağımsız** parametreleriyle (window, eleme, curve, BF…) tüm
    sekmelerde modellenir.
- **Toplam** kırılımı Özet sekmesinde görünür.
- **"Kaldır (✕)"** ile large kaldırılır, model tekrar gross'a döner.

**Uyarılar (guard):**
- *Large > Gross* çıkan hücreler 0'a kırpılır + kırmızı uyarı (veri kalitesi).
- *Large, gross'tan az gelişim dönemi içeriyorsa* "güncel değerlemeye ait değil"
  uyarısı — bu dönemin large'ını yeniden yükleyin (yoksa büyük hasarlar
  attritional'a sızar).

> **Tutarlılık kuralı:** Gross ve Large'ı **aynı yöntemle** besleyin (ikisi de
> roll-forward, ya da ikisi de yeniden kurulum). Karıştırırsanız `Large > Gross`
> tutarsızlıkları oluşur.

---

## 7. Roll-Forward (Dönem İlerletme)

Önceki dönemin üçgenini ve **tüm model varsayımlarını** koruyarak yeni dönemin
verisini üzerine taşır — **sadece veri ilerler, seçimler/formüller aynı kalır**.

**Adımlar:**
1. Yeni dönemin hasar verisini **Veri Modülü**'ne yükleyin (gross; large varsa
   **"Büyük Hasar (Large)"** verisini de).
2. Rezerv → yeni dönem branşı → **Veri** → **Veri Modülünden Yükle** →
   **Roll-forward** kaynağı.
3. Üzerine taşınacak önceki dönemi seçin (sistemde hem ödeme hem muallak üçgeni
   olan dönem) → **İleri Taşı**.

**Önemli davranışlar:**
- Geçmiş köşegenler **değişmez**; yalnızca yeni köşegen eklenir (yeni kaza dönemi
  yeni satır olur).
- **Model varsayımları korunur:** elemeler, curve seçimi, CDF, premium, LR, basis,
  correction, window ve **largeModel** önceki dönemden aynen taşınır.
- **Large de birlikte ilerler:** Branşta large varsa, roll-forward aynı dönemin
  large hasar verisiyle large'ı da ileri taşır. Bu döneme ait large verisi yoksa
  net hata verir (tutarlılık için).
- **Dosya kırılımı birikir:** Her roll-forward'ın yeni köşegen dosya kırılımı
  önceki dönemlerinkiyle birleşir; geçmiş dosya detayı korunur.

> Roll-forward mı yoksa her dönem yeniden kurulum mu — **tutarlı** olun. Yeniden
> kurulumda geçmiş, güncel large/attritional sınıflandırmasına göre yeniden
> yazılır (LDF'ler dönemsel oynar); roll-forward'da geçmiş sabittir.

---

## 8. Nakit Akışı ve İskonto

**Nakit Akışı** modülü, gelişim pattern'inden çeyreklik/aylık ödeme dağılımını
üretir (CF Pattern / Aylık Pattern). Pattern tablosu **Matris** (kaza yılı satır,
period sütun) veya **Liste** olarak görüntülenebilir; Excel'e aktarılır.

**İskonto** modülü, bu pattern ve seçilen iskonto eğrisi ile rezervin bugünkü
değerini hesaplar. Standartlar: IFRS 4 (SEDDK) ve IFRS 17 (eğri + illikidite +
risk marjı → LIC). Varsayılanlar üç yerde senkron tutulur.

---

## 9. Excel'e Aktarma

Rezerv sekmesindeki **↓ Excel** butonu analizi **formüllü ve renkli** bir
çalışma kitabına aktarır:
- Renkli başlıklar/toplam satırları, son köşegen (rapor dönemi) vurgusu.
- **Canlı formüller** (Özet): `CL Ult = Latest×CDF`, `Seçilen = IF(baz)`,
  `IBNR = Seçilen − Latest`, `ULR`, toplamlar `SUM` — Excel'de değer değişince
  yeniden hesaplanır.
- Ayrı sayfalar: Özet, LDF-CDF, Curve, ILR, BF Girdileri, üçgenler.

Nakit akışı modülünde de üçgen/LDF/curve/pattern Excel indirmesi mevcuttur.

> İndirmede native **"Farklı Kaydet"** penceresi açılır; dosyayı istediğiniz yere
> kaydedin.

---

## 10. Çok-Kullanıcı Çalışma

Aynı projede birden çok kişi çalışabilir; **hiçbir emek kaybı** olmayacak şekilde
korunursunuz:

- **Model kilidi:** Bir branş modelini açtığınızda kilit sizde olur; başkası
  aynı anda düzenleyemez (salt-okunur görür). Kilit bırakılmazsa TTL sonunda
  düşer. Gerekirse **"Devral"** ile kilidi alabilirsiniz.
- **Otomatik birleştirme:** Kaydınız sunucudakiyle 3-yollu birleştirilir — sizin
  değiştirdiğiniz branş sizde kalır, yalnızca başkasının değiştirdiği güncellenir,
  silmeler ve yeni eklemeler doğru birleşir.
- Değişiklikler periyodik senkronlanır; kilit alındığında anlık güncellenir.

---

## 11. Sık Karşılaşılan Durumlar

**"Hem ödeme hem muallak üçgeni olmalı" hatası (roll-forward):** Roll-forward
temeli seçilen dönemde her iki üçgen de yüklü olmalı.

**LDF karşılaştırmasında her hücre 'değişmiş' görünüyor:** Muhtemelen segment
uyuşmazlığı — güncel sürümde giderildi; attritional↔attritional, large↔large
karşılaştırılır. Yine de görüyorsanız gross ve large'ı aynı yöntemle beslediğinizden
emin olun.

**Roll-forward sonrası elemeler/curve gitti:** Güncel sürümde roll-forward tüm
model seçimlerini korur. Sürümü güncelleyin.

**EP/prim yüklü dönem görünmüyor:** Prim datasetinin doğru dönem/branşta yüklü
olduğunu kontrol edin.

**Muallak son kaza yılı Excel'le tutmuyor:** Aynı dosya birden çok satırda
(currency kırılımı) olabilir; sistem aynı dosya+aynı gelişim tarihinde muallağı
toplar, farklı tarihte sonuncuyu alır.

---

*Bu kılavuz uygulamanın mevcut sürümünü kapsar. Yeni özellik eklendikçe
güncellenmelidir.*
