const express = require('express');
const router = express.Router();
const db = require('../config/database');
const { checkAuth } = require('../middleware/auth');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcrypt');
const moment = require('moment');


// Ensure uploads directory exists
const uploadDir = path.join(__dirname, '..', '..', 'public', 'uploads', 'profiles');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

// Configure multer for profile photo uploads
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, uploadDir);
    },
    filename: function (req, file, cb) {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, `user_${req.session.userId}_${uniqueSuffix}${path.extname(file.originalname)}`);
    }
});

const fileFilter = (req, file, cb) => {
    // Accept images only
    if (!file.originalname.match(/\.(jpg|jpeg|png|gif)$/)) {
        return cb(new Error('Only image files are allowed!'), false);
    }
    cb(null, true);
};

// User dashboard profile page route
router.get('/user-dashboard/profile', checkAuth, (req, res) => {
    const userId = req.session.userId;
    const query = `
        SELECT id, nom, email, telephone, adresse, gouvernorat, ville, code_postal, photo_profile
        FROM utilisateurs 
        WHERE id = ?
    `;
    
    db.query(query, [userId], (err, results) => {
        if (err) {
            console.error('Error fetching user profile:', err);
            return res.render('user-dashboard/profile', { 
                error: 'حدث خطأ في جلب بيانات الملف الشخصي',
                user: { id: userId }
            });
        }

        const user = results[0];
        res.render('user-dashboard/profile', { user });
    });
});

// Bookings page route
router.get('/user-dashboard/bookings', checkAuth, (req, res) => {
    const userId = req.session.userId;
    const query = `
        SELECT b.*, a.spécialité, u.nom as artisan_name, u.photo_profile
        FROM bookings b
        JOIN artisans a ON b.artisan_id = a.id
        JOIN utilisateurs u ON a.utilisateur_id = u.id
        WHERE b.user_id = ?
        ORDER BY b.booking_date DESC, b.booking_time DESC
    `;
    
    db.query(query, [userId], (err, bookings) => {
        if (err) {
            console.error('Error fetching bookings:', err);
            return res.render('user-dashboard/bookings', { 
                error: 'حدث خطأ في جلب بيانات الحجوزات',
                user: { id: userId }
            });
        }

        // Format the bookings data
        const formattedBookings = bookings.map(booking => ({
            ...booking,
            photo_profile: booking.photo_profile ? booking.photo_profile.toString('base64') : null,
            booking_date: new Date(booking.booking_date).toLocaleDateString('ar-TN'),
            booking_time: booking.booking_time.slice(0, 5),
            status_class: {
                'pending': 'bg-yellow-100 text-yellow-800',
                'confirmed': 'bg-green-100 text-green-800',
                'cancelled': 'bg-red-100 text-red-800'
            }[booking.status]
        }));

        res.render('user-dashboard/bookings', { bookings: formattedBookings, user: { id: userId } });
    });
});

// Settings page route
router.get('/user-dashboard/settings', checkAuth, (req, res) => {
    const userId = req.session.userId;
    res.render('user-dashboard/settings', { user: { id: userId } });
});

// Update profile
router.post('/user-dashboard/update-profile', checkAuth, (req, res) => {
    const upload = multer({ 
        storage: storage,
        fileFilter: fileFilter,
        limits: {
            fileSize: 5 * 1024 * 1024 // 5MB max file size
        }
    }).single('photo_profile');

    upload(req, res, function(err) {
        if (err instanceof multer.MulterError) {
            console.error('Multer error:', err);
            return res.status(500).json({ error: 'حدث خطأ في تحميل الصورة' });
        } else if (err) {
            console.error('Unknown error:', err);
            return res.status(500).json({ error: 'حدث خطأ غير معروف' });
        }

        const userId = req.session.userId;
        const { nom, email, telephone, adresse, gouvernorat, ville, code_postal } = req.body;

        let updateQuery = `
            UPDATE utilisateurs 
            SET nom = ?, email = ?, telephone = ?, adresse = ?, 
                gouvernorat = ?, ville = ?, code_postal = ?
        `;
        let queryParams = [nom, email, telephone, adresse, gouvernorat, ville, code_postal];

        if (req.file) {
            updateQuery += ', photo_profile = ?';
            const relativePath = path.relative(
                path.join(__dirname, '..', '..', 'public'),
                req.file.path
            ).replace(/\\/g, '/');
            queryParams.push(relativePath);
        }

        updateQuery += ' WHERE id = ?';
        queryParams.push(userId);

        db.query(updateQuery, queryParams, (dbErr, result) => {
            if (dbErr) {
                console.error('Error updating profile:', dbErr);
                return res.status(500).json({ error: 'حدث خطأ في تحديث الملف الشخصي' });
            }

            // Fetch the updated user data
            db.query('SELECT * FROM utilisateurs WHERE id = ?', [userId], (fetchErr, results) => {
                if (fetchErr) {
                    console.error('Error fetching updated user:', fetchErr);
                    return res.status(500).json({ error: 'حدث خطأ في جلب البيانات المحدثة' });
                }

                const updatedUser = results[0];
                const userData = {
                    success: true,
                    message: 'تم تحديث الملف الشخصي بنجاح',
                    user: {
                        nom: updatedUser.nom,
                        email: updatedUser.email,
                        telephone: updatedUser.telephone,
                        adresse: updatedUser.adresse,
                        gouvernorat: updatedUser.gouvernorat,
                        ville: updatedUser.ville,
                        code_postal: updatedUser.code_postal,
                        photo_profile: updatedUser.photo_profile
                    }
                };

                res.json(userData);
            });
        });
    });
});

// Update password
router.post('/user-dashboard/update-password', checkAuth, express.json(), async (req, res) => {
    const userId = req.session.userId;
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
        return res.status(400).json({ error: 'جميع الحقول مطلوبة' });
    }

    if (newPassword.length < 6) {
        return res.status(400).json({ error: 'كلمة المرور الجديدة يجب أن تكون 6 أحرف على الأقل' });
    }

    try {
        // First verify the current password
        const verifyQuery = 'SELECT mot_de_passe FROM utilisateurs WHERE id = ?';
        db.query(verifyQuery, [userId], async (err, results) => {
            if (err) {
                console.error('Error verifying password:', err);
                return res.status(500).json({ error: 'حدث خطأ في التحقق من كلمة المرور' });
            }

            if (!results.length) {
                return res.status(404).json({ error: 'المستخدم غير موجود' });
            }

            const currentHashedPassword = results[0].mot_de_passe;
            const isMatch = await bcrypt.compare(currentPassword, currentHashedPassword);

            if (!isMatch) {
                return res.status(400).json({ error: 'كلمة المرور الحالية غير صحيحة' });
            }

            // Update to new password
            const hashedPassword = await bcrypt.hash(newPassword, 10);
            const updateQuery = 'UPDATE utilisateurs SET mot_de_passe = ? WHERE id = ?';
            db.query(updateQuery, [hashedPassword, userId], (updateErr, result) => {
                if (updateErr) {
                    console.error('Error updating password:', updateErr);
                    return res.status(500).json({ error: 'حدث خطأ في تحديث كلمة المرور' });
                }

                res.json({ success: true, message: 'تم تحديث كلمة المرور بنجاح' });
            });
        });
    } catch (error) {
        console.error('Error in password update:', error);
        res.status(500).json({ error: 'حدث خطأ في تحديث كلمة المرور' });
    }
});

// Cancel booking
router.post('/user-dashboard/cancel-booking/:id', checkAuth, (req, res) => {
    const bookingId = req.params.id;
    const userId = req.session.userId;

    const query = `
        UPDATE bookings 
        SET status = 'cancelled' 
        WHERE id = ? AND user_id = ?
    `;

    db.query(query, [bookingId, userId], (err, result) => {
        if (err) {
            console.error('Error cancelling booking:', err);
            return res.status(500).json({ error: 'حدث خطأ في إلغاء الحجز' });
        }

        res.json({ success: true, message: 'تم إلغاء الحجز بنجاح' });
    });
});


// MESSAGERIE CLIENT - ARTISAN
router.get('/user-dashboard/messages', checkAuth, (req, res) => {
    const userId = req.session.userId;
    const receiverId = req.query.with;

    // Requête pour récupérer tous les artisans
    const artisanQuery = `SELECT id, nom, photo_profile FROM utilisateurs WHERE rôle = 'artisan'`;

    db.query(artisanQuery, (errArtisan, artisans) => {
        if (errArtisan) {
            console.error(errArtisan);
            return res.status(500).send("Erreur serveur lors de la récupération des artisans.");
        }

        // Si aucun artisan sélectionné, afficher uniquement la liste sans messages
        if (!receiverId) {
            return res.render('user-dashboard/messages', {
                messages: [],
                receiverId: null,
                receiverName: null,
                artisans
            });
        }

        // Requête pour les messages entre utilisateur connecté et artisan sélectionné
        const queryMessages = `
            SELECT 
                sender_id, receiver_id, content, timestamp,
                sender_id = ? AS fromUser
            FROM messages
            WHERE 
                (sender_id = ? AND receiver_id = ?)
                OR
                (sender_id = ? AND receiver_id = ?)
            ORDER BY timestamp ASC
        `;

        db.query(queryMessages, [userId, userId, receiverId, receiverId, userId], (errMessages, rawMessages) => {
            if (errMessages) {
                console.error(errMessages);
                return res.status(500).send("Erreur serveur lors de la récupération des messages.");
            }

            // Formater les dates des messages avec moment
            const messages = rawMessages.map(msg => ({
                ...msg,
                timestamp: moment(msg.timestamp).format('YYYY-MM-DD HH:mm') // Format choisi ici
            }));

            // Requête pour récupérer le nom du correspondant (artisan)
            const queryUser = `SELECT nom FROM utilisateurs WHERE id = ?`;
            db.query(queryUser, [receiverId], (errName, result) => {
                if (errName) {
                    console.error(errName);
                    return res.status(500).send("Erreur serveur lors de la récupération du nom.");
                }

                const receiver = result[0];

                res.render('user-dashboard/messages', {
                    messages,
                    receiverId,
                    receiverName: receiver ? receiver.nom : 'مستخدم',
                    artisans
                });
            });
        });
    });
});

// ✅ Envoyer un message
router.post('/user-dashboard/messages/send', checkAuth, (req, res) => {
    const senderId = req.session.userId;
    const { receiverId, message } = req.body;

    if (!message || !receiverId) {
        return res.status(400).send('Données invalides');
    }

    const insertQuery = `
        INSERT INTO messages (sender_id, receiver_id, content)
        VALUES (?, ?, ?)
    `;

    db.query(insertQuery, [senderId, receiverId, message], (err, result) => {
        if (err) {
            console.error(err);
            return res.status(500).send("Erreur lors de l'envoi");
        }

        res.redirect(`/user-dashboard/messages?with=${receiverId}`);
    });
});



module.exports = router;
