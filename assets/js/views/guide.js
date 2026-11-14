export function renderGuide(role) {
  const isAdmin = String(role || "").toLowerCase() === "admin";
  return `
    <section class="guide-hero">
      <div>
        <span class="guide-kicker"><i class="bi bi-book"></i> Panduan penggunaan</span>
        <h2>${isAdmin ? "Panduan Admin" : "Panduan Peserta Magang"}</h2>
        <p>${isAdmin
          ? "Kelola peserta, pantau dan koreksi absensi, atur jam masuk/pulang, radius GPS, lihat peringkat, dan unduh rekap Excel."
          : "Cara absen masuk dan pulang dengan GPS radius kantor, memakai kamera wajib, melihat riwayat, dan memantau peringkat."}</p>
      </div>
      <div class="guide-hero-art" aria-hidden="true">
        <i class="bi ${isAdmin ? "bi-speedometer2" : "bi-fingerprint"}"></i>
      </div>
    </section>

    <div class="guide-grid">
      <section class="guide-card">
        <h3><span class="guide-icon"><i class="bi bi-rocket-takeoff"></i></span> Mulai cepat</h3>
        <ol class="guide-steps">
          <li><span>1</span><div><strong>Login</strong><p>Masuk dengan username dan password yang diberikan admin.</p></div></li>
          <li><span>2</span><div><strong>Pilih menu</strong><p>Gunakan sidebar di kiri. Di HP, tekan tombol menu di pojok kiri atas.</p></div></li>
          <li><span>3</span><div><strong>Ikuti status</strong><p>Setiap aksi menampilkan toast di pojok layar: hijau berhasil, merah gagal, biru informasi.</p></div></li>
        </ol>
      </section>

      <section class="guide-card">
        <h3><span class="guide-icon"><i class="bi bi-bell"></i></span> Arti notifikasi</h3>
        <ul class="guide-list">
          <li><span class="dot dot-success"></span><div><strong>Toast hijau</strong><p>Data berhasil disimpan atau dikirim.</p></div></li>
          <li><span class="dot dot-danger"></span><div><strong>Toast merah</strong><p>Ada kesalahan. Baca pesannya lalu coba lagi.</p></div></li>
          <li><span class="dot dot-info"></span><div><strong>Modal konfirmasi</strong><p>Muncul sebelum menghapus data. Pilih <em>Batal</em> bila ragu.</p></div></li>
          <li><span class="dot dot-warning"></span><div><strong>Modal password</strong><p>Dipakai admin saat reset password. Isi dua kali lalu simpan.</p></div></li>
        </ul>
      </section>
    </div>

    ${
      isAdmin
        ? `
      <div class="guide-grid">
        <section class="guide-card">
          <h3><span class="guide-icon"><i class="bi bi-people"></i></span> Mengelola peserta</h3>
          <ol class="guide-steps">
            <li><span>1</span><div><strong>Buka menu Peserta</strong><p>Lihat daftar akun, status aktif, avatar, dan waktu login terakhir. Gunakan pencarian, filter role, serta pagination untuk menemukan akun.</p></div></li>
            <li><span>2</span><div><strong>Tambah atau edit</strong><p>Tekan <em>Tambah peserta</em> atau <em>Edit</em> untuk membuka modal. Isi nama, username, password, role, dan status aktif, lalu simpan.</p></div></li>
            <li><span>3</span><div><strong>Reset password</strong><p>Tekan tombol Reset password. Modal sudah terisi pola <code>username123</code>; ganti bila perlu.</p></div></li>
          </ol>
          <div class="guide-note"><i class="bi bi-info-circle"></i><span>Pola akun peserta: username = nama depan, password = nama depan + <code>123</code>. Contoh <code>nayla</code> / <code>nayla123</code>. Peserta juga dapat mengganti password sendiri lewat menu <strong>Akun</strong>; gunakan Reset password jika peserta lupa password lama.</span></div>
        </section>

        <section class="guide-card">
          <h3><span class="guide-icon"><i class="bi bi-sliders"></i></span> Pengaturan absensi</h3>
          <dl class="guide-settings">
            <dt>Batas absen masuk</dt><dd>Jam batas tepat waktu. Absen setelah jam ini ditandai telat. Contoh <code>08:15</code>.</dd>
            <dt>Jam mulai pulang</dt><dd>Absen pulang baru aktif pada atau setelah jam yang ditetapkan. Default <code>17:00</code>, mengikuti zona waktu aplikasi.</dd>
            <dt>Hari absensi</dt><dd>Absensi hanya dibuka Senin-Jumat. Sabtu dan Minggu dianggap libur sehingga tidak dihitung sebagai keterlambatan atau ketidakhadiran.</dd>
            <dt>Zona waktu</dt><dd>Gunakan format <code>Asia/Jakarta</code>, <code>Asia/Makassar</code>, atau <code>Asia/Jayapura</code>.</dd>
            <dt>Koordinat kantor</dt><dd>Isi latitude dan longitude berpasangan. Bisa disalin dari Google Maps; periksa kembali sebelum menyimpan.</dd>
            <dt>Radius absensi</dt><dd>Isi radius dalam meter. Server menolak absensi jika posisi pengguna berada di luar radius kantor. Nilai 0 menonaktifkan geofence.</dd>
            <dt>Akurasi GPS maksimal</dt><dd>Batas toleransi akurasi GPS dalam meter. Absensi ditolak jika akurasi perangkat lebih buruk dari nilai ini. Nilai awal 100 m.</dd>
          </dl>
          <div class="guide-note"><i class="bi bi-lightbulb"></i><span>Perubahan pengaturan tersimpan di server. Batas absen masuk, batas pulang, radius kantor, dan akurasi GPS diperiksa langsung oleh server saat absensi.</span></div>
        </section>

        <section class="guide-card">
          <h3><span class="guide-icon"><i class="bi bi-person-badge"></i></span> Catatan tentang role Admin</h3>
          <div class="guide-note"><i class="bi bi-info-circle"></i><span>Admin adalah pembina/pendamping peserta magang, bukan peserta itu sendiri. Karena itu:</span></div>
          <ul class="guide-list">
            <li><span><strong>Admin tidak absensi</strong> &mdash; sistem tidak menyediakan fitur absensi untuk akun admin.</span></li>
            <li><span><strong>Rekap peserta hanya berisi data peserta</strong> &mdash; data absensi admin tidak tercampur dengan rekap peserta magang.</span></li>
            <li><span><strong>Statistik kehadiran hanya menghitung peserta</strong> &mdash; jumlah hadir, tepat waktu, telat, dan tidak hadir hanya dihitung dari absensi peserta magang.</span></li>
            <li><span><strong>Leaderboard hanya untuk peserta</strong> &mdash; admin tidak memiliki posisi di peringkat peserta magang.</span></li>
          </ul>
        </section>
      </div>

      <section class="guide-card">
        <h3><span class="guide-icon"><i class="bi bi-chat-square-text"></i></span> Kotak saran</h3>
        <ol class="guide-steps">
          <li><span>1</span><div><strong>Buka menu Kotak Saran</strong><p>Lihat ringkasan status Baru, Dibaca, Diproses, dan Selesai. Gunakan pencarian atau filter status untuk menemukan saran.</p></div></li>
          <li><span>2</span><div><strong>Balas saran</strong><p>Tekan <em>Balas</em>, pilih status tindak lanjut, lalu tulis balasan maksimal 2000 karakter. Simpan setelah memeriksa ringkasan konfirmasi.</p></div></li>
          <li><span>3</span><div><strong>Hapus bila perlu</strong><p>Tombol Hapus menghapus saran dan balasannya secara permanen. Konfirmasi hanya dilakukan setelah admin memilih <em>Hapus saran</em>.</p></div></li>
        </ol>
      </section>

      <section class="guide-card">
        <h3><span class="guide-icon"><i class="bi bi-file-earmark-excel"></i></span> Rekap dan export</h3>
        <div class="guide-two-col">
          <div>
            <h4>Melihat rekap</h4>
            <p>Menu Absensi menampilkan seluruh absensi dengan pagination. Gunakan pencarian, filter tanggal, dan filter status untuk mempersempit data.</p>
          </div>
          <div>
            <h4>Export Excel</h4>
            <p>Tekan Export Excel di header atau di menu Pengaturan. File berisi sheet <strong>Absensi</strong> (dengan foto masuk/pulang tertanam), <strong>Akun</strong>, <strong>Pengaturan</strong>, dan <strong>Log</strong>.</p>
          </div>
          <div>
            <h4>Hapus data</h4>
            <p>Edit satu absensi untuk mengoreksi status tepat waktu/telat serta jam masuk/pulang. Jam pulang tidak boleh lebih awal dari jam masuk. Hapus satu absensi lewat tombol Hapus di tabel; hapus seluruh absensi peserta lewat menu Peserta.</p>
          </div>
          <div>
            <h4>Akun nonaktif</h4>
            <p>Hilangkan centang Aktif saat mengedit peserta. Akun tidak bisa login, tetapi data absensinya tetap tersimpan.</p>
          </div>
          <div>
            <h4>Insight harian</h4>
            <p>Kartu <strong>Insight hari ini</strong> menampilkan persentase kehadiran, perbandingan tepat waktu dan telat, serta jumlah peserta yang belum absen. Gunakan angka ini untuk memantau kehadiran dengan cepat.</p>
          </div>
          <div>
            <h4>Peringkat peserta</h4>
            <p>Menu <strong>Peringkat</strong> menampilkan klasemen Kebun Magang. Poin dihitung dari hari hadir (10), tepat waktu (5), pulang lengkap (2), catatan (1), durasi kerja (1/jam, maksimal 5), streak (1 s.d. 5), dan datang paling awal (3/2/1 untuk tiga peserta pertama). Poin panen dan poin curian peserta menjadi bonus peringkat maksimal sebesar poin kehadirannya. Gunakan filter bulan atau <em>Semua waktu</em> untuk melihat periode lain.</p>
          </div>
        </div>
      </section>
    `
        : `
      <section class="guide-card">
        <h3><span class="guide-icon"><i class="bi bi-fingerprint"></i></span> Cara absen yang benar</h3>
        <ol class="guide-steps">
          <li><span>1</span><div><strong>Lokasi GPS wajib</strong><p>Lokasi dideteksi otomatis. Izinkan akses lokasi dan aktifkan lokasi presisi. Tombol absen terkunci jika GPS belum siap, akurasi melebihi batas, atau posisi berada di luar radius kantor.</p></div></li>
          <li><span>2</span><div><strong>Foto wajib</strong><p>Gunakan <em>Kamera Perangkat</em> atau <em>Kamera Browser</em>. Tombol absen baru aktif setelah foto siap dan lokasi memenuhi radius serta batas akurasi.</p></div></li>
          <li><span>3</span><div><strong>Isi catatan (opsional)</strong><p>Contoh: WFO, izin, atau keterangan tambahan. Maksimal 500 karakter.</p></div></li>
          <li><span>4</span><div><strong>Tekan Absen Masuk</strong><p>Setelah berhasil, tombol berubah menjadi <em>Sudah Absen Masuk</em>. Tombol <em>Absen Pulang</em> aktif mulai jam pulang yang ditentukan admin dan server menolak absen lebih awal atau di luar radius.</p></div></li>
        </ol>
        <div class="guide-note"><i class="bi bi-calendar-week"></i><span>Absensi hanya tersedia Senin-Jumat. Pada Sabtu dan Minggu tombol absen dinonaktifkan karena dianggap hari libur.</span></div>
        <div class="guide-note"><i class="bi bi-camera"></i><span>Jika izin kamera tidak muncul, buka lewat <code>http://localhost</code> atau HTTPS, lalu izinkan kamera lewat ikon gembok di address bar.</span></div>
      </section>

      <div class="guide-grid">
        <section class="guide-card">
          <h3><span class="guide-icon"><i class="bi bi-clock-history"></i></span> Riwayat absensi</h3>
          <p>Menu Riwayat menampilkan absensi pribadi: tanggal, jam masuk, jam pulang, status tepat waktu/telat, dan foto. Kartu insight merangkum ketepatan waktu bulan ini.</p>
          <p class="mb-0">Gunakan filter bulan untuk melihat periode tertentu, atau tombol <em>Semua</em> untuk menampilkan data terbaru. Tekan thumbnail foto untuk membuka pratinjau besar tanpa meninggalkan halaman.</p>
        </section>

        <section class="guide-card">
          <h3><span class="guide-icon"><i class="bi bi-flower1"></i></span> Kebun Magang</h3>
          <p>Menu <strong>Peringkat</strong> menampilkan klasemen Kebun Magang. Poin peringkat berasal dari hari hadir (<strong>10 poin</strong>), bonus tepat waktu (<strong>+5 poin</strong>), absen pulang lengkap (<strong>+2 poin</strong>), catatan harian (<strong>+1 poin</strong>), durasi kerja (<strong>+1 poin/jam</strong>, maksimal 5), streak (<strong>+1 s.d. +5 poin</strong>), dan datang paling awal (<strong>+3/+2/+1 poin</strong>). Poin panen dan poin curian menjadi bonus peringkat maksimal sebesar poin kehadiran Anda.</p>
          <p>Buka menu <strong>Kebun</strong> untuk menanam bibit di plot. Setiap bibit punya durasi dan hasil berbeda; bibit serta plot baru terbuka saat level kebun naik. Panen memberi <strong>Poin Panen</strong> dan <strong>XP Kebun</strong>. Absen masuk memberi <strong>air</strong> untuk mempercepat panen 15 menit, sedangkan absen pulang memberi <strong>pupuk</strong> untuk menambah 20% hasil. Halaman <strong>Absen Hari Ini</strong> menampilkan pengingat untuk menanam, menyiram, memupuk, dan memanen, lengkap dengan stok air/pupuk serta jumlah plot yang perlu dirawat.</p>
          <p>Mulai <strong>Lv. 3</strong> Anda bisa mencuri sebagian panen peserta lain yang sudah siap. Maksimal <strong>3 kali/hari</strong>, <strong>1 kali per peserta</strong>, dan <strong>1 kali per plot</strong>. Poin curian masuk ke peringkat Anda, sedangkan pemilik tetap bisa panen dengan hasil dikurangi. Kabar panen yang dicuri tampil di menu Kebun.</p>
          <p class="mb-0">Tanaman siap panen masih aman selama setengah durasi berikutnya. Setelah itu hasilnya layu 50%, lalu kering tanpa hasil. Level kebun: Bibit, Tunas, Muda, Berbunga, Subur, lalu Rindang. Gunakan filter bulan untuk peringkat periode tertentu atau <em>Semua waktu</em> untuk akumulasi.</p>
        </section>

        <section class="guide-card">
          <h3><span class="guide-icon"><i class="bi bi-chat-square-text"></i></span> Kotak saran</h3>
          <p>Menu <strong>Kotak Saran</strong> menyediakan formulir masukan dengan kategori Umum, Absensi, Tampilan, Fitur, Bug, atau Lainnya. Isi saran 5–1500 karakter lalu konfirmasi pengiriman.</p>
          <p class="mb-0">Saran yang sudah dikirim tampil di daftar beserta status dan balasan admin. Tekan <em>Muat ulang</em> untuk mengambil pembaruan terbaru.</p>
        </section>

        <section class="guide-card">
          <h3><span class="guide-icon"><i class="bi bi-person-badge"></i></span> Avatar dan pencapaian</h3>
          <p>Buka menu <strong>Akun</strong>, lalu tekan <em>Ubah avatar</em> untuk memilih emoji dan warna. Avatar tampil di menu, header, dan daftar peserta admin.</p>
          <p class="mb-0">Kartu pencapaian menyesuaikan role. Peserta magang membuka lencana dari kebiasaan absen: langkah pertama, tepat waktu, rajin, disiplin bulan ini, dan streak. Admin memiliki lencana aktivitas sendiri: meninjau pengajuan, menyetujui izin/koreksi, dan menerbitkan pengumuman. Lencana terbuka otomatis saat target tercapai.</p>
        </section>

        <section class="guide-card">
          <h3><span class="guide-icon"><i class="bi bi-shield-check"></i></span> Keamanan akun</h3>
          <ul class="guide-list guide-list-compact">
            <li><i class="bi bi-check2-circle"></i><span>Jangan bagikan password ke orang lain.</span></li>
            <li><i class="bi bi-check2-circle"></i><span>Selalu keluar setelah memakai perangkat bersama.</span></li>
            <li><i class="bi bi-check2-circle"></i><span>Lupa password? Buka menu <strong>Akun</strong> untuk mengganti sendiri. Jika lupa password lama, minta admin melakukan reset.</span></li>
            <li><i class="bi bi-check2-circle"></i><span>Sesi berlaku 12 jam; setelah itu login ulang.</span></li>
          </ul>
        </section>
      </div>

      <section class="guide-card">
        <h3><span class="guide-icon"><i class="bi bi-person-gear"></i></span> Mengubah profil dan password</h3>
        <ol class="guide-steps">
          <li><span>1</span><div><strong>Buka menu Akun</strong><p>Klik menu <em>Akun</em> di sidebar atau ikon profil di kanan atas, lalu pilih <em>Akun saya</em>.</p></div></li>
          <li><span>2</span><div><strong>Ubah nama dan avatar</strong><p>Perbarui nama lengkap lalu tekan <em>Simpan nama</em>. Tekan <em>Ubah avatar</em> untuk memilih emoji dan warna.</p></div></li>
          <li><span>3</span><div><strong>Ganti password</strong><p>Isi password lama, password baru, lalu ulangi password baru. Indikator kekuatan dan daftar syarat membantu memastikan password sudah benar.</p></div></li>
          <li><span>4</span><div><strong>Simpan</strong><p>Setelah berhasil, sesi di perangkat lain otomatis keluar. Perangkat yang sedang dipakai tetap masuk.</p></div></li>
        </ol>
        <div class="guide-note"><i class="bi bi-info-circle"></i><span>Lupa password lama? Hubungi admin untuk reset password. Setelah direset, Anda bisa menggantinya sendiri lewat menu Akun.</span></div>
      </section>
    `
    }      <section class="guide-card">
        <h3><span class="guide-icon"><i class="bi bi-shield-gear"></i></span> Perbedaan role Admin dan Peserta</h3>
        <div class="guide-two-col">
          <div>
            <h4>Role Admin (Pembina)</h4>
            <p>Admin adalah pembina/pendamping magang, <strong>bukan peserta</strong>. Akun admin:</p>
            <ul class="guide-list">
              <li><i class="bi bi-check-lg"></i><span><strong>Tidak bisa absensi</strong> &mdash; tombol absen tidak tersedia untuk admin.</span></li>
              <li><i class="bi bi-check-lg"></i><span><strong>Tidak muncul di rekap peserta</strong> &mdash; data absensi admin tidak tercampur dengan data peserta.</span></li>
              <li><i class="bi bi-check-lg"></i><span><strong>Tidak muncul di leaderboard</strong> &mdash; peringkat hanya untuk peserta magang.</span></li>
              <li><i class="bi bi-check-lg"></i><span><strong>Bisa kelola peserta</strong> &mdash; lihat, tambah, edit, nonaktifkan akun peserta.</span></li>
              <li><i class="bi bi-check-lg"></i><span><strong>Bisa koreksi absensi</strong> &mdash; edit status tepat waktu/telat, jam masuk/pulang.</span></li>
              <li><i class="bi bi-check-lg"></i><span><strong>Bisa export Excel</strong> &mdash; unduh rekap absensi lengkap.</span></li>
              <li><i class="bi bi-check-lg"></i><span><strong>Bisa atur pengaturan</strong> &mdash; jam masuk/pulang, radius GPS, zona waktu.</span></li>
            </ul>
          </div>
          <div>
            <h4>Role Peserta Magang (Intern)</h4>
            <p>Peserta magang adalah peserta yang wajib absensi setiap hari kerja. Akun peserta:</p>
            <ul class="guide-list">
              <li><i class="bi bi-check-lg"></i><span><strong>Wajib absensi</strong> &mdash; absen masuk dan pulang setiap hari Senin-Jumat.</span></li>
              <li><i class="bi bi-check-lg"></i><span><strong>GPS dan foto wajib</strong> &mdash; absensi hanya bisa dilakukan di kantor dengan foto selfie.</span></li>
              <li><i class="bi bi-check-lg"></i><span><strong>Lihat riwayat pribadi</strong> &mdash; hanya melihat absensi sendiri.</span></li>
              <li><i class="bi bi-check-lg"></i><span><strong>Lihat leaderboard</strong> &mdash; peringkat kehadiran peserta magang.</span></li>
              <li><i class="bi bi-check-lg"></i><span><strong>Kebun Magang</strong> &mdash; fitur tambahan berbasis kehadiran.</span></li>
              <li><i class="bi bi-check-lg"></i><span><strong>Bisa ajukan izin/koreksi</strong> &mdash; absen terlambat, izin, sakit, cuti.</span></li>
            </ul>
            <div class="guide-note"><i class="bi bi-info-circle"></i><span>Jika Anda admin tapi ingin mencoba fitur absensi, minta admin lain membuatkan akun peserta khusus untuk testing.</span></div>
          </div>
        </div>
      </section>

      <section class="guide-card">
        <h3><span class="guide-icon"><i class="bi bi-question-circle"></i></span> Pertanyaan yang sering muncul</h3>
      <div class="accordion guide-faq" id="guide-faq">
        <div class="accordion-item">
          <h4 class="accordion-header">
            <button class="accordion-button collapsed" type="button" data-bs-toggle="collapse" data-bs-target="#faq-camera" aria-expanded="false" aria-controls="faq-camera">Kamera tidak muncul, apa yang harus dilakukan?</button>
          </h4>
          <div id="faq-camera" class="accordion-collapse collapse" data-bs-parent="#guide-faq">
            <div class="accordion-body">Pastikan halaman dibuka lewat <code>localhost</code> atau HTTPS, izinkan kamera di browser, dan tutup aplikasi lain yang sedang memakai kamera. Alternatifnya gunakan tombol <em>Kamera Perangkat</em> atau <em>Upload Foto</em>.</div>
          </div>
        </div>
        <div class="accordion-item">
          <h4 class="accordion-header">
            <button class="accordion-button collapsed" type="button" data-bs-toggle="collapse" data-bs-target="#faq-gps" aria-expanded="false" aria-controls="faq-gps">Lokasi GPS gagal diambil</button>
          </h4>
          <div id="faq-gps" class="accordion-collapse collapse" data-bs-parent="#guide-faq">
            <div class="accordion-body">Aktifkan lokasi di pengaturan HP, izinkan browser mengakses lokasi, dan pilih mode akurasi tinggi. Jika akurasi masih di atas batas, pindah ke area terbuka lalu tekan <em>Perbarui GPS</em>. Absensi tidak dapat disimpan tanpa GPS yang valid dan berada di dalam radius kantor.</div>
          </div>
        </div>
        <div class="accordion-item">
          <h4 class="accordion-header">
            <button class="accordion-button collapsed" type="button" data-bs-toggle="collapse" data-bs-target="#faq-session" aria-expanded="false" aria-controls="faq-session">Muncul pesan sesi berakhir</button>
          </h4>
          <div id="faq-session" class="accordion-collapse collapse" data-bs-parent="#guide-faq">
            <div class="accordion-body">Sesi berlaku 12 jam. Login ulang dengan username dan password yang sama. Jika masih gagal, hubungi admin untuk memastikan akun masih aktif.</div>
          </div>
        </div>
        <div class="accordion-item">
          <h4 class="accordion-header">
            <button class="accordion-button collapsed" type="button" data-bs-toggle="collapse" data-bs-target="#faq-password" aria-expanded="false" aria-controls="faq-password">Lupa password</button>
          </h4>
          <div id="faq-password" class="accordion-collapse collapse" data-bs-parent="#guide-faq">
            <div class="accordion-body">Buka menu <strong>Akun</strong> lalu isi password lama, password baru, dan konfirmasi. Password tidak bisa dilihat kembali karena disimpan sebagai hash. Jika lupa password lama, minta admin membuka menu <strong>Peserta</strong> lalu menekan <strong>Reset password</strong>.</div>
          </div>
        </div>
        <div class="accordion-item">
          <h4 class="accordion-header">
            <button class="accordion-button collapsed" type="button" data-bs-toggle="collapse" data-bs-target="#faq-stale" aria-expanded="false" aria-controls="faq-stale">Data belum berubah setelah disimpan</button>
          </h4>
          <div id="faq-stale" class="accordion-collapse collapse" data-bs-parent="#guide-faq">
            <div class="accordion-body">Data diperbarui otomatis setiap 30 detik saat tab aktif. Tunggu beberapa saat dan pastikan koneksi internet stabil. Perubahan yang baru disimpan juga langsung dimuat ulang oleh aplikasi.</div>
          </div>
        </div>
        <div class="accordion-item">
          <h4 class="accordion-header">
            <button class="accordion-button collapsed" type="button" data-bs-toggle="collapse" data-bs-target="#faq-export" aria-expanded="false" aria-controls="faq-export">Export Excel tidak berjalan</button>
          </h4>
          <div id="faq-export" class="accordion-collapse collapse" data-bs-parent="#guide-faq">
            <div class="accordion-body">Pastikan login sebagai admin dan koneksi stabil. Export dengan foto memuat library ExcelJS dari CDN, jadi butuh internet. Jika gagal, aplikasi tetap mengunduh file tanpa gambar dan menampilkan peringatan.</div>
          </div>
        </div>
      </div>
    </section>

    <p class="guide-footer">Butuh bantuan lain? Hubungi admin TELKOM AKSES dan sertakan tangkapan layar pesan kesalahan.</p>
  `;
}
