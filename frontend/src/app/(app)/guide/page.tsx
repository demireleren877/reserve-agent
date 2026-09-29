// Uygulama içi kullanım kılavuzu — içerik-only (kapak/menü yok), temiz tipografi.
// İçerik statik public/guide-content.html dosyasından iframe ile gömülür; kendi
// stilini app CSS'inden izole tutar (base64 ekran görüntüleri + TR/EN toggle içerir).
export default function GuidePage() {
  return (
    <div className="flex-1 min-w-0">
      <iframe
        src="/guide-content.html"
        title="Guide"
        className="block w-full h-screen border-0"
      />
    </div>
  );
}
