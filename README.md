# Kampüs Ağı 🎓

Üniversite öğrencilerine özel sosyal platform. Express.js + SQLite + Vanilla JS ile geliştirildi.

## Kurulum

```bash
npm install
node server.js
```

Sunucu `http://localhost:3000` adresinde çalışır.

## Düzeltilen Hatalar

1. **`/api/users/:id` endpoint'i eklendi** — `loadUserSettings()` ve ayarlar sayfası için zorunluydu, önceden yoktu
2. **`/api/users/:id` PUT endpoint'i eklendi** — Profil güncelleme çalışır hale getirildi (önceden `alert()` ile mocklanmıştı)
3. **`/api/users/:id/password` PUT endpoint'i eklendi** — Şifre değiştirme özelliği eklendi
4. **Profil sayfası filtresi düzeltildi** — `ad_soyad` karşılaştırması yerine `user_id` query param ile doğru filtreleme yapılıyor
5. **Arama endpoint'i eklendi** — `/api/search?q=` ile içerik ve yazar arama
6. **Liderlik tablosu genişletildi** — 5'ten 10 kullanıcıya çıkarıldı
7. **Token süresi kontrolü** — Sayfa yüklenirken süresi dolmuş token artık temizleniyor
8. **db.js'de FK cascade** — Silinmiş gönderilerin like ve yorumları da silinir

## Özellikler

- Kayıt / Giriş (`.edu.tr` e-posta zorunlu)
- Kampüs Meydanı (genel gönderi, +10 XP)
- Akademik Pano (dosya ekli paylaşım, +50 XP)
- Beğeni ve yorum sistemi
- Liderlik tablosu
- Gerçek zamanlı arama
- Profil & ayarlar (ad, bölüm, şifre)
- Dark mode
- Rozetler
- Admin Kısmı
- Mesajlaşma
