const express = require('express');
const cors = require('cors');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const db = require('./db');
const fs = require('fs');

const app = express();
app.use(cors());
app.use(express.json());
app.use('/uploads', express.static('uploads'));

const SECRET_KEY = "kampus_agi_cok_gizli_anahtar";

if (!fs.existsSync('./uploads')) { fs.mkdirSync('./uploads'); }

const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, './uploads/'),
    filename: (req, file, cb) => cb(null, Date.now() + '-' + file.originalname)
});
const upload = multer({ storage: storage });

// ==========================================
// 1. KULLANICI İŞLEMLERİ
// ==========================================

app.post('/api/auth/register', async (req, res) => {
    const { ad_soyad, email, bolum, sifre } = req.body;
    if (!email || !email.endsWith('@edu.tr')) {
        return res.status(400).json({ error: "Sadece .edu.tr uzantılı e-postalar kabul edilmektedir!" });
    }
    if (!ad_soyad || !sifre) {
        return res.status(400).json({ error: "Ad soyad ve şifre zorunludur." });
    }
    const hashedSifre = await bcrypt.hash(sifre, 10);
    const sql = `INSERT INTO users (ad_soyad, email, bolum, sifre) VALUES (?, ?, ?, ?)`;
    db.run(sql, [ad_soyad, email, bolum, hashedSifre], function (err) {
        if (err) return res.status(400).json({ error: "Bu e-posta adresi zaten kayıtlı." });
        res.json({ message: "Kayıt başarılı!" });
    });
});

app.post('/api/auth/login', (req, res) => {
    const { email, sifre } = req.body;
    if (!email || !sifre) return res.status(400).json({ error: "E-posta ve şifre zorunludur." });
    db.get(`SELECT * FROM users WHERE email = ?`, [email], async (err, user) => {
        if (!user) return res.status(400).json({ error: "Kullanıcı bulunamadı." });
        const isMatch = await bcrypt.compare(sifre, user.sifre);
        if (!isMatch) return res.status(400).json({ error: "Hatalı şifre." });
        const token = jwt.sign({ id: user.id, ad_soyad: user.ad_soyad }, SECRET_KEY, { expiresIn: '24h' }); //Burası
        res.json({ message: "Giriş başarılı", token, xp: user.xp_puani, is_admin: user.is_admin });
    });
});

// Kullanıcı ara (mesaj başlatmak için) — /:id'den ÖNCE tanımlanmalı
app.get('/api/users/search/:query', (req, res) => {
    const like = `%${req.params.query}%`;
    db.all(
        `SELECT id, ad_soyad, bolum FROM users WHERE ad_soyad LIKE ? LIMIT 8`,
        [like],
        (err, rows) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json(rows || []);
        }
    );
});

// Kullanıcı bilgilerini getir (loadUserSettings için zorunlu)
app.get('/api/users/:id', (req, res) => {
    const userId = req.params.id;
    db.get(`SELECT id, ad_soyad, email, bolum, xp_puani, is_admin, kayit_tarihi FROM users WHERE id = ?`, [userId], (err, user) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!user) return res.status(404).json({ error: "Kullanıcı bulunamadı." });
        res.json(user);
    });
});

// Profil güncelleme
app.put('/api/users/:id', (req, res) => {
    const userId = req.params.id;
    const { ad_soyad, bolum } = req.body;
    if (!ad_soyad) return res.status(400).json({ error: "Ad soyad zorunludur." });
    db.run(
        `UPDATE users SET ad_soyad = ?, bolum = ? WHERE id = ?`,
        [ad_soyad, bolum, userId],
        function (err) {
            if (err) return res.status(500).json({ error: err.message });
            if (this.changes === 0) return res.status(404).json({ error: "Kullanıcı bulunamadı." });
            res.json({ message: "Profil güncellendi!", ad_soyad, bolum });
        }
    );
});

// Şifre değiştirme
app.post('/api/auth/reset-password', async (req, res) => {
    const { email, yeni_sifre } = req.body;
    db.get(`SELECT * FROM users WHERE email = ?`, [email], async (err, user) => {
        if (!user) return res.status(400).json({ error: "Bu e-posta adresine ait bir hesap bulunamadı." });

        const hashedSifre = await bcrypt.hash(yeni_sifre, 10);
        db.run(`UPDATE users SET sifre = ? WHERE email = ?`, [hashedSifre, email], function(err) {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ message: "Şifreniz başarıyla güncellendi!" });
        });
    });
});

// ==========================================
// 2. GÖNDERİ İŞLEMLERİ
// ==========================================

app.post('/api/posts', upload.single('dosya'), (req, res) => {
    const { user_id, icerik, gonderi_tipi } = req.body;
    if (!user_id || !icerik || !gonderi_tipi) {
        return res.status(400).json({ error: "Eksik alanlar var." });
    }
    const dosya_yolu = req.file ? req.file.path.replace(/\\/g, '/') : null;
    const sql = `INSERT INTO posts (user_id, icerik, gonderi_tipi, dosya_yolu) VALUES (?, ?, ?, ?)`;
    db.run(sql, [user_id, icerik, gonderi_tipi, dosya_yolu], function (err) {
        if (err) return res.status(500).json({ error: err.message });
        const kazanilan_xp = (gonderi_tipi === 'Pano') ? 50 : 10;
        db.run(`UPDATE users SET xp_puani = xp_puani + ? WHERE id = ?`, [kazanilan_xp, user_id]);
        res.json({ message: "Gönderi paylaşıldı!", kazanilan_xp, post_id: this.lastID });
    });
});

// YENİ: Gönderileri çekerken 'Ben Beğendim Mi?' kontrolü yapar
app.get('/api/posts', (req, res) => {
    const type = req.query.type; 
    const targetUserId = req.query.user_id; 
    const currentUserId = req.query.current_user || 0; 
    
    let sql = `
        SELECT posts.*, users.ad_soyad, users.bolum,
               (SELECT COUNT(*) FROM likes WHERE likes.post_id = posts.id) as like_count,
               (SELECT COUNT(*) FROM comments WHERE comments.post_id = posts.id) as comment_count,
               (SELECT COUNT(*) FROM likes WHERE likes.post_id = posts.id AND likes.user_id = ?) as is_liked
        FROM posts 
        JOIN users ON posts.user_id = users.id 
    `;
    let params = [currentUserId];

    if (type) {
        sql += ` WHERE posts.gonderi_tipi = ? ORDER BY posts.tarih DESC`;
        params.push(type);
    } else if (targetUserId) {
        sql += ` WHERE posts.user_id = ? ORDER BY posts.tarih DESC`;
        params.push(targetUserId);
    } else {
        sql += ` ORDER BY posts.tarih DESC`;
    }

    db.all(sql, params, (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

app.delete('/api/posts/:id', (req, res) => {
    const postId = req.params.id;
    const userId = req.query.userId;
    db.get(`SELECT * FROM posts WHERE id = ? AND user_id = ?`, [postId, userId], (err, post) => {
        if (!post) return res.status(403).json({ error: "Bu gönderiyi silme yetkiniz yok." });
        db.run(`DELETE FROM posts WHERE id = ?`, [postId], function (err) {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ message: "Gönderi kalıcı olarak silindi." });
        });
    });
});

// ==========================================
// 3. BEĞENİ VE YORUM İŞLEMLERİ
// ==========================================

app.post('/api/posts/:id/like', (req, res) => {
    const postId = req.params.id;
    const { userId } = req.body;
    if (!userId) return res.status(400).json({ error: "userId gerekli." });
    db.get(`SELECT * FROM likes WHERE post_id = ? AND user_id = ?`, [postId, userId], (err, row) => {
        if (row) {
            db.run(`DELETE FROM likes WHERE post_id = ? AND user_id = ?`, [postId, userId], () => {
                res.json({ action: "unliked" });
            });
        } else {
            db.run(`INSERT INTO likes (post_id, user_id) VALUES (?, ?)`, [postId, userId], () => {
                // Gönderi sahibine bildirim gönder
                db.get(`SELECT user_id FROM posts WHERE id = ?`, [postId], (err, post) => {
                    if (post && post.user_id != userId) {
                        db.get(`SELECT ad_soyad FROM users WHERE id = ?`, [userId], (err, liker) => {
                            if (liker) {
                                db.run(
                                    `INSERT INTO notifications (user_id, tip, mesaj, kaynak_id) VALUES (?, ?, ?, ?)`,
                                    [post.user_id, 'like', `${liker.ad_soyad} gönderini beğendi.`, postId]
                                );
                            }
                        });
                    }
                });
                res.json({ action: "liked" });
            });
        }
    });
});

app.post('/api/posts/:id/comment', (req, res) => {
    const postId = req.params.id;
    const { userId, icerik } = req.body;
    if (!userId || !icerik) return res.status(400).json({ error: "userId ve içerik gerekli." });
    db.run(
        `INSERT INTO comments (post_id, user_id, icerik) VALUES (?, ?, ?)`,
        [postId, userId, icerik],
        function (err) {
            if (err) return res.status(500).json({ error: err.message });
            // Gönderi sahibine bildirim gönder
            db.get(`SELECT user_id FROM posts WHERE id = ?`, [postId], (err, post) => {
                if (post && post.user_id != userId) {
                    db.get(`SELECT ad_soyad FROM users WHERE id = ?`, [userId], (err, commenter) => {
                        if (commenter) {
                            db.run(
                                `INSERT INTO notifications (user_id, tip, mesaj, kaynak_id) VALUES (?, ?, ?, ?)`,
                                [post.user_id, 'comment', `${commenter.ad_soyad} gönderine yorum yaptı: "${icerik.substring(0, 40)}${icerik.length > 40 ? '...' : ''}"`, postId]
                            );
                        }
                    });
                }
            });
            res.json({ message: "Yorum eklendi", comment_id: this.lastID });
        }
    );
});

app.get('/api/posts/:id/comments', (req, res) => {
    const postId = req.params.id;
    const sql = `
        SELECT comments.*, users.ad_soyad
        FROM comments
        JOIN users ON comments.user_id = users.id
        WHERE comments.post_id = ?
        ORDER BY comments.tarih ASC
    `;
    db.all(sql, [postId], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows || []);
    });
});

// ==========================================
// 4. LİDERLİK TABLOSU
// ==========================================

app.get('/api/leaderboard', (req, res) => {
    // Sınırı (LIMIT 5) kaldırdık ve 'id' değerini ekledik
    // Sıralamayı ve hesaplamayı artık ön yüzdeki yapay zekamız yapacak
    const sql = `SELECT id, ad_soyad, bolum, xp_puani FROM users`;
    db.all(sql, [], (err, rows) => res.json(rows));
});

// ==========================================
// 5. ARAMA
// ==========================================

app.get('/api/search', (req, res) => {
    const query = req.query.q;
    if (!query || query.trim().length < 2) return res.json({ users: [], posts: [] });
    const like = `%${query}%`;
    
    // 1. Önce doğrudan kullanıcılar tablosunda arama yap (Postu olsun veya olmasın)
    db.all(`SELECT id as user_id, ad_soyad, bolum FROM users WHERE ad_soyad LIKE ? LIMIT 5`, [like], (err, foundUsers) => {
        if (err) return res.status(500).json({ error: err.message });
        
        // 2. Sonra gönderilerde içerik veya yazar araması yap
        const sql = `
            SELECT posts.*, users.ad_soyad, users.bolum,
                   (SELECT COUNT(*) FROM likes WHERE likes.post_id = posts.id) as like_count,
                   (SELECT COUNT(*) FROM comments WHERE comments.post_id = posts.id) as comment_count
            FROM posts
            JOIN users ON posts.user_id = users.id
            WHERE posts.icerik LIKE ? OR users.ad_soyad LIKE ?
            ORDER BY posts.tarih DESC
            LIMIT 10
        `;
        db.all(sql, [like, like], (err, foundPosts) => {
            if (err) return res.status(500).json({ error: err.message });
            
            // İki sonucu tek bir JSON objesi olarak gönder
            res.json({ users: foundUsers, posts: foundPosts });
        });
    });
});


// ==========================================
// 6. DUYURULAR
// ==========================================

// Tüm duyuruları getir (herkese açık)
app.get('/api/announcements', (req, res) => {
    db.all(`SELECT * FROM announcements ORDER BY tarih DESC`, [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows || []);
    });
});

// Duyuru ekle (sadece admin)
app.post('/api/announcements', (req, res) => {
    const { baslik, icerik, renk } = req.body;
    if (!baslik || !icerik) return res.status(400).json({ error: "Başlık ve içerik zorunludur." });

    // Authorization header'dan token al ve admin kontrolü yap
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (!token) return res.status(401).json({ error: "Giriş yapmanız gerekiyor." });

    let decoded;
    try { decoded = jwt.verify(token, SECRET_KEY); }
    catch { return res.status(401).json({ error: "Geçersiz oturum." }); }

    db.get(`SELECT is_admin FROM users WHERE id = ?`, [decoded.id], (err, user) => {
        if (!user || user.is_admin !== 1) {
            return res.status(403).json({ error: "Bu işlem için admin yetkisi gereklidir." });
        }
        db.run(
            `INSERT INTO announcements (baslik, icerik, renk) VALUES (?, ?, ?)`,
            [baslik, icerik, renk || 'var(--accent)'],
            function (err) {
                if (err) return res.status(500).json({ error: err.message });
                const annId = this.lastID;
                // Tüm kullanıcılara duyuru bildirimi gönder
                db.all(`SELECT id FROM users`, [], (err, users) => {
                    if (users) {
                        users.forEach(u => {
                            db.run(
                                `INSERT INTO notifications (user_id, tip, mesaj, kaynak_id) VALUES (?, ?, ?, ?)`,
                                [u.id, 'duyuru', `📢 Yeni duyuru: ${baslik}`, annId]
                            );
                        });
                    }
                });
                res.json({ message: "Duyuru eklendi!", id: annId });
            }
        );
    });
});

// Duyuru sil (sadece admin)
app.delete('/api/announcements/:id', (req, res) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (!token) return res.status(401).json({ error: "Giriş yapmanız gerekiyor." });

    let decoded;
    try { decoded = jwt.verify(token, SECRET_KEY); }
    catch { return res.status(401).json({ error: "Geçersiz oturum." }); }

    db.get(`SELECT is_admin FROM users WHERE id = ?`, [decoded.id], (err, user) => {
        if (!user || user.is_admin !== 1) {
            return res.status(403).json({ error: "Bu işlem için admin yetkisi gereklidir." });
        }
        db.run(`DELETE FROM announcements WHERE id = ?`, [req.params.id], function (err) {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ message: "Duyuru silindi." });
        });
    });
});

// ==========================================
// 7. BİLDİRİMLER
// ==========================================

// Kullanıcının bildirimlerini getir
app.get('/api/notifications/:userId', (req, res) => {
    db.all(
        `SELECT * FROM notifications WHERE user_id = ? ORDER BY tarih DESC LIMIT 30`,
        [req.params.userId],
        (err, rows) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json(rows || []);
        }
    );
});

// Okunmamış bildirim sayısı
app.get('/api/notifications/:userId/unread-count', (req, res) => {
    db.get(
        `SELECT COUNT(*) as count FROM notifications WHERE user_id = ? AND okundu = 0`,
        [req.params.userId],
        (err, row) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ count: row ? row.count : 0 });
        }
    );
});

// Bildirimleri okundu olarak işaretle
app.put('/api/notifications/:userId/read-all', (req, res) => {
    db.run(
        `UPDATE notifications SET okundu = 1 WHERE user_id = ?`,
        [req.params.userId],
        (err) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ message: "Tümü okundu." });
        }
    );
});

// Takip bildirimi (frontend localStorage takip yaptığında çağrılır)
app.post('/api/notify/follow', (req, res) => {
    const { followerId, targetId } = req.body;
    if (!followerId || !targetId) return res.status(400).json({ error: "Eksik parametre." });
    if (followerId == targetId) return res.json({ ok: true });
    db.get(`SELECT ad_soyad FROM users WHERE id = ?`, [followerId], (err, follower) => {
        if (!follower) return res.status(404).json({ error: "Kullanıcı bulunamadı." });
        db.run(
            `INSERT INTO notifications (user_id, tip, mesaj, kaynak_id) VALUES (?, ?, ?, ?)`,
            [targetId, 'takip', `${follower.ad_soyad} seni takip etmeye başladı.`, followerId],
            (err) => {
                if (err) return res.status(500).json({ error: err.message });
                res.json({ ok: true });
            }
        );
    });
});

// ==========================================
// 8. MESAJLAŞMA
// ==========================================

// Konuşma listesi (son mesajlaştığın kişiler)
app.get('/api/messages/conversations/:userId', (req, res) => {
    const userId = req.params.userId;
    const sql = `
        SELECT
            u.id, u.ad_soyad, u.bolum,
            m.icerik as son_mesaj,
            m.tarih as son_tarih,
            m.gonderen_id,
            (SELECT COUNT(*) FROM messages
             WHERE alici_id = ? AND gonderen_id = u.id AND okundu = 0) as okunmamis
        FROM users u
        JOIN messages m ON (
            (m.gonderen_id = u.id AND m.alici_id = ?) OR
            (m.alici_id = u.id AND m.gonderen_id = ?)
        )
        WHERE u.id != ?
        AND m.tarih = (
            SELECT MAX(m2.tarih) FROM messages m2
            WHERE (m2.gonderen_id = u.id AND m2.alici_id = ?)
               OR (m2.alici_id = u.id AND m2.gonderen_id = ?)
        )
        ORDER BY m.tarih DESC
    `;
    db.all(sql, [userId, userId, userId, userId, userId, userId], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows || []);
    });
});

// İki kullanıcı arasındaki mesajlar
app.get('/api/messages/:userId/:otherId', (req, res) => {
    const { userId, otherId } = req.params;
    const sql = `
        SELECT m.*, u.ad_soyad as gonderen_ad
        FROM messages m
        JOIN users u ON m.gonderen_id = u.id
        WHERE (m.gonderen_id = ? AND m.alici_id = ?)
           OR (m.gonderen_id = ? AND m.alici_id = ?)
        ORDER BY m.tarih ASC
    `;
    db.all(sql, [userId, otherId, otherId, userId], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        // Alınan mesajları okundu yap
        db.run(`UPDATE messages SET okundu = 1 WHERE alici_id = ? AND gonderen_id = ?`, [userId, otherId]);
        res.json(rows || []);
    });
});

// Mesaj gönder
app.post('/api/messages', (req, res) => {
    const { gonderen_id, alici_id, icerik } = req.body;
    if (!gonderen_id || !alici_id || !icerik) {
        return res.status(400).json({ error: "Eksik parametre." });
    }
    db.run(
        `INSERT INTO messages (gonderen_id, alici_id, icerik) VALUES (?, ?, ?)`,
        [gonderen_id, alici_id, icerik],
        function(err) {
            if (err) return res.status(500).json({ error: err.message });
            // Alıcıya bildirim gönder
            db.get(`SELECT ad_soyad FROM users WHERE id = ?`, [gonderen_id], (err, sender) => {
                if (sender) {
                    db.run(
                        `INSERT INTO notifications (user_id, tip, mesaj, kaynak_id) VALUES (?, ?, ?, ?)`,
                        [alici_id, 'mesaj', `${sender.ad_soyad} sana mesaj gönderdi.`, gonderen_id]
                    );
                }
            });
            res.json({ message: "Mesaj gönderildi.", id: this.lastID });
        }
    );
});

// Okunmamış mesaj sayısı
app.get('/api/messages/:userId/unread-count', (req, res) => {
    db.get(
        `SELECT COUNT(*) as count FROM messages WHERE alici_id = ? AND okundu = 0`,
        [req.params.userId],
        (err, row) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ count: row ? row.count : 0 });
        }
    );
});


// ==========================================
// SUNUCU BAŞLAT
// ==========================================

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Kampüs Ağı Backend çalışıyor: http://localhost:${PORT}`));