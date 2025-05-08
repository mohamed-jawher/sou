const express = require('express');
const router = express.Router();
const db = require('../config/database');
const transporter = require('../config/email');
const crypto = require('crypto');
const bcrypt = require('bcrypt');

// Update login page route to redirect if already logged in
router.get('/login', (req, res) => {
    if (req.session.userId) {
        return res.redirect('/');
    }
    res.render('login', { title: 'Connexion' });
});

// Route pour la page d'inscription
router.get('/signup', (req, res) => {
    // If already logged in, redirect to home
    if (req.session.userId) {
        return res.redirect('/');
    }
    res.render('signup/index', { 
        title: 'إنشاء حساب جديد - TN M3allim',
        user: null
    });
});

// Inscription d'un utilisateur
router.post('/signup', (req, res) => {
    const { nom, email, mot_de_passe, rôle, date_naissance } = req.body;

    // Validate required fields
    if (!nom || !email || !mot_de_passe || !rôle || !date_naissance) {
        return res.json({ success: false, message: 'الرجاء إدخال جميع المعلومات المطلوبة' });
    }

    // Validate age (must be over 18)
    const birthDate = new Date(date_naissance);
    const today = new Date();
    let age = today.getFullYear() - birthDate.getFullYear();
    const monthDiff = today.getMonth() - birthDate.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
        age--;
    }
    if (age <= 18) {
        return res.json({ success: false, message: 'يجب أن يكون عمرك أكبر من 18 سنة' });
    }

    // Validate email format
    const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
    if (!emailRegex.test(email)) {
        return res.json({ success: false, message: 'صيغة البريد الإلكتروني غير صحيحة' });
    }

    // Validate password length
    if (mot_de_passe.length <= 8) {
        return res.json({ success: false, message: 'يجب أن تحتوي كلمة المرور على أكثر من 8 أحرف' });
    }

    // Check if user already exists
    db.query('SELECT * FROM utilisateurs WHERE email = ?', [email], (err, results) => {
        if (err) {
            console.error('Error checking email:', err);
            return res.status(500).json({ success: false, message: 'خطأ في الخادم' });
        }

        if (results.length > 0) {
            return res.json({ success: false, message: 'هذا البريد الإلكتروني مستخدم بالفعل' });
        }

        // Hash password
        bcrypt.hash(mot_de_passe, 10, (err, hashedPassword) => {
            if (err) {
                console.error('Hashing error:', err);
                return res.status(500).json({ success: false, message: 'خطأ في الخادم' });
            }

            // Insert into database
            const query = 'INSERT INTO utilisateurs (nom, email, mot_de_passe, rôle, date_naissance) VALUES (?, ?, ?, ?, ?)';
            db.query(query, [nom, email, hashedPassword, rôle, date_naissance], (err) => {
                if (err) {
                    console.error('Error adding user:', err);
                    return res.status(500).json({ success: false, message: 'خطأ في الخادم' });
                }

                res.json({ success: true, message: 'تم إنشاء الحساب بنجاح' });
            });
        });
    });
});

// Connexion d'un utilisateur
router.post('/login', (req, res) => {
    const { email, password } = req.body;

    if (!email || !password) {
        return res.status(400).json({ error: 'يرجى إدخال البريد الإلكتروني وكلمة المرور' });
    }

    db.query('SELECT * FROM utilisateurs WHERE email = ?', [email], (err, results) => {
        if (err) {
            console.error('Erreur lors de la récupération de l\'utilisateur:', err);
            return res.status(500).json({ error: 'خطأ في الخادم. يرجى المحاولة مرة أخرى.' });
        }

        if (results.length === 0) {
            return res.status(401).json({ error: 'البريد الإلكتروني أو كلمة المرور غير صحيحة.' });
        }

        const user = results[0];

        bcrypt.compare(password, user.mot_de_passe, (err, isMatch) => {
            if (err) {
                console.error('Erreur lors de la comparaison:', err);
                return res.status(500).json({ error: 'خطأ في الخادم. يرجى المحاولة مرة أخرى.' });
            }

            if (!isMatch) {
                return res.status(401).json({ error: 'البريد الإلكتروني أو كلمة المرور غير صحيحة.' });
            }

            // Set session data
            req.session.userId = user.id;
            req.session.userRole = user.rôle;
            req.session.userName = user.nom;

            // Update last_login on successful login
            const now = new Date();
            db.query('UPDATE utilisateurs SET last_login = ?, active = TRUE WHERE id = ?', [now, user.id]);

            // Determine redirect URL based on user role
            let redirectUrl = '/';
            if (user.rôle === 'admin') redirectUrl = '/admin';
            else if (user.rôle === 'artisan') redirectUrl = '/artisan';
            
            // Save session before responding
            req.session.save(err => {
                if (err) {
                    console.error('Session save error:', err);
                    return res.status(500).json({ error: 'خطأ في الخادم' });
                }
                
                return res.json({ 
                    success: true, 
                    redirect: redirectUrl,
                    user: {
                        id: user.id,
                        name: user.nom,
                        role: user.rôle
                    }
                });
            });
        });
    });
});

// Update logout route to use POST for better security
router.post('/logout', (req, res) => {
    const userId = req.session.userId;
    req.session.destroy(err => {
        if (userId) {
            db.query('UPDATE utilisateurs SET active = FALSE WHERE id = ?', [userId]);
        }
        if (err) {
            console.error('Error destroying session:', err);
            return res.status(500).json({ error: 'Error logging out' });
        }
        res.json({ success: true, redirect: '/' });
    });
});

// Keep the GET logout for backward compatibility
router.get('/logout', (req, res) => {
    const userId = req.session.userId;
    req.session.destroy(err => {
        if (userId) {
            db.query('UPDATE utilisateurs SET active = FALSE WHERE id = ?', [userId]);
        }
        if (err) {
            console.error('Error destroying session:', err);
            return res.status(500).json({ error: 'Error logging out' });
        }
        res.redirect('/');
    });
});

// Add this route to handle forgot password
// Add GET route for forgot password page
router.get('/forgot-password', (req, res) => {
    res.render('auth/forgot-password', {
        title: 'نسيت كلمة المرور - TN M3allim',
        user: null
    });
});

// Update the POST route name to match
// Add forgot password route
router.post('/forgot-password', async (req, res) => {
    const { email } = req.body;
    
    if (!email) {
        return res.status(400).json({ error: 'البريد الإلكتروني مطلوب' });
    }

    try {
        // Check if user exists
        const [user] = await db.promise().query('SELECT * FROM utilisateurs WHERE email = ?', [email]);
        
        if (!user.length) {
            return res.status(404).json({ error: 'البريد الإلكتروني غير مسجل' });
        }

        // Generate reset token
        const token = crypto.randomBytes(32).toString('hex');
        const expires = new Date(Date.now() + 3600000); // 1 hour

        // Update user with reset token
        await db.promise().query(
            'UPDATE utilisateurs SET reset_token = ?, reset_expires = ? WHERE email = ?',
            [token, expires, email]
        );

        // Send email
        await transporter.sendMail({
            from: 'tnm3allim-project@itqanlabs.com',
            to: email,
            subject: 'إعادة تعيين كلمة المرور',
            html: `
                <div dir="rtl">
                    <h2>إعادة تعيين كلمة المرور</h2>
                    <p>لقد تلقينا طلباً لإعادة تعيين كلمة المرور الخاصة بك.</p>
                    <p>اضغط على الرابط التالي لإعادة تعيين كلمة المرور:</p>
                    <a href="http://localhost:3001/auth/reset-password/${token}">إعادة تعيين كلمة المرور</a>
                    <p>ينتهي هذا الرابط خلال ساعة واحدة.</p>
                </div>
            `
        });

        res.json({ message: 'تم إرسال رابط إعادة تعيين كلمة المرور إلى بريدك الإلكتروني' });
    } catch (error) {
        console.error('Forgot password error:', error);
        res.status(500).json({ error: 'حدث خطأ في الخادم' });
    }
});

// Add route for reset password page
router.get('/reset-password/:token', async (req, res) => {
    const { token } = req.params;
    
    try {
        // Check if token exists and is not expired
        const [user] = await db.promise().query(
            'SELECT * FROM utilisateurs WHERE reset_token = ? AND reset_expires > NOW()',
            [token]
        );

        if (!user.length) {
            return res.render('auth/reset-password-error', {
                title: 'رابط غير صالح - TN M3allim',
                message: 'رابط إعادة تعيين كلمة المرور غير صالح أو منتهي الصلاحية'
            });
        }

        res.render('auth/reset-password', {
            title: 'إعادة تعيين كلمة المرور - TN M3allim',
            token: token,
            user: null
        });
    } catch (error) {
        console.error('Reset password error:', error);
        res.status(500).render('error', { 
            message: 'حدث خطأ في الخادم'
        });
    }
});

// Add route to handle password reset
router.post('/reset-password/:token', async (req, res) => {
    const { token } = req.params;
    const { password } = req.body;

    if (!password) {
        return res.status(400).json({ error: 'كلمة المرور مطلوبة' });
    }

    try {
        // Check if token exists and is not expired
        const [user] = await db.promise().query(
            'SELECT * FROM utilisateurs WHERE reset_token = ? AND reset_expires > NOW()',
            [token]
        );

        if (!user.length) {
            return res.status(400).json({ error: 'رابط إعادة تعيين كلمة المرور غير صالح أو منتهي الصلاحية' });
        }

        // Hash new password
        const hashedPassword = await bcrypt.hash(password, 10);

        // Update password and clear reset token
        await db.promise().query(
            'UPDATE utilisateurs SET mot_de_passe = ?, reset_token = NULL, reset_expires = NULL WHERE reset_token = ?',
            [hashedPassword, token]
        );

        res.json({ message: 'تم تغيير كلمة المرور بنجاح' });
    } catch (error) {
        console.error('Reset password error:', error);
        res.status(500).json({ error: 'حدث خطأ في الخادم' });
    }
});

// TEMPORARY ROUTE: Add 'last_login' column to utilisateurs table if it doesn't exist
router.get('/add-last-login-column', (req, res) => {
    const alterQuery = `ALTER TABLE utilisateurs ADD COLUMN last_login DATETIME DEFAULT NULL`;
    db.query(alterQuery, (err, result) => {
        if (err) {
            if (err.code === 'ER_DUP_FIELDNAME') {
                return res.send("'last_login' column already exists.");
            }
            console.error('Error adding last_login column:', err);
            return res.send('Error adding last_login column: ' + err.message);
        }
        res.send("'last_login' column added successfully!");
    });
});

// Add date_naissance column to utilisateurs table if it doesn't exist
router.get('/add-date-naissance-column', (req, res) => {
    const alterQuery = `ALTER TABLE utilisateurs ADD COLUMN date_naissance DATE DEFAULT NULL`;
    db.query(alterQuery, (err, result) => {
        if (err) {
            if (err.code === 'ER_DUP_FIELDNAME') {
                return res.send("'date_naissance' column already exists.");
            }
            console.error('Error adding date_naissance column:', err);
            return res.send('Error adding date_naissance column: ' + err.message);
        }
        res.send("'date_naissance' column added successfully!");
    });
});

// Add new columns to utilisateurs table
router.get('/add-new-columns', (req, res) => {
    const alterQuery = `
        ALTER TABLE utilisateurs 
        ADD COLUMN IF NOT EXISTS telephone VARCHAR(20) DEFAULT NULL,
        ADD COLUMN IF NOT EXISTS adresse TEXT DEFAULT NULL,
        ADD COLUMN IF NOT EXISTS gouvernorat VARCHAR(50) DEFAULT NULL,
        ADD COLUMN IF NOT EXISTS ville VARCHAR(50) DEFAULT NULL,
        ADD COLUMN IF NOT EXISTS code_postal VARCHAR(10) DEFAULT NULL;
    `;
    
    db.query(alterQuery, (err, result) => {
        if (err) {
            console.error('Error adding new columns:', err);
            return res.send('Error adding new columns: ' + err.message);
        }
        res.send('New columns added successfully!');
    });
});

module.exports = router;