const sqlite3 = require('sqlite3').verbose();

const db = new sqlite3.Database('./kampus_agi.db', (err) => {
    if (err) console.error('Veritabanı hatası:', err.message);
    else console.log('✅ SQLite veritabanına bağlanıldı.');
});

db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        ad_soyad TEXT NOT NULL,
        email TEXT UNIQUE NOT NULL,
        sifre TEXT NOT NULL,
        bolum TEXT,
        xp_puani INTEGER DEFAULT 0,
        is_admin INTEGER DEFAULT 0,
        kayit_tarihi DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    // Mevcut veritabanına is_admin kolonu ekle (zaten varsa hata vermez, görmezden gelinir)
    db.run(`ALTER TABLE users ADD COLUMN is_admin INTEGER DEFAULT 0`, () => {});

    db.run(`CREATE TABLE IF NOT EXISTS posts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER,
        icerik TEXT NOT NULL,
        gonderi_tipi TEXT NOT NULL,
        dosya_yolu TEXT,
        tarih DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS likes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        post_id INTEGER,
        user_id INTEGER,
        UNIQUE(post_id, user_id),
        FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS comments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        post_id INTEGER,
        user_id INTEGER,
        icerik TEXT NOT NULL,
        tarih DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS announcements (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        baslik TEXT NOT NULL,
        icerik TEXT NOT NULL,
        renk TEXT DEFAULT 'var(--accent)',
        tarih DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS notifications (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        tip TEXT NOT NULL,
        mesaj TEXT NOT NULL,
        kaynak_id INTEGER,
        okundu INTEGER DEFAULT 0,
        tarih DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        gonderen_id INTEGER NOT NULL,
        alici_id INTEGER NOT NULL,
        icerik TEXT NOT NULL,
        okundu INTEGER DEFAULT 0,
        tarih DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (gonderen_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (alici_id) REFERENCES users(id) ON DELETE CASCADE
    )`);
});

module.exports = db;