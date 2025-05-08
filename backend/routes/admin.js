const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const db = require('../config/database');

// Middleware to check if user is admin
const checkAdminAuth = (req, res, next) => {
    if (!req.session.userId || req.session.userRole !== 'admin') {
        // Clear any existing session
        req.session.destroy(() => {
            res.redirect('/admin/login');
        });
        return;
    }
    next();
};

// Helper function to fetch user statistics based on the same logic as the table section
function fetchUserStats(callback) {
    const statsQuery = `
        SELECT 
            COUNT(*) AS totalUsers,
            SUM(CASE WHEN active = TRUE THEN 1 ELSE 0 END) AS activeUsers
        FROM utilisateurs
        WHERE rôle IN ('client', 'artisan')
    `;
    db.query(statsQuery, (err, stats) => {
        if (err) {
            console.error('Error fetching stats:', err);
            return callback(err, { totalUsers: 0, activeUsers: 0 });
        }
        callback(null, stats[0]);
    });
}

// Admin login page
router.get('/login', (req, res) => {
    if (req.session.userRole === 'admin') {
        return res.redirect('/admin/dashboard');
    }
    res.render('admin/login', { title: 'تسجيل الدخول' });
});

// Admin login handler (AJAX-friendly)
router.post('/login', (req, res) => {
    const { email, password } = req.body;
    const query = 'SELECT * FROM utilisateurs WHERE email = ?';
    db.query(query, [email], (err, results) => {
        if (err || results.length === 0) {
            return res.status(401).json({ success: false, error: 'البريد الإلكتروني أو كلمة المرور غير صحيحة' });
        }
        const user = results[0];
        bcrypt.compare(password, user.mot_de_passe, (err, isMatch) => {
            if (isMatch) {
                req.session.userId = user.id;
                req.session.userRole = user.rôle || user.role;
                req.session.userName = user.nom;
                // Set active true on login
                db.query('UPDATE utilisateurs SET active = TRUE WHERE id = ?', [user.id]);
                req.session.save(err => {
                    if (err) {
                        return res.status(500).json({ success: false, error: 'خطأ في حفظ الجلسة' });
                    }
                    // Respond with JSON for AJAX
                    res.json({ success: true, redirect: '/admin/dashboard' });
                });
            } else {
                res.status(401).json({ success: false, error: 'البريد الإلكتروني أو كلمة المرور غير صحيحة' });
            }
        });
    });
});

// Admin logout
router.get('/logout', (req, res) => {
    const userId = req.session.userId;
    req.session.destroy(() => {
        // Set active false on logout
        if (userId) {
            db.query('UPDATE utilisateurs SET active = FALSE WHERE id = ?', [userId]);
        }
        res.redirect('/admin/login');
    });
});

// Client list page
router.get('/client-list', checkAdminAuth, async (req, res) => {
    try {
        // Get total clients count
        const [clientStats] = await db.promise().query(`
            SELECT 
                COUNT(*) as totalClients,
                SUM(CASE WHEN active = TRUE THEN 1 ELSE 0 END) as activeClients
            FROM utilisateurs 
            WHERE rôle = 'client'
        `);

        // Get client list
        const query = `
            SELECT 
                u.id, 
                u.nom, 
                u.email, 
                u.telephone,
                u.gouvernorat,
                u.active
            FROM utilisateurs u
            WHERE u.rôle = 'client'
            ORDER BY u.id DESC
        `;

        const [clients] = await db.promise().query(query);

        res.render('client-list/index', {
            title: 'قائمة الحرفاء',
            clients,
            totalClients: clientStats[0].totalClients,
            activeClients: clientStats[0].activeClients,
            user: {
                id: req.session.userId,
                role: req.session.userRole,
                name: req.session.userName
            }
        });
    } catch (error) {
        console.error('Error:', error);
        res.render('client-list/index', {
            title: 'قائمة الحرفاء',
            error: 'حدث خطأ في النظام',
            user: {
                id: req.session.userId,
                role: req.session.userRole,
                name: req.session.userName
            }
        });
    }
});

// Artisan list page
router.get('/artisan-list', checkAdminAuth, async (req, res) => {
    try {
        // First get the statistics
        const statsQuery = `
            SELECT 
                COUNT(DISTINCT u.id) as totalArtisans,
                SUM(CASE WHEN u.active = TRUE THEN 1 ELSE 0 END) as activeArtisans,
                COALESCE(
                    (
                        SELECT AVG(r.rating)
                        FROM reviews r
                        JOIN artisans a ON r.artisan_id = a.id
                        JOIN utilisateurs u2 ON a.utilisateur_id = u2.id
                        WHERE u2.rôle = 'artisan'
                    ),
                    0
                ) as avgRating
            FROM utilisateurs u
            WHERE u.rôle = 'artisan'
        `;

        const [stats] = await db.promise().query(statsQuery);

        // Now get the artisan list
        const query = `
            SELECT 
                u.id, 
                u.nom, 
                u.email, 
                u.telephone,
                u.adresse,
                u.gouvernorat,
                u.active
            FROM utilisateurs u
            WHERE u.rôle = 'artisan'
            ORDER BY u.id DESC
        `;

        const [artisans] = await db.promise().query(query);

        res.render('artisan-list/index', {
            title: 'قائمة الحرفيين',
            artisans,
            totalArtisans: stats[0].totalArtisans,
            activeArtisans: stats[0].activeArtisans,
            avgRating: parseFloat(stats[0].avgRating || 0).toFixed(1),
            user: {
                id: req.session.userId,
                role: req.session.userRole,
                name: req.session.userName
            }
        });
    } catch (error) {
        console.error('Error:', error);
        res.render('artisan-list/index', {
            title: 'قائمة الحرفيين',
            error: 'حدث خطأ في النظام',
            user: {
                id: req.session.userId,
                role: req.session.userRole,
                name: req.session.userName
            }
        });
    }
});

// Get artisan list data for DataTable
router.get('/artisan-list/data', checkAdminAuth, async (req, res) => {
    try {
        const query = `
            SELECT 
                u.id, 
                u.nom, 
                u.email, 
                u.telephone,
                u.adresse,
                u.gouvernorat,
                u.active
            FROM utilisateurs u
            WHERE u.rôle = 'artisan'
            ORDER BY u.id DESC
        `;

        const [artisans] = await db.promise().query(query);
        res.json(artisans);
    } catch (error) {
        console.error('Error fetching artisans:', error);
        res.status(500).json({ error: 'Error fetching artisans' });
    }
});

// View single client
router.get('/client/:id', checkAdminAuth, (req, res) => {
    const query = 'SELECT * FROM utilisateurs WHERE id = ? AND rôle = "client"';
    
    db.query(query, [req.params.id], (err, results) => {
        if (err || results.length === 0) {
            return res.redirect('/admin/client-list');
        }
        
        res.render('admin/client-view', {
            title: 'تفاصيل المستخدم',
            client: results[0],
            user: {
                id: req.session.userId,
                role: req.session.userRole,
                name: req.session.userName
            }
        });
    });
});

// Delete client
router.delete('/client/:id', checkAdminAuth, async (req, res) => {
    const connection = await db.promise().getConnection();
    
    try {
        await connection.beginTransaction();
        
        const userId = req.params.id;
        
        // First check if user exists and is a client
        const [user] = await connection.query(
            'SELECT * FROM utilisateurs WHERE id = ? AND rôle = "client"',
            [userId]
        );

        if (user.length === 0) {
            await connection.rollback();
            return res.status(404).json({ 
                success: false, 
                error: 'المستخدم غير موجود أو ليس عميلاً' 
            });
        }

        // Delete all related records in the correct order
        try {
            // First delete reviews where user is the reviewer
            await connection.query('DELETE FROM reviews WHERE user_id = ?', [userId]);
        } catch (error) {
            if (error.code !== 'ER_NO_SUCH_TABLE') {
                throw error;
            }
            console.log('No reviews table:', error.message);
        }

        try {
            // Then delete bookings
            await connection.query('DELETE FROM bookings WHERE user_id = ?', [userId]);
        } catch (error) {
            if (error.code !== 'ER_NO_SUCH_TABLE') {
                throw error;
            }
            console.log('No bookings table:', error.message);
        }

        try {
            // Then delete demandes
            await connection.query('DELETE FROM demandes WHERE user_id = ?', [userId]);
        } catch (error) {
            if (error.code !== 'ER_NO_SUCH_TABLE') {
                throw error;
            }
            console.log('No demandes table:', error.message);
        }
        
        // Finally delete the user
        await connection.query('DELETE FROM utilisateurs WHERE id = ?', [userId]);
        
        // Commit transaction
        await connection.commit();
        
        res.json({ success: true });
    } catch (error) {
        // Rollback on error
        await connection.rollback();
        console.error('Error deleting client:', error);
        res.status(500).json({ 
            success: false, 
            error: 'حدث خطأ أثناء حذف العميل' 
        });
    } finally {
        connection.release();
    }
});

// Delete artisan
router.delete('/artisan/:id', checkAdminAuth, async (req, res) => {
    const connection = await db.promise().getConnection();
    
    try {
        await connection.beginTransaction();
        
        const userId = req.params.id;
        
        // First check if user exists and is an artisan
        const [user] = await connection.query(
            'SELECT * FROM utilisateurs WHERE id = ? AND rôle = "artisan"',
            [userId]
        );

        if (user.length === 0) {
            await connection.rollback();
            return res.status(404).json({ 
                success: false, 
                error: 'المستخدم غير موجود أو ليس حرفياً' 
            });
        }

        // Get artisan ID
        const [artisan] = await connection.query(
            'SELECT id FROM artisans WHERE utilisateur_id = ?',
            [userId]
        );

        if (artisan.length === 0) {
            await connection.rollback();
            return res.status(404).json({ 
                success: false, 
                error: 'لم يتم العثور على سجل الحرفي' 
            });
        }

        const artisanId = artisan[0].id;

        // Delete all related records in the correct order
        try {
            // First delete bookings
            await connection.query('DELETE FROM bookings WHERE artisan_id = ?', [artisanId]);
        } catch (error) {
            console.log('No bookings or error:', error.message);
        }

        try {
            // Then delete reviews
            await connection.query('DELETE FROM reviews WHERE artisan_id = ?', [artisanId]);
        } catch (error) {
            console.log('No reviews or error:', error.message);
        }

        try {
            // Then delete demandes
            await connection.query('DELETE FROM demandes WHERE artisan_id = ?', [artisanId]);
        } catch (error) {
            console.log('No demandes or error:', error.message);
        }

        // Delete artisan record
        await connection.query('DELETE FROM artisans WHERE id = ?', [artisanId]);
        
        // Finally delete the user
        await connection.query('DELETE FROM utilisateurs WHERE id = ?', [userId]);
        
        // Commit transaction
        await connection.commit();
        
        res.json({ success: true });
    } catch (error) {
        // Rollback on error
        await connection.rollback();
        console.error('Error deleting artisan:', error);
        res.status(500).json({ 
            success: false, 
            error: 'حدث خطأ أثناء حذف الحرفي' 
        });
    } finally {
        connection.release();
    }
});

// Admin dashboard (protected route)
router.get('/dashboard', checkAdminAuth, (req, res) => {
    res.render('admin/index', {
        title: 'لوحة التحكم',
        user: {
            id: req.session.userId,
            role: req.session.userRole,
            name: req.session.userName
        }
    });
});

// Admin dashboard data endpoint
router.get('/dashboard-data', checkAdminAuth, (req, res) => {
    // Get statistics
    const statsQuery = `
        SELECT 
            (SELECT COUNT(*) FROM utilisateurs WHERE rôle IN ('client', 'artisan')) as totalUsers,
            (SELECT COUNT(*) FROM utilisateurs WHERE rôle = 'client') as clients,
            (SELECT COUNT(*) FROM utilisateurs WHERE rôle = 'artisan') as artisans,
            (SELECT COUNT(*) FROM reports) as messages
    `;

    // Get reports
    const reportsQuery = `
        SELECT 
            id,
            artisan_id,
            navigation_issue,
            design_issue,
            comments,
            created_at
        FROM reports
        ORDER BY id DESC
        LIMIT 10
    `;

    db.query(statsQuery, (err, statsResults) => {
        if (err) {
            console.error('Error fetching statistics:', err);
            return res.status(500).json({
                totalUsers: 0,
                clients: 0,
                artisans: 0,
                messages: 0,
                reports: [],
                error: 'Error fetching statistics'
            });
        }

        db.query(reportsQuery, (err, reportsResults) => {
            if (err) {
                console.error('Error fetching reports:', err);
                return res.status(500).json({
                    ...statsResults[0],
                    reports: [],
                    error: 'Error fetching reports'
                });
            }

            res.json({
                ...statsResults[0],
                reports: reportsResults
            });
        });
    });
});

// Get users data for DataTables
router.get('/users-data', checkAdminAuth, async (req, res) => {
    try {
        const role = req.query.role;
        console.log('Requested role:', role);

        let query;
        if (role === 'artisan') {
            query = `
                SELECT 
                    u.id, 
                    u.nom, 
                    u.email, 
                    u.gouvernorat,
                    u.telephone,
                    COALESCE(
                        (
                            SELECT AVG(r.rating)
                            FROM reviews r
                            JOIN artisans a ON r.artisan_id = a.id
                            JOIN utilisateurs u2 ON a.utilisateur_id = u2.id
                            WHERE u2.rôle = 'artisan'
                        ),
                        0
                    ) as rating
                FROM utilisateurs u
                LEFT JOIN reviews r ON u.id = r.artisan_id
                WHERE u.rôle = 'artisan'
                GROUP BY u.id, u.nom, u.email, u.gouvernorat, u.telephone
                ORDER BY u.id DESC
            `;
        } else {
            query = `
                SELECT id, nom, email, telephone, gouvernorat
                FROM utilisateurs
                WHERE rôle = ?
                ORDER BY id DESC
            `;
        }

        const [users] = await db.promise().query(query, [role]);
        console.log('Users results:', users);
        
        res.json({
            data: users,
            recordsTotal: users.length,
            recordsFiltered: users.length
        });
    } catch (error) {
        console.error('Error fetching users:', error);
        res.status(500).json({ 
            error: 'حدث خطأ أثناء جلب بيانات الحرفاء',
            data: [],
            recordsTotal: 0,
            recordsFiltered: 0
        });
    }
});

// Get total users count (for dynamic dashboard update)
router.get('/users-count', checkAdminAuth, (req, res) => {
    const query = "SELECT COUNT(*) AS total FROM utilisateurs WHERE rôle IN ('client', 'artisan', 'admin')";
    db.query(query, (err, results) => {
        if (err) {
            return res.json({ total: 0 });
        }
        res.json({ total: results[0].total });
    });
});

// Update artisan list route to include statistics
router.get('/artisan-list', checkAdminAuth, (req, res) => {
    const statsQuery = `
        SELECT 
            COUNT(DISTINCT u.id) as totalArtisans,
            COUNT(DISTINCT u.id) as activeArtisans,
            COALESCE(AVG(r.rating), 0) as avgRating
        FROM utilisateurs u
        LEFT JOIN artisans a ON u.id = a.utilisateur_id
        LEFT JOIN reviews r ON a.id = r.artisan_id
        WHERE u.rôle = 'artisan'
    `;

    db.query(statsQuery, (err, stats) => {
        if (err) {
            console.error('Error fetching stats:', err);
            return res.render('artisan-list/index', {
                title: 'قائمة الحرفيين',
                user: {
                    id: req.session.userId,
                    role: req.session.userRole,
                    name: req.session.userName
                },
                totalArtisans: 0,
                activeArtisans: 0,
                avgRating: 0
            });
        }

        res.render('artisan-list/index', {
            title: 'قائمة الحرفيين',
            user: {
                id: req.session.userId,
                role: req.session.userRole,
                name: req.session.userName
            },
            totalArtisans: stats[0].totalArtisans,
            activeArtisans: stats[0].activeArtisans,
            avgRating: parseFloat(stats[0].avgRating || 0).toFixed(1)
        });
    });
});

// Settings page
router.get('/settings', checkAdminAuth, (req, res) => {
    const query = 'SELECT nom, email FROM utilisateurs WHERE id = ? AND rôle = "admin"';
    
    db.query(query, [req.session.userId], (err, results) => {
        if (err) {
            console.error('Error fetching admin data:', err);
            return res.render('settings/index', {
                title: 'الإعدادات - TN M3allim',
                user: {
                    id: req.session.userId,
                    role: req.session.userRole,
                    name: req.session.userName,
                    email: ''
                }
            });
        }

        res.render('settings/index', {
            title: 'الإعدادات - TN M3allim',
            user: {
                id: req.session.userId,
                role: req.session.userRole,
                name: results[0].nom,
                email: results[0].email
            }
        });
    });
});

// Update profile
router.post('/settings/update-profile', checkAdminAuth, (req, res) => {
    const { name, email } = req.body;
    const query = 'UPDATE utilisateurs SET nom = ?, email = ? WHERE id = ? AND rôle = "admin"';
    
    db.query(query, [name, email, req.session.userId], (err, result) => {
        if (err) {
            console.error('Error updating admin profile:', err);
            return res.status(500).json({ error: 'حدث خطأ في تحديث البيانات' });
        }
        
        // Update session
        req.session.userName = name;
        res.json({ success: true });
    });
});

// Change password
router.post('/settings/change-password', checkAdminAuth, async (req, res) => {
    try {
        const { currentPassword, newPassword } = req.body;
        
        // Get current password hash
        const query = 'SELECT mot_de_passe FROM utilisateurs WHERE id = ? AND rôle = "admin"';
        db.query(query, [req.session.userId], async (err, results) => {
            if (err || results.length === 0) {
                return res.status(500).json({ error: 'حدث خطأ في التحقق من كلمة المرور' });
            }

            const isValid = await bcrypt.compare(currentPassword, results[0].mot_de_passe);
            if (!isValid) {
                return res.status(400).json({ error: 'كلمة المرور الحالية غير صحيحة' });
            }

            // Hash new password
            const hashedPassword = await bcrypt.hash(newPassword, 10);
            
            // Update password
            const updateQuery = 'UPDATE utilisateurs SET mot_de_passe = ? WHERE id = ? AND rôle = "admin"';
            db.query(updateQuery, [hashedPassword, req.session.userId], (err, result) => {
                if (err) {
                    return res.status(500).json({ error: 'حدث خطأ في تحديث كلمة المرور' });
                }
                res.json({ success: true });
            });
        });
    } catch (error) {
        console.error('Password update error:', error);
        res.status(500).json({ error: 'حدث خطأ في تحديث كلمة المرور' });
    }
});

// User Messages route - update the path
router.get('/user-messages', checkAdminAuth, async (req, res) => {
    try {
        const query = 'SELECT id, nom, email, num_tel as phone, message, DATE_FORMAT(created_at, "%Y-%m-%d %H:%i") as created_at FROM enquete ORDER BY id DESC';
        db.query(query, (err, results) => {
            if (err) {
                console.error('Error fetching enquete messages:', err);
                return res.render('user-messages/index', {
                    title: 'رسائل الاستبيان',
                    messages: [],
                    totalMessages: 0,
                    error: 'حدث خطأ أثناء جلب رسائل الاستبيان'
                });
            }
            res.render('user-messages/index', {
                title: 'رسائل الاستبيان',
                messages: results,
                totalMessages: results.length,
                user: {
                    id: req.session.userId,
                    role: req.session.userRole,
                    name: req.session.userName
                }
            });
        });
    } catch (error) {
        console.error('Error:', error);
        res.render('user-messages/index', {
            title: 'رسائل الاستبيان',
            messages: [],
            totalMessages: 0,
            error: 'حدث خطأ في النظام'
        });
    }
});

// Update delete message route path
router.delete('/user-messages/:id', checkAdminAuth, (req, res) => {
    const query = 'DELETE FROM contacts WHERE id = ?';  // Changed from 'messages' to 'contacts'
    
    db.query(query, [req.params.id], (err, result) => {
        if (err) {
            console.error('Error deleting message:', err);
            return res.status(500).json({ error: 'Error deleting message' });
        }
        res.json({ success: true });
    });
});

// Route to fetch all enquete messages for admin user-messages page
router.get('/user-messages/enquete', checkAdminAuth, (req, res) => {
    const query = 'SELECT id, nom, email, num_tel, message, created_at FROM enquete ORDER BY id DESC';
    db.query(query, (err, results) => {
        if (err) {
            console.error('Error fetching enquete messages:', err);
            return res.render('user-messages/index', {
                title: 'رسائل الاستبيان',
                enqueteMessages: [],
                totalMessages: 0,
                error: 'حدث خطأ أثناء جلب رسائل الاستبيان'
            });
        }
        res.render('user-messages/index', {
            title: 'رسائل الاستبيان',
            enqueteMessages: results,
            totalMessages: results.length
        });
    });
});

// Route to fetch all messages from both enquete and contacts tables for admin user-messages page
router.get('/user-messages/all', checkAdminAuth, (req, res) => {
    // Fetch from both enquete and contacts
    const enqueteQuery = 'SELECT id, nom, email, num_tel as phone, message, created_at FROM enquete';
    const contactsQuery = 'SELECT id, name as nom, email, phone, message, created_at FROM contacts';
    
    db.query(enqueteQuery, (err, enqueteResults) => {
        if (err) {
            console.error('Error fetching enquete messages:', err);
            return res.render('user-messages/index', {
                title: 'رسائل الحرفاء',
                messages: [],
                totalMessages: 0,
                error: 'حدث خطأ أثناء جلب رسائل الاستبيان'
            });
        }
        db.query(contactsQuery, (err2, contactsResults) => {
            if (err2) {
                console.error('Error fetching contact messages:', err2);
                return res.render('user-messages/index', {
                    title: 'رسائل الحرفاء',
                    messages: enqueteResults,
                    totalMessages: enqueteResults.length,
                    error: 'حدث خطأ أثناء جلب رسائل التواصل'
                });
            }
            // Merge both arrays
            const allMessages = [...enqueteResults, ...contactsResults].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
            res.render('user-messages/index', {
                title: 'رسائل الحرفاء',
                messages: allMessages,
                totalMessages: allMessages.length
            });
        });
    });
});

// Route to fetch only enquete messages for admin user-messages page (and pass as 'messages')
router.get('/user-messages/enquete-messages', checkAdminAuth, (req, res) => {
    const query = 'SELECT id, nom, email, num_tel as phone, message, created_at FROM enquete ORDER BY id DESC';
    db.query(query, (err, results) => {
        if (err) {
            console.error('Error fetching enquete messages:', err);
            return res.render('user-messages/index', {
                title: 'رسائل الاستبيان',
                messages: [],
                totalMessages: 0,
                error: 'حدث خطأ أثناء جلب رسائل الاستبيان'
            });
        }
        res.render('user-messages/index', {
            title: 'رسائل الاستبيان',
            messages: results,
            totalMessages: results.length
        });
    });
});

// Route to handle user creation by admin (client, artisan, admin)
router.post('/create-user', checkAdminAuth, (req, res) => {
    const { nom, email, mot_de_passe, rôle } = req.body;
    if (!nom || !email || !mot_de_passe || !rôle) {
        return res.status(400).json({ success: false, error: 'يرجى ملء جميع الحقول المطلوبة' });
    }
    db.query('SELECT * FROM utilisateurs WHERE email = ?', [email], (err, results) => {
        if (err) {
            console.error('Error checking email existence:', err);
            return res.status(500).json({ success: false, error: 'حدث خطأ أثناء التحقق من البريد الإلكتروني' });
        }
        if (results.length > 0) {
            return res.status(409).json({ success: false, error: 'البريد الإلكتروني مستخدم بالفعل' });
        }
        const bcrypt = require('bcrypt');
        bcrypt.hash(mot_de_passe, 10, (err, hash) => {
            if (err) {
                console.error('Error hashing password:', err);
                return res.status(500).json({ success: false, error: 'حدث خطأ أثناء معالجة كلمة المرور' });
            }
            const insertQuery = `INSERT INTO utilisateurs (nom, email, mot_de_passe, rôle, active) VALUES (?, ?, ?, ?, TRUE)`;
            db.query(insertQuery, [nom, email, hash, rôle], (err, result) => {
                if (err) {
                    console.error('Database error (insert user):', err);
                    return res.status(500).json({ success: false, error: 'خطأ في قاعدة البيانات (إضافة المستخدم): ' + err.message });
                }
                res.json({ success: true });
            });
        });
    });
});

// Create a new artisan
router.post('/artisans', checkAdminAuth, async (req, res) => {
    try {
        const {
            nom,
            email,
            telephone,
            gouvernorat,
            spécialité,
            localisation,
            expérience,
            tarif_horaire,
            facebook,
            instagram,
            linkedin,
            description
        } = req.body;

        // First, create the user in utilisateurs table
        const createUserQuery = `
            INSERT INTO utilisateurs (nom, email, telephone, gouvernorat, rôle)
            VALUES (?, ?, ?, ?, 'artisan')
        `;

        const [userResult] = await db.promise().query(createUserQuery, [
            nom,
            email,
            telephone,
            gouvernorat
        ]);

        const userId = userResult.insertId;

        // Then, create the artisan record
        const createArtisanQuery = `
            INSERT INTO artisans (
                spécialité,
                localisation,
                expérience,
                utilisateur_id,
                tarif_horaire,
                facebook,
                instagram,
                linkedin,
                description,
                user_id
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `;

        await db.promise().query(createArtisanQuery, [
            spécialité,
            localisation,
            expérience,
            userId,
            tarif_horaire,
            facebook || null,
            instagram || null,
            linkedin || null,
            description || null,
            userId
        ]);

        res.json({ success: true, message: 'تم إضافة الحرفي بنجاح' });
    } catch (error) {
        console.error('Error creating artisan:', error);
        res.status(500).json({ 
            success: false, 
            error: error.code === 'ER_DUP_ENTRY' ? 'البريد الإلكتروني مستخدم بالفعل' : 'حدث خطأ أثناء إضافة الحرفي'
        });
    }
});

// TEMPORARY ROUTE: Add 'actif' column to utilisateurs table if it doesn't exist
router.get('/add-actif-column', checkAdminAuth, (req, res) => {
    const alterQuery = `ALTER TABLE utilisateurs ADD COLUMN actif TINYINT(1) DEFAULT 1`;
    db.query(alterQuery, (err, result) => {
        if (err) {
            if (err.code === 'ER_DUP_FIELDNAME') {
                return res.send("'actif' column already exists.");
            }
            console.error('Error adding actif column:', err);
            return res.send('Error adding actif column: ' + err.message);
        }
        res.send("'actif' column added successfully!");
    });
});

// TEMPORARY ROUTE: Activate all users (for dashboard testing)
router.get('/activate-all-users', checkAdminAuth, (req, res) => {
    db.query("UPDATE utilisateurs SET actif = 1 WHERE rôle IN ('client', 'artisan', 'admin')", (err, result) => {
        if (err) {
            console.error('Activation error:', err);
            return res.send('Error activating users: ' + err.message);
        }
        res.send('All users activated!');
    });
});

// Get reviews for a specific artisan
router.get('/artisan-reviews/:artisanId', async (req, res) => {
    try {
        const artisanId = req.params.artisanId;
        const query = `
            SELECT r.*, u.nom as user_name, u.photo_profile as user_photo
            FROM reviews r 
            JOIN utilisateurs u ON r.user_id = u.id 
            WHERE r.artisan_id = ?
            ORDER BY r.created_at DESC
        `;

        const [reviews] = await db.promise().query(query, [artisanId]);

        res.json(reviews.map(review => ({
            id: review.id,
            userName: review.user_name,
            rating: review.rating,
            comment: review.review_text,
            createdAt: review.created_at,
            userPhoto: review.user_photo ? `data:image/jpeg;base64,${review.user_photo.toString('base64')}` : null
        })));
    } catch (error) {
        console.error('Error fetching reviews:', error);
        res.status(500).json({ error: 'Error fetching reviews' });
    }
});

// Get client list data for DataTable
router.get('/client-list/data', checkAdminAuth, async (req, res) => {
    try {
        const query = `
            SELECT 
                id,
                nom,
                email,
                telephone,
                gouvernorat,
                photo_profile
            FROM utilisateurs
            WHERE rôle = 'client'
            ORDER BY id DESC
        `;

        const [results] = await db.promise().query(query);

        // Format the results
        const formattedResults = results.map(client => ({
            id: client.id,
            nom: client.nom,
            email: client.email,
            telephone: client.telephone,
            gouvernorat: client.gouvernorat,
            photo_profile: client.photo_profile ? Buffer.from(client.photo_profile).toString('base64') : null
        }));

        res.json(formattedResults);
    } catch (error) {
        console.error('Error fetching client list:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Delete client
router.delete('/client/:id', checkAdminAuth, async (req, res) => {
    const connection = await db.promise().getConnection();
    
    try {
        await connection.beginTransaction();
        
        const userId = req.params.id;
        
        // First check if client exists and is a client
        const [user] = await connection.query(
            'SELECT * FROM utilisateurs WHERE id = ? AND rôle = "client"',
            [userId]
        );

        if (user.length === 0) {
            await connection.rollback();
            return res.status(404).json({ 
                success: false, 
                error: 'المستخدم غير موجود أو ليس عميلاً' 
            });
        }

        // Delete all related records in the correct order
        try {
            // First delete reviews where user is the reviewer
            await connection.query('DELETE FROM reviews WHERE user_id = ?', [userId]);
        } catch (error) {
            if (error.code !== 'ER_NO_SUCH_TABLE') {
                throw error;
            }
            console.log('No reviews table:', error.message);
        }

        try {
            // Then delete bookings
            await connection.query('DELETE FROM bookings WHERE user_id = ?', [userId]);
        } catch (error) {
            if (error.code !== 'ER_NO_SUCH_TABLE') {
                throw error;
            }
            console.log('No bookings table:', error.message);
        }

        try {
            // Then delete demandes
            await connection.query('DELETE FROM demandes WHERE user_id = ?', [userId]);
        } catch (error) {
            if (error.code !== 'ER_NO_SUCH_TABLE') {
                throw error;
            }
            console.log('No demandes table:', error.message);
        }
        
        // Finally delete the user
        await connection.query('DELETE FROM utilisateurs WHERE id = ?', [userId]);
        
        // Commit transaction
        await connection.commit();
        
        res.json({ success: true });
    } catch (error) {
        // Rollback on error
        await connection.rollback();
        console.error('Error deleting client:', error);
        res.status(500).json({ 
            success: false, 
            error: 'حدث خطأ أثناء حذف العميل' 
        });
    } finally {
        connection.release();
    }
});

// Get clients data for DataTable
router.get('/client-list/data', checkAdminAuth, async (req, res) => {
    try {
        const query = `
            SELECT 
                u.id,
                u.nom,
                u.email,
                u.telephone,
                u.adresse,
                u.gouvernorat,
                u.date_inscription,
                u.active,
                u.sexe,
                u.date_naissance,
                (
                    SELECT COUNT(*)
                    FROM demandes d
                    WHERE d.user_id = u.id
                ) as total_requests
            FROM utilisateurs u
            WHERE u.rôle = 'client'
            ORDER BY u.date_inscription DESC
        `;

        const [clients] = await db.promise().query(query);

        // Format dates and add age
        clients.forEach(client => {
            if (client.date_inscription) {
                client.date_inscription = new Date(client.date_inscription).toLocaleDateString('fr-FR');
            }
            if (client.date_naissance) {
                client.date_naissance = new Date(client.date_naissance).toLocaleDateString('fr-FR');
                const birthDate = new Date(client.date_naissance);
                const today = new Date();
                let age = today.getFullYear() - birthDate.getFullYear();
                const m = today.getMonth() - birthDate.getMonth();
                if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) {
                    age--;
                }
                client.age = age;
            }
        });

        res.json(clients);
    } catch (error) {
        console.error('Error fetching clients:', error);
        res.status(500).json({ error: 'Error fetching clients' });
    }
});

// Get clients data for DataTable
router.get('/client-list/data', checkAdminAuth, async (req, res) => {
    try {
        const query = `
            SELECT 
                u.id,
                u.nom,
                u.email,
                u.telephone,
                u.adresse,
                u.gouvernorat,
                u.date_inscription,
                u.active,
                u.sexe,
                u.date_naissance,
                0 as total_requests
            FROM utilisateurs u
            WHERE u.rôle = 'client'
            ORDER BY u.date_inscription DESC
        `;

        const [clients] = await db.promise().query(query);

        res.json({
            draw: parseInt(req.query.draw || '1'),
            recordsTotal: clients.length,
            recordsFiltered: clients.length,
            data: clients.map(client => ({
                ...client,
                date_inscription: client.date_inscription ? new Date(client.date_inscription).toLocaleDateString('ar-TN') : '',
                date_naissance: client.date_naissance ? new Date(client.date_naissance).toLocaleDateString('ar-TN') : '',
                age: client.date_naissance ? Math.floor((new Date() - new Date(client.date_naissance)) / (365.25 * 24 * 60 * 60 * 1000)) : null
            }))
        });
    } catch (error) {
        console.error('Error fetching clients:', error);
        res.status(500).json({ error: 'Error fetching clients data' });
    }
});

// Get artisans data for DataTable
router.get('/artisans/data', checkAdminAuth, async (req, res) => {
    try {
        const query = `
            SELECT 
                u.id,
                u.nom,
                u.email,
                u.telephone,
                u.adresse,
                u.gouvernorat,
                u.active,
                a.spécialité,
                (SELECT AVG(rating) FROM reviews r WHERE r.artisan_id = a.id) as avg_rating,
                (SELECT COUNT(*) FROM reviews r WHERE r.artisan_id = a.id) as review_count
            FROM utilisateurs u
            LEFT JOIN artisans a ON u.id = a.utilisateur_id
            WHERE u.rôle = 'artisan'
            ORDER BY u.id DESC
        `;

        const [artisans] = await db.promise().query(query);

        res.json({
            draw: parseInt(req.query.draw || '1'),
            recordsTotal: artisans.length,
            recordsFiltered: artisans.length,
            data: artisans.map(artisan => ({
                ...artisan,
                avg_rating: artisan.avg_rating ? parseFloat(artisan.avg_rating).toFixed(1) : '0.0',
                review_count: artisan.review_count || 0
            }))
        });
    } catch (error) {
        console.error('Error fetching artisans:', error);
        res.status(500).json({ error: 'Error fetching artisans data' });
    }
});

// Delete user
router.delete('/user/:id', checkAdminAuth, async (req, res) => {
    const connection = await db.promise().getConnection();
    
    try {
        await connection.beginTransaction();
        
        const userId = req.params.id;
        
        // First check if user exists
        const [user] = await connection.query(
            'SELECT * FROM utilisateurs WHERE id = ?',
            [userId]
        );

        if (user.length === 0) {
            await connection.rollback();
            return res.status(404).json({ 
                success: false, 
                error: 'المستخدم غير موجود' 
            });
        }

        // Don't allow deletion of admin users
        if (user[0].rôle === 'admin') {
            await connection.rollback();
            return res.status(403).json({ 
                success: false, 
                error: 'لا يمكن حذف حساب المسؤول' 
            });
        }

        // Delete related records based on user role
        if (user[0].rôle === 'artisan') {
            // Get artisan ID first
            const [artisan] = await connection.query(
                'SELECT id FROM artisans WHERE utilisateur_id = ?',
                [userId]
            );
            
            if (artisan.length > 0) {
                const artisanId = artisan[0].id;
                
                // Delete bookings first
                try {
                    await connection.query('DELETE FROM bookings WHERE artisan_id = ?', [artisanId]);
                } catch (error) {
                    console.log('No bookings table or error:', error.message);
                }
                
                // Delete reviews if table exists
                try {
                    await connection.query('DELETE FROM reviews WHERE artisan_id = ?', [artisanId]);
                } catch (error) {
                    console.log('No reviews table or error:', error.message);
                }
                
                // Delete requests if table exists
                try {
                    await connection.query('DELETE FROM demandes WHERE artisan_id = ?', [artisanId]);
                } catch (error) {
                    console.log('No demandes table or error:', error.message);
                }
                
                // Delete artisan record last
                await connection.query('DELETE FROM artisans WHERE id = ?', [artisanId]);
            }
        } else if (user[0].rôle === 'client') {
            // For clients, just delete their user record
            // Any foreign key constraints should be set to ON DELETE CASCADE
            // or the related records should be deleted first if needed
            try {
                await connection.query('DELETE FROM demandes WHERE user_id = ?', [userId]);
            } catch (error) {
                console.log('No demandes table or error:', error.message);
            }
        }
        
        // Finally delete the user
        await connection.query('DELETE FROM utilisateurs WHERE id = ?', [userId]);
        
        // Commit transaction
        await connection.commit();
        
        res.json({ success: true });
    } catch (error) {
        // Rollback on error
        await connection.rollback();
        console.error('Error deleting user:', error);
        res.status(500).json({ 
            success: false, 
            error: 'حدث خطأ أثناء حذف المستخدم' 
        });
    } finally {
        connection.release();
    }
});

// Add new user
router.post('/user', checkAdminAuth, async (req, res) => {
    try {
        const { nom, email, telephone, rôle, mot_de_passe } = req.body;

        // Validate required fields
        if (!nom || !email || !telephone || !rôle || !mot_de_passe) {
            return res.status(400).json({
                success: false,
                error: 'جميع الحقول مطلوبة'
            });
        }

        // Check if email already exists
        const [existingUser] = await db.promise().query(
            'SELECT * FROM utilisateurs WHERE email = ?',
            [email]
        );

        if (existingUser.length > 0) {
            return res.status(400).json({
                success: false,
                error: 'البريد الإلكتروني مستخدم بالفعل'
            });
        }

        // Hash the provided password
        const hashedPassword = await bcrypt.hash(mot_de_passe, 10);

        // Insert user with mot_de_passe
        const query = 'INSERT INTO utilisateurs (nom, email, mot_de_passe, telephone, rôle) VALUES (?, ?, ?, ?, ?)';
        const values = [nom, email, hashedPassword, telephone, rôle];
        
        console.log('Inserting user with query:', query);
        console.log('Values:', values);

        await db.promise().query(query, values);

        // Send success response
        res.json({
            success: true,
            message: 'تمت إضافة المستخدم بنجاح'
        });
    } catch (error) {
        console.error('Error adding user:', error);
        res.status(500).json({
            success: false,
            error: 'حدث خطأ أثناء إضافة المستخدم'
        });
    }
});

// Route to handle user message submissions
router.post('/user-messages', checkAdminAuth, (req, res) => {
    const { nom, email, num_tel, message } = req.body;

    // Validate required fields
    if (!nom || !email || !num_tel || !message) {
        return res.status(400).json({
            success: false,
            error: 'جميع الحقول مطلوبة'
        });
    }

    const sql = 'INSERT INTO enquete (nom, email, num_tel, message) VALUES (?, ?, ?, ?)';
    db.query(sql, [nom, email, num_tel, message], (err, result) => {
        if (err) {
            console.error('Error saving message:', err);
            return res.status(500).json({
                success: false,
                error: 'حدث خطأ أثناء حفظ الرسالة'
            });
        }

        res.json({
            success: true,
            message: 'تم حفظ الرسالة بنجاح'
        });
    });
});

module.exports = router;