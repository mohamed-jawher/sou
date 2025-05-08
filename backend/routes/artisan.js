const express = require('express');
const router = express.Router();
const db = require('../config/database');
const { checkArtisanAuth, checkAuth } = require('../middleware/auth');  // Updated import

// Helper function to get user data including photo
const getUserData = async (userId) => {
    const query = `
        SELECT u.*, a.spécialité, a.expérience, a.localisation, a.rating, a.disponibilité, a.description, a.tarif_horaire, u.photo_profile
        FROM utilisateurs u
        LEFT JOIN artisans a ON u.id = a.utilisateur_id
        WHERE u.id = ?
    `;
    const [rows] = await db.promise().query(query, [userId]);
    const userData = rows[0];
    
    if (userData && userData.photo_profile) {
        userData.photo_profile = `data:image/jpeg;base64,${userData.photo_profile.toString('base64')}`;
    }
    
    return userData;
};

// Add service
router.post('/services', checkArtisanAuth, async (req, res) => {
    try {
        const { serviceType } = req.body;
        const userId = req.session.userId;

        // First get artisan_id
        const getArtisanQuery = `SELECT id FROM artisans WHERE utilisateur_id = ?`;
        const [artisanResult] = await db.promise().query(getArtisanQuery, [userId]);
        
        if (artisanResult.length === 0) {
            return res.status(404).json({ error: 'Artisan not found' });
        }

        // Update the artisan's specialty
        const updateQuery = `UPDATE artisans SET spécialité = ? WHERE id = ?`;
        await db.promise().query(updateQuery, [serviceType, artisanResult[0].id]);
        
        res.json({ success: true, message: 'تم تحديث التخصص بنجاح' });
    } catch (error) {
        console.error('Error updating specialty:', error);
        res.status(500).json({ error: 'Error updating specialty' });
    }
});

// Route pour la page artisan
router.get('/', checkArtisanAuth, async (req, res) => {
    try {
        const userData = await getUserData(req.session.userId);
        res.render('artisan/index', {
            title: 'لوحة التحكم - TN M3allim',
            user: {
                id: req.session.userId,
                role: req.session.userRole,
                name: req.session.userName,
                photo_profile: userData.photo_profile || '/img/avatar-placeholder.png'
            }
        });
    } catch (error) {
        console.error('Error:', error);
        res.status(500).send('Internal Server Error');
    }
});

// Get artisan data
router.get('/get-artisans', async (req, res) => {
    try {
        const query = `
            SELECT a.*, u.nom, u.email, u.photo_profile, u.gouvernorat, u.ville,
            COALESCE((SELECT AVG(rating) FROM reviews WHERE artisan_id = a.id), 0) as rating,
            COALESCE((SELECT COUNT(*) FROM reviews WHERE artisan_id = a.id), 0) as review_count
            FROM artisans a 
            JOIN utilisateurs u ON a.utilisateur_id = u.id
            WHERE u.rôle = 'artisan'
            AND (? = '' OR u.gouvernorat = ?)
            AND (? = '' OR u.ville = ?)
        `;
        
        const [results] = await db.promise().query(query, [
            req.query.gouvernorat || '', 
            req.query.gouvernorat || '',
            req.query.ville || '',
            req.query.ville || ''
        ]);
        res.json(results);
    } catch (error) {
        console.error('Error fetching artisans:', error);
        res.status(500).json({ error: 'Error fetching artisans' });
    }
});

// Get specific artisan - modified to work with ID parameter
router.get('/get-artisan/:id', async (req, res) => {
    try {
        const query = `
            SELECT a.*, u.nom, u.email, u.photo_profile, u.telephone, u.gouvernorat, u.ville,
            COALESCE((SELECT AVG(rating) FROM reviews WHERE artisan_id = a.id), 0) as rating,
            COALESCE((SELECT COUNT(*) FROM reviews WHERE artisan_id = a.id), 0) as review_count
            FROM artisans a 
            JOIN utilisateurs u ON a.utilisateur_id = u.id
            WHERE a.id = ? AND u.rôle = 'artisan'
        `;
        
        const [results] = await db.promise().query(query, [req.params.id]);
        
        if (!results || results.length === 0) {
            return res.status(404).json({ error: 'Artisan not found' });
        }

        // Convert Buffer to base64 string if photo exists
        const artisan = results[0];
        if (artisan.photo_profile) {
            try {
                artisan.photo_profile = Buffer.from(artisan.photo_profile).toString('base64');
            } catch (error) {
                console.error('Error converting photo to base64:', error);
                artisan.photo_profile = null;
            }
        }

        res.json(artisan);
    } catch (error) {
        console.error('Error fetching artisan:', error);
        res.status(500).json({ error: 'Error fetching artisan details' });
    }
});

// Get artisan reviews
router.get('/get-reviews/:artisanId', async (req, res) => {
    try {
        const query = `
            SELECT r.*, u.nom as user_name
            FROM reviews r 
            JOIN utilisateurs u ON r.user_id = u.id 
            WHERE r.artisan_id = ?
            ORDER BY r.created_at DESC
        `;
        
        const [reviews] = await db.promise().query(query, [req.params.artisanId]);
        
        res.json(reviews.map(review => ({
            id: review.id,
            user_name: review.user_name,
            rating: review.rating,
            review_text: review.review_text,
            created_at: review.created_at
        })));
    } catch (error) {
        console.error('Error fetching reviews:', error);
        res.status(500).json({ error: 'Error fetching reviews' });
    }
});

// Submit a review
router.post('/submit-review', checkAuth, async (req, res) => {
    try {
        const { artisanId, rating, review } = req.body;
        
        // Check if user is logged in
        if (!req.session.userId) {
            return res.status(401).json({ error: 'يجب تسجيل الدخول لإضافة تقييم' });
        }

        // Insert the review
        const insertQuery = `
            INSERT INTO reviews (user_id, artisan_id, rating, review_text, created_at)
            VALUES (?, ?, ?, ?, NOW())
        `;
        
        await db.promise().query(insertQuery, [
            req.session.userId,
            artisanId,
            rating,
            review
        ]);

        // Update artisan's average rating
        const updateRatingQuery = `
            UPDATE artisans 
            SET rating = (
                SELECT AVG(rating) 
                FROM reviews 
                WHERE artisan_id = ?
            )
            WHERE id = ?
        `;
        
        await db.promise().query(updateRatingQuery, [artisanId, artisanId]);

        res.json({ success: true });
    } catch (error) {
        console.error('Error:', error);
        res.status(500).json({ error: 'Error submitting review' });
    }
});

// Book an artisan
router.post('/book-artisan', checkAuth, async (req, res) => {
    try {
        const { artisanId, date, time, notes, phone } = req.body;
        const userId = req.session.userId;

        const query = `
            INSERT INTO bookings (user_id, artisan_id, booking_date, booking_time, notes, client_number, status, is_read, created_at)
            VALUES (?, ?, ?, ?, ?, ?, 'pending', 0, NOW())
        `;

        await db.promise().query(query, [userId, artisanId, date, time, notes, phone]);

        res.json({ success: true, message: 'تم حجز الموعد بنجاح' });
    } catch (error) {
        console.error('Error:', error);
        res.status(500).json({ error: 'Error booking artisan' });
    }
});

// Add report problem route
router.get('/report-problem', checkArtisanAuth, async (req, res) => {
    try {
        const userData = await getUserData(req.session.userId);
        res.render('report-problem/index', {
            title: 'الإبلاغ عن مشكلة - TN M3allim',
            user: {
                id: req.session.userId,
                role: req.session.userRole,
                name: req.session.userName,
                photo_profile: userData.photo_profile || '/img/avatar-placeholder.png'
            },
            active: 'report'
        });
    } catch (error) {
        console.error('Error:', error);
        res.status(500).send('Internal Server Error');
    }
});

// Add POST route for handling report submissions
router.post('/report-problem', checkArtisanAuth, async (req, res) => {
    try {
        const { navigation, design, comments } = req.body;
        const userId = req.session.userId;

        // First get the artisan_id from the artisans table
        const getArtisanIdQuery = `
            SELECT id FROM artisans WHERE utilisateur_id = ?
        `;

        const [artisanResult] = await db.promise().query(getArtisanIdQuery, [userId]);
        
        if (artisanResult.length === 0) {
            return res.status(404).json({ 
                success: false, 
                message: 'لم يتم العثور على معرف الحرفي' 
            });
        }

        const artisanId = artisanResult[0].id;

        // Now insert the report with the correct artisan_id
        const insertReportQuery = `
            INSERT INTO reports (artisan_id, navigation_issue, design_issue, comments)
            VALUES (?, ?, ?, ?)
        `;

        await db.promise().query(insertReportQuery, [artisanId, navigation, design, comments]);
        
        res.json({ 
            success: true, 
            message: 'تم إرسال التقرير بنجاح' 
        });
    } catch (error) {
        console.error('Error:', error);
        res.status(500).json({ 
            success: false, 
            message: 'حدث خطأ أثناء حفظ التقرير' 
        });
    }
});

// Get profile page with artisan data
router.get('/profile', checkArtisanAuth, async (req, res) => {
    try {
        const userData = await getUserData(req.session.userId);
        res.render('profile/index', {
            title: 'الملف الشخصي - TN M3allim',
            user: {
                id: req.session.userId,
                role: req.session.userRole,
                name: req.session.userName,
                photo_profile: userData.photo_profile || '/img/avatar-placeholder.png'
            },
            profile: userData,
            active: 'profile'
        });
    } catch (error) {
        console.error('Error:', error);
        res.status(500).send('Internal Server Error');
    }
});

// Get profile data
router.get('/profile/data', checkArtisanAuth, async (req, res) => {
    try {
        const query = `
            SELECT u.*, a.spécialité, a.expérience, a.localisation, a.description, 
                   a.tarif_horaire, a.facebook, a.instagram, a.linkedin
            FROM utilisateurs u
            LEFT JOIN artisans a ON u.id = a.utilisateur_id
            WHERE u.id = ?
        `;
        
        const [rows] = await db.promise().query(query, [req.session.userId]);
        const userData = rows[0];
        
        if (userData.photo_profile) {
            userData.photo_profile = `data:image/jpeg;base64,${userData.photo_profile.toString('base64')}`;
        }
        
        res.json(userData);
    } catch (error) {
        console.error('Error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Update profile
router.post('/update-profile', checkArtisanAuth, async (req, res) => {
    try {
        console.log('Received data:', req.body);

        const { fullname, phone, address, profession, experience, hourly_rate, description, facebook, instagram, linkedin } = req.body;
        
        // Start transaction
        const connection = await db.promise().getConnection();
        await connection.beginTransaction();

        try {
            // Update user table
            const userQuery = `
                UPDATE utilisateurs 
                SET nom = ?, telephone = ?
                WHERE id = ?
            `;
            await connection.query(userQuery, [fullname, phone, req.session.userId]);

            // Update artisan table with simple text fields
            const artisanQuery = `
                UPDATE artisans 
                SET spécialité = ?, 
                    expérience = ?, 
                    localisation = ?,
                    description = ?,
                    tarif_horaire = ?,
                    facebook = ?,
                    instagram = ?,
                    linkedin = ?
                WHERE utilisateur_id = ?
            `;
            
            // Convert empty strings to null for database
            const fbValue = facebook?.trim() || null;
            const igValue = instagram?.trim() || null;
            const liValue = linkedin?.trim() || null;

            await connection.query(artisanQuery, [
                profession, 
                experience, 
                address, 
                description, 
                hourly_rate,
                fbValue,
                igValue,
                liValue,
                req.session.userId
            ]);

            // Commit transaction
            await connection.commit();
            
            console.log('Profile updated successfully');

            res.json({ 
                success: true, 
                message: 'تم تحديث الملف الشخصي بنجاح' 
            });
        } catch (error) {
            // Rollback on error
            await connection.rollback();
            throw error;
        } finally {
            connection.release();
        }
    } catch (error) {
        console.error('Error updating profile:', error);
        res.status(500).json({ 
            success: false, 
            message: 'حدث خطأ أثناء تحديث الملف الشخصي' 
        });
    }
});

// Get artisan reviews page
router.get('/reviews', checkArtisanAuth, async (req, res) => {
    try {
        const userData = await getUserData(req.session.userId);
        res.render('artisan/reviews', {
            title: 'التقييمات - TN M3allim',
            user: {
                id: req.session.userId,
                role: req.session.userRole,
                name: req.session.userName,
                photo_profile: userData.photo_profile || '/img/avatar-placeholder.png'
            },
            active: 'reviews'
        });
    } catch (error) {
        console.error('Error:', error);
        res.status(500).send('Internal Server Error');
    }
});

// Get artisan reviews data
router.get('/reviews/data', checkArtisanAuth, async (req, res) => {
    try {
        const userId = req.session.userId;

        // First get artisan_id
        const getArtisanQuery = `SELECT id FROM artisans WHERE utilisateur_id = ?`;
        const [artisanResult] = await db.promise().query(getArtisanQuery, [userId]);
        
        if (artisanResult.length === 0) {
            return res.status(404).json({ error: 'Artisan not found' });
        }

        const artisanId = artisanResult[0].id;

        // Get total reviews count
        const countQuery = `SELECT COUNT(*) as total FROM reviews WHERE artisan_id = ?`;
        const [countResult] = await db.promise().query(countQuery, [artisanId]);

        // Get reviews with user info including photo
        const reviewsQuery = `
            SELECT r.*, u.nom as clientName
            FROM reviews r
            JOIN utilisateurs u ON r.user_id = u.id
            WHERE r.artisan_id = ?
            ORDER BY r.created_at DESC
        `;

        const [reviews] = await db.promise().query(reviewsQuery, [artisanId]);

        // Format reviews data
        res.json({
            totalReviews: countResult[0].total,
            reviews: reviews.map(review => {
                const date = new Date(review.created_at);
                return {
                    id: review.id,
                    clientName: review.clientName,
                    rating: review.rating,
                    comment: review.review_text,
                    createdAt: date.toISOString()
                };
            })
        });
    } catch (error) {
        console.error('Error fetching reviews:', error);
        res.status(500).json({ error: 'Error fetching reviews' });
    }
});

// Get unique artisan locations
router.get('/get-locations', async (req, res) => {
    try {
        const query = `
            SELECT DISTINCT 
                u.gouvernorat,
                u.ville
            FROM utilisateurs u
            WHERE u.rôle = 'artisan'
            ORDER BY u.gouvernorat, u.ville
        `;
        
        const [results] = await db.promise().query(query);
        
        // Group locations by governorate
        const locations = {};
        results.forEach(row => {
            if (!locations[row.gouvernorat]) {
                locations[row.gouvernorat] = [];
            }
            if (row.ville) {
                locations[row.gouvernorat].push(row.ville);
            }
        });

        res.json(locations);
    } catch (error) {
        console.error('Error fetching locations:', error);
        res.status(500).json({ error: 'Error fetching locations' });
    }
});

// Route for artisan list page (admin view)
router.get('/list', async (req, res) => {
    try {
        const query = `
            SELECT 
                COUNT(*) AS totalArtisans,
                SUM(CASE WHEN active = TRUE THEN 1 ELSE 0 END) AS activeArtisans
            FROM utilisateurs
            WHERE rôle = 'artisan'
        `;
        
        const [results] = await db.promise().query(query);
        
        res.render('artisan-list/index', { 
            totalArtisans: results[0].totalArtisans,
            activeArtisans: results[0].activeArtisans || 0
        });
    } catch (error) {
        console.error('Error counting artisans:', error);
        res.render('artisan-list/index', { totalArtisans: 0, activeArtisans: 0, error: 'حدث خطأ أثناء جلب عدد الحرفيين' });
    }
});

// Get artisan statistics
router.get('/stats', checkArtisanAuth, async (req, res) => {
    try {
        // First get artisan_id
        const getArtisanIdQuery = `SELECT id FROM artisans WHERE utilisateur_id = ?`;
        
        const [artisanResult] = await db.promise().query(getArtisanIdQuery, [req.session.userId]);
        
        if (artisanResult.length === 0) {
            return res.status(404).json({ error: 'Artisan not found' });
        }
        
        const artisanId = artisanResult[0].id;
        
        // Get all stats in a single query
        const statsQuery = `
            SELECT 
                1 as services,
                COALESCE(AVG(r.rating), 0) as rating,
                COUNT(DISTINCT r.id) as reviews,
                COUNT(DISTINCT b.id) as appointments,
                (
                    SELECT COUNT(DISTINCT user_id) 
                    FROM (
                        SELECT user_id FROM bookings WHERE artisan_id = ?
                        UNION
                        SELECT user_id FROM reviews WHERE artisan_id = ?
                    ) as unique_clients
                ) as clients_count
            FROM artisans a
            LEFT JOIN reviews r ON r.artisan_id = a.id
            LEFT JOIN bookings b ON b.artisan_id = a.id
            WHERE a.id = ?
        `;
        
        const [stats] = await db.promise().query(statsQuery, [artisanId, artisanId, artisanId]);
        
        res.json({
            services: stats[0].services || 0,
            rating: parseFloat(stats[0].rating) || 0,
            reviews: stats[0].reviews || 0,
            appointments: stats[0].appointments || 0,
            clients: stats[0].clients_count || 0
        });
        
    } catch (error) {
        console.error('Error fetching stats:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Get recent activities
router.get('/recent-activities', checkArtisanAuth, async (req, res) => {
    try {
        // First get artisan_id
        const getArtisanQuery = `SELECT id FROM artisans WHERE utilisateur_id = ?`;
        const [artisanResult] = await db.promise().query(getArtisanQuery, [req.session.userId]);
        
        if (artisanResult.length === 0) {
            return res.status(404).json({ error: 'Artisan not found' });
        }
        
        const artisanId = artisanResult[0].id;
        const status = req.query.status || 'all';

        let statusCondition = '';
        if (status !== 'all') {
            statusCondition = `AND b.status = '${status}'`;
        }

        const query = `
            SELECT 
                b.id,
                b.booking_date,
                b.booking_time,
                b.status,
                b.created_at,
                b.client_number,
                u.nom as user_name,
                u.telephone as user_phone,
                u.photo_profile as user_photo,
                b.notes
            FROM bookings b
            JOIN utilisateurs u ON b.user_id = u.id
            WHERE b.artisan_id = ? 
            ${statusCondition}
            ORDER BY b.created_at DESC
        `;
        
        const [activities] = await db.promise().query(query, [artisanId]);
        
        res.json(activities.map(activity => {
            if (activity.user_photo) {
                activity.user_photo = `data:image/jpeg;base64,${activity.user_photo.toString('base64')}`;
            }
            return activity;
        }));
    } catch (error) {
        console.error('Error fetching activities:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Update booking status
router.put('/bookings/:id/status', checkArtisanAuth, async (req, res) => {
    try {
        const { status } = req.body;
        const bookingId = req.params.id;

        // First get artisan_id
        const getArtisanQuery = `SELECT id FROM artisans WHERE utilisateur_id = ?`;
        
        const [artisanResult] = await db.promise().query(getArtisanQuery, [req.session.userId]);
        
        if (artisanResult.length === 0) {
            return res.status(404).json({ error: 'Artisan not found' });
        }
        
        const artisanId = artisanResult[0].id;

        // Verify the booking belongs to this artisan
        const verifyQuery = `SELECT id FROM bookings WHERE id = ? AND artisan_id = ?`;
        
        const [bookingResult] = await db.promise().query(verifyQuery, [bookingId, artisanId]);

        if (bookingResult.length === 0) {
            return res.status(404).json({ error: 'Booking not found' });
        }

        // Start a transaction
        const connection = await db.promise().getConnection();
        await connection.beginTransaction();

        try {
            // Update booking status
            await connection.query(
                'UPDATE bookings SET status = ? WHERE id = ?',
                [status, bookingId]
            );

            // If status is 'confirmed', update artisan's disponibilité to null
            if (status === 'confirmed') {
                await connection.query(
                    'UPDATE artisans SET disponibilité = NULL WHERE id = ?',
                    [artisanId]
                );
            }

            await connection.commit();
            res.json({ message: 'Booking status updated successfully' });
        } catch (error) {
            await connection.rollback();
            throw error;
        } finally {
            connection.release();
        }
    } catch (error) {
        console.error('Error updating booking status:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Add new service/specialty
router.post('/services', checkArtisanAuth, async (req, res) => {
    try {
        // First get artisan_id
        const getArtisanQuery = `SELECT id, spécialité FROM artisans WHERE utilisateur_id = ?`;
        
        const [artisanResult] = await db.promise().query(getArtisanQuery, [req.session.userId]);
        
        if (artisanResult.length === 0) {
            return res.status(404).json({ error: 'Artisan not found' });
        }
        
        const artisanId = artisanResult[0].id;
        const { serviceType, specialty, hourlyRate, description } = req.body;

        // Update artisan's specialty and other details
        const updateQuery = `
            UPDATE artisans 
            SET spécialité = ?,
                description = ?,
                tarif_horaire = ?
            WHERE id = ?
        `;
        
        await db.promise().query(updateQuery, [
            specialty || serviceType, // Use specialty if provided, otherwise use serviceType
            description,
            hourlyRate,
            artisanId
        ]);
        
        res.json({ message: 'Specialty updated successfully' });
    } catch (error) {
        console.error('Error updating specialty:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Get unread notifications (new bookings)
router.get('/notifications', checkArtisanAuth, async (req, res) => {
    try {
        // First get artisan_id
        const getArtisanQuery = `SELECT id FROM artisans WHERE utilisateur_id = ?`;
        
        const [artisanResult] = await db.promise().query(getArtisanQuery, [req.session.userId]);
        
        if (artisanResult.length === 0) {
            return res.status(404).json({ error: 'Artisan not found' });
        }
        
        const artisanId = artisanResult[0].id;

        // Get new bookings (unread notifications)
        const query = `
            SELECT 
                b.id,
                b.booking_date,
                b.booking_time,
                b.status,
                b.created_at,
                u.nom as user_name,
                u.photo_profile as user_photo,
                b.notes
            FROM bookings b
            JOIN utilisateurs u ON b.user_id = u.id
            WHERE b.artisan_id = ? 
            AND b.status = 'pending'
            AND b.is_read = 0
            ORDER BY b.created_at DESC
        `;
        
        const [notifications] = await db.promise().query(query, [artisanId]);
        
        res.json(notifications.map(notification => {
            if (notification.user_photo) {
                notification.user_photo = `data:image/jpeg;base64,${notification.user_photo.toString('base64')}`;
            }
            return notification;
        }));
    } catch (error) {
        console.error('Error fetching notifications:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Mark notification as read
router.put('/notifications/:id/read', checkArtisanAuth, async (req, res) => {
    try {
        const bookingId = req.params.id;
        
        // First get artisan_id
        const getArtisanQuery = `SELECT id FROM artisans WHERE utilisateur_id = ?`;
        
        const [artisanResult] = await db.promise().query(getArtisanQuery, [req.session.userId]);
        
        if (artisanResult.length === 0) {
            return res.status(404).json({ error: 'Artisan not found' });
        }
        
        const artisanId = artisanResult[0].id;

        // Verify the booking belongs to this artisan
        const verifyQuery = `SELECT id FROM bookings WHERE id = ? AND artisan_id = ?`;
        
        const [bookingResult] = await db.promise().query(verifyQuery, [bookingId, artisanId]);

        if (bookingResult.length === 0) {
            return res.status(404).json({ error: 'Booking not found' });
        }

        // Mark as read
        const updateQuery = `UPDATE bookings SET is_read = 1 WHERE id = ?`;
        await db.promise().query(updateQuery, [bookingId]);
        
        res.json({ message: 'Notification marked as read' });
    } catch (error) {
        console.error('Error marking notification as read:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Activities page
router.get('/activities', checkArtisanAuth, async (req, res) => {
    try {
        const userData = await getUserData(req.session.userId);
        res.render('artisan/activities', {
            title: 'آخر النشاطات - TN M3allim',
            user: {
                id: req.session.userId,
                role: req.session.userRole,
                name: req.session.userName,
                photo_profile: userData.photo_profile || '/img/avatar-placeholder.png'
            }
        });
    } catch (error) {
        console.error('Error loading activities page:', error);
        res.status(500).send('Internal Server Error');
    }
});

// Update the report route
router.get('/report', checkArtisanAuth, async (req, res) => {
    try {
        const userData = await getUserData(req.session.userId);
        res.render('artisan/report', {
            title: 'تقرير الأرباح - TN M3allim',
            user: {
                id: req.session.userId,
                role: req.session.userRole,
                name: req.session.userName,
                photo_profile: userData.photo_profile || '/img/avatar-placeholder.png'
            },
            active: 'report'
        });
    } catch (error) {
        console.error('Error:', error);
        res.status(500).send('Internal Server Error');
    }
});

// Toggle artisan availability
router.post('/toggle-availability', checkArtisanAuth, async (req, res) => {
    try {
        const { available } = req.body;
        const userId = req.session.userId;

        // First get artisan_id
        const getArtisanQuery = `SELECT id FROM artisans WHERE utilisateur_id = ?`;
        const [artisanResult] = await db.promise().query(getArtisanQuery, [userId]);
        
        if (artisanResult.length === 0) {
            return res.status(404).json({ success: false, message: 'Artisan not found' });
        }

        // Update availability
        const updateQuery = `UPDATE artisans SET disponibilité = ? WHERE id = ?`;
        await db.promise().query(updateQuery, [available, artisanResult[0].id]);
        
        res.json({ success: true });
    } catch (error) {
        console.error('Error updating availability:', error);
        res.status(500).json({ success: false, message: 'Error updating availability' });
    }
});

// Get artisan availability status
router.get('/availability-status', checkArtisanAuth, async (req, res) => {
    try {
        const userId = req.session.userId;

        // Get artisan availability status
        const query = `
            SELECT disponibilité as available 
            FROM artisans 
            WHERE utilisateur_id = ?
        `;
        const [result] = await db.promise().query(query, [userId]);
        
        if (result.length === 0) {
            return res.status(404).json({ success: false, message: 'Artisan not found' });
        }

        res.json({ success: true, available: result[0].available });
    } catch (error) {
        console.error('Error getting availability status:', error);
        res.status(500).json({ success: false, message: 'Error getting availability status' });
    }
});

router.get("/artisan/messages", checkArtisanAuth, (req, res) => {
    const userId = req.session.userId; // Utilisation de userId ici
    console.log(userId);
    
    // Requête SQL pour récupérer toutes les conversations où l'utilisateur a reçu des messages
    const getUsersQuery = `
      SELECT u.id, u.nom, u.photo_profile, 
             MAX(m.timestamp) AS lastMessageTimestamp, 
             (SELECT content FROM messages WHERE (sender_id = u.id AND receiver_id = ?) 
              OR (sender_id = ? AND receiver_id = u.id) 
              ORDER BY timestamp DESC LIMIT 1) AS lastMessage
      FROM utilisateurs u
      JOIN messages m ON (
        (u.id = m.sender_id AND m.receiver_id = ?) OR
        (u.id = m.receiver_id AND m.sender_id = ?)
      )
      WHERE m.receiver_id = ?  -- L'utilisateur est le destinataire des messages
      GROUP BY u.id
      ORDER BY lastMessageTimestamp DESC
    `;
  
    db.query(getUsersQuery, [userId, userId, userId, userId, userId], (err, results) => {
      if (err) {
        console.error("Erreur lors de la requête SQL :", err);
        return res.status(500).send("Erreur DB");
      }
  
      if (results.length === 0) {
        return res.render("artisan/messages", { conversations: [], message: 'Aucune conversation trouvée' });
      }

      const conversations = results.map(row => ({
        id: row.id,
        name: row.nom,
        photo: row.photo_profile,
        lastMessage: row.lastMessage || 'Aucun message' // Dernier message ou un message par défaut
      }));
  
      res.render("artisan/messages", { conversations });
    });
});

router.get("/messages/:id", checkArtisanAuth, (req, res) => {
    const userId = req.session.userId;
    const artisanId = req.params.id;
  
    const getConversationsQuery = `
      SELECT DISTINCT u.id, u.nom, u.photo_profile
      FROM utilisateurs u
      JOIN messages m ON (u.id = m.sender_id OR u.id = m.receiver_id)
      WHERE (m.sender_id = ? OR m.receiver_id = ?) AND u.id != ?
      ORDER BY m.timestamp DESC
    `;
  
    const getMessagesQuery = `
      SELECT sender_id, content, timestamp
      FROM messages
      WHERE (sender_id = ? AND receiver_id = ?) OR (sender_id = ? AND receiver_id = ?)
      ORDER BY timestamp ASC
    `;
  
    const getSelectedUserQuery = `
      SELECT id, nom, photo_profile
      FROM utilisateurs
      WHERE id = ?
    `;
  
    db.query(getConversationsQuery, [userId, userId, userId], (err, users) => {
      if (err) return res.status(500).send("Erreur DB (conversations)");
  
      const conversations = users.map(row => ({
        id: row.id,
        name: `${row.nom}`,
        photo: row.photo_profile
      }));
  
      db.query(getMessagesQuery, [userId, artisanId, artisanId, userId], (err2, messages) => {
        if (err2) return res.status(500).send("Erreur DB (messages)");
  
        const formattedMessages = messages.map(msg => ({
          text: msg.content,
          isMe: msg.sender_id === userId
        }));
  
        db.query(getSelectedUserQuery, [artisanId], (err3, selectedUser) => {
          if (err3 || selectedUser.length === 0) {
            return res.status(500).send("Erreur DB (utilisateur sélectionné)");
          }
  
          const selected = selectedUser[0];
  
          res.render("artisan/messages", {
            conversations,
            selectedConversation: {
              id: selected.id,
              name: ` ${selected.nom}`,
              photo: selected.photo_profile,
              messages: formattedMessages
            }
          });
        });
      });
    });
  });
  
  
  // Route pour envoyer un message
  router.post("/messages/:id", checkArtisanAuth, (req, res) => {
    const userId = req.session.userId; // Utilisation de userId pour l'authentification
    const receiverId = req.params.id;  // ID de l'artisan à qui l'utilisateur envoie un message
    const content = req.body.message;
  
    // Vérification que le message n'est pas vide
    if (!content) return res.redirect("/messages/" + receiverId);
  
    // Vérification si l'utilisateur et le destinataire existent
    const checkUsersQuery = `
      SELECT 1 FROM utilisateurs WHERE id = ? OR id = ?
    `;
    db.query(checkUsersQuery, [userId, receiverId], (err, results) => {
      if (err) return res.status(500).send("Erreur DB");
      if (results.length < 2) return res.status(404).send("Utilisateur non trouvé");
  
      // Insertion du nouveau message dans la base de données
      const insertQuery = `
        INSERT INTO messages (sender_id, receiver_id, content)
        VALUES (?, ?, ?)
      `;
      db.query(insertQuery, [userId, receiverId, content], (err2) => {
        if (err2) return res.status(500).send("Erreur envoi message");
        res.redirect("/messages/" + receiverId);
      });
    });
  });
  
  
    
module.exports = router;