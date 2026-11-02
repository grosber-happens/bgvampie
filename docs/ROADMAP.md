# Yol planı (Kasım 2026)

Bu dosya oyunun nereye gittiğini ve işi nasıl böldüğümüzü anlatır. Oynanışın ayrıntısı [`GAME_DESIGN.md`](GAME_DESIGN.md)'de, ajanların uyacağı kurallar [`../AGENTS.md`](../AGENTS.md)'de. `replit.md` emekliye ayrıldı; kurallar AGENTS.md'ye taşındı.

## Hedef

- 4×4 km tek dünya (Ufuk-i Kehribar), maç başına 40–50 oyuncu, maç 25–35 dakikada biter.
- Ana bölgelerin dışında küçük şehirler ve yerleşimler (estetikleri sonra belirlenecek).
- Binalar, bazı dev mantar evler ve ağaçlar (ağaç evler, büyük mistik ağaç) içine girilebilir.
- Öncelik değişmedi: önce oynanış ve görüntü, tek oyunculu ve botlarla. Multiplayer en son.

## Fazlar

Her faz birkaç küçük göreve bölünür; her görev bir thread ve bir PR olur (aşağıda "İş akışı").

### Faz 0: Temizlik (şimdi)
- Dokümanları kodun bugünkü haliyle eşitle (çift zıplama, nefes barları, satıcı rafı, sniper şarjı, kod haritası). `replit.md` silindi.
- Devam eden işler, yeniden yapılmayacak:
  - **Harita dikey dilimi (A planı)**: planlayıcı haritasını oyunda açma, bozuk dosya davranışı, harita sınırı, yamaç çarpıştırıcıları. Thread: "Planlayıcı haritasını oyuna bağla".
  - **Bandaj, kalkan, satıcılar**: Pills tekrar Bandaj olur (1.5 sn kanal, 0.5 sn'lik tiklerle %30 can); göğüs ve başlık zırhı hasarla azalan ekstra can (kalkan) verir, satıcıda ücretli Tamir butonu; Şanslı satıcı (6 slot, tekrar edebilen eşya, oyun süresi ve seviyeyle nadirlik artar, ücretli slot kolu, 3 aynı eşya kazanır) ve Normal satıcı (6 farklı eşya, yenileme yok). Thread: "Add Bandage, armor and new vendors".

### Faz 1: 4×4 km için teknik temel
Büyük harita ve 40–50 karakter tarayıcıda akıcı dönsün diye. Önce bir **performans test haritası** (4×4 km, yoğun obje, 50 bot) kurulur; her madde bu haritada ölçülür.

| Konu | Neden |
|---|---|
| Chunk streaming | Harita parça parça yüklenir, uzak parçalar bellekten çıkar |
| LOD | Uzak objeler basit modelle çizilir |
| Instancing | Aynı objenin binlerce kopyası tek çizimde (planlayıcı zaten kullanıyor) |
| Frame budget | Her kare için ms bütçesi: çizim, AI, fizik; aşınca uyarı |
| Fixed timestep | Oyun mantığı sabit adımla döner; sim ve ileride sunucu aynı sonucu verir |
| Time slicing + spatial partitioning | 50 botun AI'ı karelere bölünür; yakın birim aramaları ızgarayla |
| Object pooling + parçacıklar | Mermi, efekt ve moblar yeniden kullanılır, takılma olmaz |

Başarı ölçüsü: test haritasında orta seviye bir dizüstünde 60 fps, en kötü kare 25 ms altında.

### Faz 2: Dövüş hissi
Faz 1 ile paralel yürüyebilir.

| Konu | Neden |
|---|---|
| State machine | Karakter durumları (koşu, dash, saldırı, kanal, sersemleme) tek yerde, çakışma yok |
| Input buffering | Dash veya saldırının biraz erken basılan tuşu kaybolmaz (S4 hissi) |
| Raycasting | Nişan, mermi ve görüş hattı kontrolleri tutarlı ve ucuz |
| Hitbox + hit stop | Tür boyuna göre hitbox, vuruşta kısa donma |
| Kamera hissi | Omuz kamerası, sarsıntı, dash ve nişanda yumuşak geçiş |

Bu 12 konunun (Faz 1 ve 2) hepsini Claude üstlenir; senin ayrıca prompt göndermen gerekmez. Her biri ayrı küçük PR olur.

### Faz 3: Harita aracı v2 (ana aracımız)
Planlayıcı haritaları yapmamızın elimiz ayağı olacak. Sırayla:

1. **4×4 km ve chunk görünümü**: haritayı Faz 1'deki chunk düzeniyle göster, her chunk'ın obje, üçgen ve çizim sayısı; bütçeyi aşan chunk kırmızı.
2. **Oyunda oyna**: A planındaki buton; seçilen noktada doğup hemen test.
3. **Bölge fırçası**: bölge sınırlarını elle boya, geçişler yumuşak kalır.
4. **Yerleşim damgası**: küçük şehir ve köyleri hazır gruplar (prefab) halinde tek tıkla koy; döndür, ölçekle, kaydet.
5. **Prefab ve iç mekan editörü**: bina, mantar ev, ağaç ev için kapı, kat, merdiven ve iç çarpıştırıcı; iç mekan ayrı yüklenir.
6. **Oyun katmanları**: doğma noktaları, satıcılar, ganimet, mob yuvaları, daralan halkanın merkezleri; aralarındaki mesafe ve koşu süresi ölçer.
7. **Kontrol katmanları**: yürünebilirlik ve eğim ısı haritası, çarpıştırıcıları göster, ulaşılamayan bölgeleri işaretle.
8. **Harita dosyaları repoda**: haritalar `maps/*.json` olarak kaydedilir, sürüm ve fark görülebilir.
9. **Sim bağlantısı**: harita dosyası simülatöre verilir, çatışma ısı haritası araca geri çizilir.

### Faz 4: Bölge bölge içerik
Her bölge aynı sırayla biter: arazi ve atmosfer → obje ve bina seti (primitiflerle, elle yapılmış his) → içine girilen yapılar → mob ve boss → küçük yerleşimler → test.
Önerilen sıra: Spor Ormanı (mantar evler) → Asma Köyler (ağaç evler) → Kızıl Kanyon ve Katedral → Kemik Şehir → Kehribar Kumu → Turkuaz Lagün. Sırayı sen değiştirebilirsin.

### Faz 5: Maç akışı
40–50 oyuncu (bot) ile tam maç: Kızıl Sis halkasının zamanlaması (25–35 dk), doğma dağılımı, bot AI'ının büyük haritada gezinmesi, maç sonu ekranı.

### Faz 6: Simülasyonu güncelle
Haritalar ve assetler kolaylaştıktan sonra `sim/` oyunun güncel haline yaklaştırılır: yeni harita dosyası, kalkan, yeni satıcılar, 40–50 oyuncu. Sonra denge turu.

### Faz 7: Karakter yaratma ve masaüstü
4 tür ile karakter yaratma, sınıf XP kilitleri, Electron/Tauri masaüstü paketi (Steam/Epic için).

### Faz 8: Multiplayer (en son)
Sunucu otoriteli WebSocket, maç başına oda ve lobi. Faz 1'deki fixed timestep ve saf (Babylon'suz) mantık burada işe yarar.

## İş akışı: denetleyici + işçi ajan

| Rol | Kim | Ne yapar |
|---|---|---|
| Sahip | Sen | Tasarımı belirler, PR'ları onaylar ve merge eder |
| Denetleyici | Proje sohbetindeki Claude | Bu yol planından sıradaki görevi seçer, kısa bir görev tanımı yazar (amaç, kapsam, kapsam dışı, bitti ölçüsü), işçiyi başlatır, PR'ı tanıma ve AGENTS.md'ye göre inceler, sana özet ve öneri verir |
| İşçi | Bir thread'deki Claude ya da Codex | Tek görevi yapar, testleri çalıştırır, PR açar; merge etmez |

Kurallar:
- **Bir görev = bir thread = bir dal = bir PR.** Görev bir PR'a sığmıyorsa denetleyici böler.
- **Dallar:** Claude `claude/...`, Codex `codex/...`. Her dal güncel `main`'den açılır. `main`'e doğrudan commit yapılmaz; küçük düzeltmeler de PR ile gelir, böylece denetleyici her değişikliği görür.
- **Merge'i yalnızca sen yaparsın**, denetleyicinin incelemesinden sonra.
- Kod değişen PR doküman güncellemesini de içerir; `pnpm build` geçmeden PR açılmaz.
- **Bağlam temizliği:** her görev yeni bir thread'de başlar. Kalıcı bilgi dokümanlarda (bu dosya, GAME_DESIGN.md, AGENTS.md) ve proje hafızasında durur; uzun thread'ler iş bitince kapanır.
- Haftalık kullanım dar: denetleyici incelemeyi PR farkı üzerinden yapar, gereksiz kod okumaz; aynı anda en fazla 2–3 işçi çalışır.
