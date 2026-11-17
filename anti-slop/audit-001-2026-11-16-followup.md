# Antislop audit 001: laporan perbaikan

- Tanggal: 2026-11-16
- Disetujui user: semua nomor (1-18)
- Diuji di http://localhost:8770, desktop 1280x800 dan mobile 375x812

| No | Status | Yang diubah | Bukti |
|---|---|---|---|
| 1 | Selesai | Kontak (username, invite, grup utama) sekarang statis di HTML; `homeError` menyembunyikan "More from us", nav "Games" ikut hilang, cerita studio tanpa data tetap terbaca | Data dipindah sementara: angka "?", tombol hero "Contact the studio", pesan error di Top game, copy username (klik asli) "Copied vcatcat", invite tetap discord.gg |
| 2 | Selesai | Pad ink 0,85 di belakang kolom teks hero (64px lebih besar, blur 28px), mengikuti kolom di semua lebar | Kasus terburuk (screenshot putih) jadi sekitar 9:1, sebelumnya 2,84:1 |
| 3 | Selesai | Judul kartu di `games.html` jadi `h2` | Urutan heading: H1, H2, H2, H2, H2 |
| 4 | Selesai | Link footer `min-height: 44px` | Tinggi terukur 44px di kedua halaman; tidak ada kontrol < 44px di 375px |
| 5 | Selesai | Penangan `error` untuk semua gambar: thumbnail ke ikon game, lalu blok ink dengan nama game; gambar mosaik dan thumb galeri dibuang | Uji URL 404: pertama jatuh ke ikon, kedua menampilkan "Stack A Souffle Pancake [ASMR]" |
| 6 | Selesai | Nav "Top game" (netral), disembunyikan bersama section bila tidak ada game; judul "Busiest at the last refresh" / "Most visited" | Nav yang tampil hanya ke section yang ada |
| 7 | Selesai | Titik hijau dibuang; label "Playing at last refresh"; satu baris waktu refresh di bawah angka | Tidak ada warna hijau lagi |
| 8 | Selesai | Semua `h2` satu warna; brand dan h1 krem; amber hanya tombol main + angka pemain (+ fokus, pressed, hover sebagai penanda keadaan) | Elemen amber yang terlihat: 3 tombol main + 1 angka |
| 9 | Selesai | Reveal scroll, animasi maskot mendarat dan kartu miring dibuang; tinggal mosaik (bisa dipause) dan satu count-up | 0 elemen `.reveal` |
| 10 | Selesai | Ledger dibuang; cerita tanpa angka total; waktu refresh tampil sekali per halaman | "23,574/23.5K" muncul 1 kali, "refreshed" 1 kali |
| 11 | Selesai | Motif stiker hanya di logo, kartu Top game, tombol main; panel Discord, hover kartu, text-shadow h1, bayangan maskot dibuang | Kepala CSS diperbarui |
| 12 | Selesai | Radius cuma 12px (kontrol) dan 20px (kartu) | Radius terukur: 12px, 20px |
| 13 | Selesai | Panel Discord memakai ink-2, status salin krem, hijau dibuang | 0 elemen dengan warna lama |
| 14 | Selesai | Mosaik 6x3 (36 gambar, 18 duplikat lazy); CSS font dimuat tanpa memblokir render (`preload` + `onload`, `noscript` cadangan) | Belum diukur dengan Lighthouse |
| 15 | Selesai | Ikon di statistik kartu dibuang, diganti label teks ("1.2K visits"); segitiga play hanya di tombol Play | |
| 16 | Selesai | UI tetap bahasa Inggris; deskripsi game diberi `lang="id"`; paragraf hero tanpa daftar nama game | |
| 17 | Selesai | Link "All games" (nav, tombol) hanya muncul bila game > 9; sort bar hanya bila game >= 6 | Dengan 4 game: link tersembunyi, sort tersembunyi, halaman tetap bisa dibuka langsung |
| 18 | Selesai | Rotasi kartu Top game dibuang | `transform: none` |

## Klik ulang setelah perbaikan
- Galeri Top game, pause/play latar, copy username (normal dan saat error), menu mobile + Escape, link nav ke section yang ada: semua bekerja.
- Console: tidak ada error. Tidak ada scroll horizontal di 375px. Tidak ada em dash.
