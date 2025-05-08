const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { checkAuth, checkArtisanAuth } = require('../middleware/auth');
const db = require('../config/database');
const upload = require('../config/upload');
const bcrypt = require('bcrypt');

// Configure multer for profile photo uploads
const uploadsDir = path.join(__dirname, '../public/uploads');
const galleryDir = path.join(uploadsDir, 'gallery');

// Create uploads directories if they don't exist
if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
}
if (!fs.existsSync(galleryDir)) {
    fs.mkdirSync(galleryDir, { recursive: true });
}

// Serve static files from the uploads directory
router.use('/uploads', express.static(path.join(__dirname, '../public/uploads')));

// Configure multer storage
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, uploadsDir);
    },
    filename: function (req, file, cb) {
        cb(null, Date.now() + '_' + file.originalname);
    }
});

const uploadPhoto = multer({
    storage: storage,
    limits: { fileSize: 5 * 1024 * 1024 }
});

// Configure multer for gallery uploads
const galleryStorage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, galleryDir);
    },
    filename: function (req, file, cb) {
        const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1E9)}`;
        cb(null, `${req.session.userId}_${uniqueSuffix}${path.extname(file.originalname)}`);
    }
});

const galleryUpload = multer({ 
    storage: galleryStorage,
    limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
    fileFilter: (req, file, cb) => {
        const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
        if (allowedTypes.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error('Only JPG, PNG, GIF and WebP images are allowed'));
        }
    }
});

// Function to handle profile image upload
async function handleProfileImageUpload(req, userId, connection) {
    let photoPath = null;
    if (req.file) {
        // Delete old profile photo if exists
        const [user] = await connection.query(
            'SELECT img FROM utilisateurs WHERE id = ?', 
            [userId]
        );
        
        if (user[0].img) {
            const oldPhotoPath = path.join(__dirname, '../public/uploads', user[0].img);
            if (fs.existsSync(oldPhotoPath)) {
                fs.unlinkSync(oldPhotoPath);
            }
        }
        
        // Set new photo path using req.file.filename
        photoPath = req.file.filename;

        // Update database with new photo path
        await connection.query(
            'UPDATE utilisateurs SET img = ? WHERE id = ?',
            [photoPath, userId]
        );
    }
    return photoPath;
}

// Route for profile index page
router.get('/index', checkAuth, async (req, res) => {
    try {
        // Get user data from database ordered by name
        const [userData] = await db.promise().query(
            'SELECT id, nom, email, telephone, adresse, gouvernorat, ville, code_postal, img FROM utilisateurs WHERE id = ? ORDER BY nom ASC',
            [req.session.userId]
        );

        if (!userData || userData.length === 0) {
            return res.status(404).send('User not found');
        }

        // Send the data to the template
        res.render('profile/index', {
            title: 'الملف الشخصي- TN M3allim',
            user: {
                id: req.session.userId,
                role: req.session.userRole,
                name: userData[0].nom,
                img: userData[0].img || null,
                email: userData[0].email || '',
                telephone: userData[0].telephone || '',
                adresse: userData[0].adresse || '',
                gouvernorat: userData[0].gouvernorat || '',
                ville: userData[0].ville || '',
                code_postal: userData[0].code_postal || ''
            }
        });
    } catch (error) {
        console.error('Error fetching profile:', error);
        res.status(500).send('Internal Server Error');
    }
});

// Route pour la page profile
router.get('/', checkAuth, async (req, res) => {
    try {
        // Get user data from database ordered by name
        const [userData] = await db.promise().query(
            'SELECT id, nom, email, telephone, adresse, gouvernorat, ville, code_postal, `utilisateurs`.`img` FROM utilisateurs WHERE id = ? ORDER BY nom ASC',
            [req.session.userId]
        );

        if (!userData || userData.length === 0) {
            return res.status(404).send('User not found');
        }

        console.log('User Data:', userData[0]); // Debug log

        // Send the data to the template
        res.render('user-dashboard/profile', {
            title: 'الملف الشخصي- TN M3allim',
            user: {
                id: req.session.userId,
                role: req.session.userRole,
                name: userData[0].nom,
                img: userData[0].img || null
            },
            profile: {
                nom: userData[0].nom || '',
                email: userData[0].email || '',
                telephone: userData[0].telephone || '',
                adresse: userData[0].adresse || '',
                gouvernorat: userData[0].gouvernorat || '',
                ville: userData[0].ville || '',
                code_postal: userData[0].code_postal || '',
                img: userData[0].img || ''
            }
        });
    } catch (error) {
        console.error('Error fetching profile:', error);
        res.status(500).send('Internal Server Error');
    }
});

// Get profile data
router.get('/data', checkAuth, (req, res) => {
    const userId = req.session.userId;
    
    const query = `
        SELECT u.*, 
               a.spécialité, 
               a.expérience, 
               a.localisation,
               a.rating, 
               a.disponibilité,
               a.description,
               a.tarif_horaire
        FROM utilisateurs u
        LEFT JOIN artisans a ON u.id = a.utilisateur_id
        WHERE u.id = ?
    `;
    
    db.query(query, [userId], (err, results) => {
        if (err) {
            console.error('Error fetching profile data:', err);
            return res.status(500).json({ error: 'Database error' });
        }
        
        if (results.length === 0) {
            return res.status(404).json({ error: 'User not found' });
        }

        const userData = results[0];
        console.log(userData)
        
        // Convert photo buffer to base64 if it exists
        const photo_profile = userData.photo_profile 
            ? `data:image/jpeg;base64,${userData.photo_profile.toString('base64')}`
            : null;

        const response = {
            id: userData.id,
            name: userData.nom,
            email: userData.email,
            phone: userData.telephone,
            address: userData.adresse,
            governorate: userData.gouvernorat,
            city: userData.ville,
            postal_code: userData.code_postal,
            photo_profile: photo_profile,
            rôle: userData.rôle,
            artisan: userData.spécialité ? {
                spécialité: userData.spécialité,
                expérience: userData.expérience,
                localisation: userData.localisation,
                description: userData.description,
                rating: userData.rating,
                disponibilité: userData.disponibilité,
                tarif_horaire: userData.tarif_horaire || 0
            } : null
        };

        res.json(response);
    });
});

// Update profile route
router.post('/update-profile', checkAuth, upload.fields([
    { name: 'profilePhoto', maxCount: 1 },
    { name: 'galleryImages', maxCount: 10 }
]), async (req, res) => {
    try {
        // Get form data
        const { 
            fullname, email, telephone, adresse, gouvernorat, 
            ville, code_postal, localisation, facebook, instagram, linkedin
        } = req.body;
        
        console.log('Received form data:', {
            fullname, email, telephone, adresse, gouvernorat,
            ville, code_postal, localisation, facebook, instagram, linkedin
        });
        
        const connection = await db.promise().getConnection();
        
        try {
            await connection.beginTransaction();

            // First get current user data to preserve values
            const [currentUser] = await connection.query(
                'SELECT facebook, instagram, linkedin FROM utilisateurs WHERE id = ?',
                [req.session.userId]
            );

            // Update user information including social media
            const userUpdateResult = await connection.query(
                'UPDATE utilisateurs SET nom = ?, telephone = ?, adresse = ?, gouvernorat = ?, ville = ?, code_postal = ?, facebook = ?, instagram = ?, linkedin = ? WHERE id = ?',
                [
                    fullname, 
                    telephone, 
                    adresse, 
                    gouvernorat, 
                    ville, 
                    code_postal,
                    // For social media, use current values if not provided in request
                    facebook || currentUser[0].facebook,
                    instagram || currentUser[0].instagram,
                    linkedin || currentUser[0].linkedin,
                    req.session.userId
                ]
            );
            
            console.log('User update result:', userUpdateResult);

            // Update artisan localisation if provided
            if (localisation !== undefined && localisation !== null) {
                console.log('Updating artisan with localisation:', localisation);
                
                const [artisanResult] = await connection.query(
                    'SELECT id FROM artisans WHERE utilisateur_id = ?',
                    [req.session.userId]
                );

                console.log('Existing artisan:', artisanResult);

                if (artisanResult.length > 0) {
                    // Update existing artisan record
                    const artisanUpdateResult = await connection.query(
                        'UPDATE artisans SET localisation = ? WHERE utilisateur_id = ?',
                        [localisation, req.session.userId]
                    );
                    console.log('Artisan update result:', artisanUpdateResult);
                } else {
                    // Create new artisan record
                    const artisanInsertResult = await connection.query(
                        'INSERT INTO artisans (utilisateur_id, localisation) VALUES (?, ?)',
                        [req.session.userId, localisation]
                    );
                    console.log('Artisan insert result:', artisanInsertResult);
                }
            }

            await connection.commit();
            console.log('Transaction committed successfully');

            // Fetch updated data to send back
            const [userData] = await connection.query(
                `SELECT u.*, a.localisation 
                 FROM utilisateurs u 
                 LEFT JOIN artisans a ON u.id = a.utilisateur_id 
                 WHERE u.id = ?`,
                [req.session.userId]
            );

            res.json({
                success: true,
                message: 'تم تحديث الملف الشخصي بنجاح',
                user: {
                    nom: userData[0].nom,
                    telephone: userData[0].telephone,
                    adresse: userData[0].adresse,
                    gouvernorat: userData[0].gouvernorat,
                    ville: userData[0].ville,
                    code_postal: userData[0].code_postal,
                    localisation: userData[0].localisation || ''
                }
            });

        } catch (error) {
            await connection.rollback();
            throw error;
        } finally {
            connection.release();
        }

    } catch (error) {
        console.error('Error updating profile:', error);
        res.status(500).json({
            success: false,
            message: 'حدث خطأ في تحديث الملف الشخصي'
        });
    }
});

// Route to handle profile photo upload
router.post('/upload-photo', checkAuth, uploadPhoto.single('profilePhoto'), async (req, res) => {
    if (!req.file) {
        return res.status(400).json({
            success: false,
            error: 'لم يتم تحميل أي صورة'
        });
    }

    const connection = await db.promise().getConnection();
    
    try {
        await connection.beginTransaction();

        // Delete old profile photo if exists
        const [user] = await connection.query('SELECT img FROM utilisateurs WHERE id = ?', [req.session.userId]);
        if (user[0].img) {
            const oldPhotoPath = path.join(__dirname, '../public/uploads', user[0].img);
            if (fs.existsSync(oldPhotoPath)) {
                fs.unlinkSync(oldPhotoPath);
            }
        }

        // Update database with new photo path
        const relativePath = req.file.filename;
        await connection.query(
            'UPDATE utilisateurs SET img = ? WHERE id = ?',
            [relativePath, req.session.userId]
        );

        await connection.commit();
        res.json({ 
            success: true, 
            message: 'تم تحديث الصورة الشخصية بنجاح',
            photo_profile: relativePath
        });

    } catch (error) {
        await connection.rollback();
        console.error('Error uploading profile photo:', error);
        // Delete uploaded file if database update fails
        if (req.file && req.file.path && fs.existsSync(req.file.path)) {
            fs.unlinkSync(req.file.path);
        }
        res.status(500).json({ 
            success: false, 
            error: 'حدث خطأ أثناء تحديث الصورة الشخصية' 
        });
    } finally {
        connection.release();
    }
});

// Route to remove profile photo
router.delete('/remove-photo', checkAuth, async (req, res) => {
    const connection = await db.promise().getConnection();
    
    try {
        await connection.beginTransaction();

        // Get current photo path
        const [user] = await connection.query('SELECT img FROM utilisateurs WHERE id = ?', [req.session.userId]);
        
        if (user[0].img) {
            // Delete photo file
            const photoPath = path.join(__dirname, '../public/uploads', user[0].img);
            if (fs.existsSync(photoPath)) {
                fs.unlinkSync(photoPath);
            }

            // Update database
            await connection.query(
                'UPDATE utilisateurs SET img = NULL WHERE id = ?',
                [req.session.userId]
            );
        }

        await connection.commit();
        res.json({ 
            success: true, 
            message: 'تم حذف الصورة الشخصية بنجاح' 
        });

    } catch (error) {
        await connection.rollback();
        console.error('Error removing profile photo:', error);
        res.status(500).json({ 
            success: false, 
            error: 'حدث خطأ أثناء حذف الصورة الشخصية' 
        });
    } finally {
        connection.release();
    }
});

// Gallery upload route
router.post('/upload-gallery', checkAuth, upload.array('gallery[]', 10), async (req, res) => {
    try {
        if (!req.files || req.files.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'لم يتم تحديد أي صور'
            });
        }

        const connection = await db.promise().getConnection();
        
        try {
            await connection.beginTransaction();

            const images = [];
            for (const file of req.files) {
                const [result] = await connection.query(
                    'INSERT INTO gallery (utilisateur_id, image_url, created_at) VALUES (?, ?, NOW())',
                    [req.session.userId, `/uploads/gallery/${file.filename}`]
                );

                images.push({
                    id: result.insertId,
                    url: `/uploads/gallery/${file.filename}`
                });
            }

            await connection.commit();

            res.json({
                success: true,
                message: 'تم رفع الصور بنجاح',
                images
            });

        } catch (error) {
            await connection.rollback();
            throw error;
        } finally {
            connection.release();
        }

    } catch (error) {
        console.error('Error uploading gallery images:', error);
        res.status(500).json({
            success: false,
            message: 'حدث خطأ في رفع الصور'
        });
    }
});

// Remove gallery image route
router.delete('/remove-gallery-image/:id', checkAuth, async (req, res) => {
    try {
        const imageId = req.params.id;
        const connection = await db.promise().getConnection();

        try {
            // Get the image details first
            const [image] = await connection.query(
                'SELECT * FROM gallery WHERE id = ? AND utilisateur_id = ?',
                [imageId, req.session.userId]
            );

            if (!image.length) {
                return res.status(404).json({
                    success: false,
                    message: 'الصورة غير موجودة'
                });
            }

            // Delete the image file
            const imagePath = path.join(__dirname, '../public', image[0].image_url);
            if (fs.existsSync(imagePath)) {
                fs.unlinkSync(imagePath);
            }

            // Delete from database
            await connection.query(
                'DELETE FROM gallery WHERE id = ? AND utilisateur_id = ?',
                [imageId, req.session.userId]
            );

            res.json({
                success: true,
                message: 'تم حذف الصورة بنجاح'
            });

        } finally {
            connection.release();
        }

    } catch (error) {
        console.error('Error removing gallery image:', error);
        res.status(500).json({
            success: false,
            message: 'حدث خطأ في حذف الصورة'
        });
    }
});

// Get gallery images
router.get('/gallery', checkAuth, async (req, res) => {
    try {
        // First get the artisan id for this user
        const [artisan] = await db.promise().query(
            'SELECT id FROM artisans WHERE utilisateur_id = ?',
            [req.session.userId]
        );

        if (!artisan || artisan.length === 0) {
            return res.json([]);
        }

        const query = 'SELECT id, image_path as filename FROM gallery WHERE artisan_id = ? ORDER BY created_at DESC';
        const [images] = await db.promise().query(query, [artisan[0].id]);
        
        // Transform image paths to match the frontend expected format
        const transformedImages = images.map(img => ({
            ...img,
            filename: img.filename // Keep as is since we're already aliasing image_path as filename
        }));
        
        console.log('Gallery images:', transformedImages);
        res.json(transformedImages);
    } catch (error) {
        console.error('Error fetching gallery:', error);
        res.status(500).json({ success: false, error: 'حدث خطأ في جلب معرض الصور' });
    }
});

// Upload gallery images
router.post('/gallery', checkAuth, galleryUpload.array('gallery', 10), async (req, res) => {
    if (!req.files || req.files.length === 0) {
        return res.status(400).json({ success: false, message: 'لم يتم تحديد أي صور' });
    }

    const connection = await db.promise().getConnection();
    try {
        await connection.beginTransaction();

        // First get the artisan id for this user
        const [artisan] = await connection.query(
            'SELECT id FROM artisans WHERE utilisateur_id = ?',
            [req.session.userId]
        );

        if (!artisan || artisan.length === 0) {
            throw new Error('Artisan record not found');
        }

        const artisanId = artisan[0].id;
        const values = req.files.map(file => [artisanId, file.filename]);
        const query = 'INSERT INTO gallery (artisan_id, image_path) VALUES ?';
        
        const [result] = await connection.query(query, [values]);
        
        // Get the newly inserted images
        const imageIds = Array.from({ length: req.files.length }, (_, i) => result.insertId + i);
        const [images] = await connection.query(
            'SELECT id, image_path as filename FROM gallery WHERE id IN (?)',
            [imageIds]
        );

        await connection.commit();
        
        res.json({
            success: true,
            message: 'تم رفع الصور بنجاح',
            images: images
        });
    } catch (error) {
        await connection.rollback();
        console.error('Error uploading gallery images:', error);
        
        // Delete uploaded files if database operation fails
        req.files.forEach(file => {
            fs.unlink(file.path, err => {
                if (err) console.error('Error deleting file:', err);
            });
        });
        
        res.status(500).json({
            success: false,
            message: error.message === 'Artisan record not found' 
                ? 'لم يتم العثور على حساب الحرفي' 
                : 'حدث خطأ أثناء رفع الصور'
        });
    } finally {
        connection.release();
    }
});

// Delete gallery image
router.delete('/gallery/:filename', checkAuth, async (req, res) => {
    const connection = await db.promise().getConnection();
    try {
        await connection.beginTransaction();

        // First get the artisan id for this user
        const [artisan] = await connection.query(
            'SELECT id FROM artisans WHERE utilisateur_id = ?',
            [req.session.userId]
        );

        if (!artisan || artisan.length === 0) {
            throw new Error('Artisan record not found');
        }

        const artisanId = artisan[0].id;

        // Get image details and verify ownership
        const [image] = await connection.query(
            'SELECT * FROM gallery WHERE image_path = ? AND artisan_id = ?',
            [req.params.filename, artisanId]
        );

        if (image.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'الصورة غير موجودة'
            });
        }

        // Delete from database
        await connection.query(
            'DELETE FROM gallery WHERE image_path = ? AND artisan_id = ?',
            [req.params.filename, artisanId]
        );

        // Delete file
        const filePath = path.join(galleryDir, req.params.filename);
        fs.unlink(filePath, err => {
            if (err && err.code !== 'ENOENT') {
                console.error('Error deleting file:', err);
            }
        });

        await connection.commit();
        res.json({
            success: true,
            message: 'تم حذف الصورة بنجاح'
        });
    } catch (error) {
        await connection.rollback();
        console.error('Error deleting gallery image:', error);
        res.status(500).json({
            success: false,
            message: error.message === 'Artisan record not found' 
                ? 'لم يتم العثور على حساب الحرفي' 
                : 'حدث خطأ أثناء حذف الصورة'
        });
    } finally {
        connection.release();
    }
});

// Add gallery images during profile update
router.post('/update-profile-gallery', checkAuth, galleryUpload.array('galleryImages'), async (req, res) => {
    try {
        if (!req.files || req.files.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'لم يتم تحديد أي صور'
            });
        }

        const connection = await db.promise().getConnection();
        try {
            await connection.beginTransaction();

            // Get artisan ID
            const [artisan] = await connection.query(
                'SELECT id FROM artisans WHERE utilisateur_id = ?',
                [req.session.userId]
            );

            if (!artisan || artisan.length === 0) {
                throw new Error('Artisan record not found');
            }

            const artisanId = artisan[0].id;
            
            // Process each image
            const promises = req.files.map(async (file) => {
                const imageFileName = file.filename;
                
                // Save to database
                await connection.query(
                    'INSERT INTO gallery (artisan_id, image_path) VALUES (?, ?)',
                    [artisanId, imageFileName]
                );
            });

            await Promise.all(promises);
            await connection.commit();

            res.json({
                success: true,
                message: 'تم رفع الصور بنجاح'
            });

        } catch (error) {
            await connection.rollback();
            throw error;
        } finally {
            connection.release();
        }

    } catch (error) {
        console.error('Error uploading gallery images:', error);
        
        // Delete uploaded files if there was an error
        if (req.files) {
            req.files.forEach(file => {
                fs.unlink(file.path, err => {
                    if (err) console.error('Error deleting file:', err);
                });
            });
        }

        res.status(500).json({
            success: false,
            message: error.message === 'Artisan record not found' 
                ? 'لم يتم العثور على حساب الحرفي' 
                : 'حدث خطأ أثناء رفع الصور'
        });
    }
});

// Route to render password change page
router.get('/password', checkAuth, (req, res) => {
    res.render('profile/password', {
        title: 'تغيير كلمة المرور - TN M3allim',
        user: {
            id: req.session.userId,
            role: req.session.userRole
        }
    });
});

// Change password route
router.post('/change-password', checkAuth, async (req, res) => {
    console.log('Password change request received:', {
        userId: req.session.userId,
        hasCurrentPassword: !!req.body.currentPassword,
        hasNewPassword: !!req.body.newPassword
    });

    const { currentPassword, newPassword } = req.body;
    
    if (!currentPassword || !newPassword) {
        return res.status(400).json({
            success: false,
            message: 'جميع الحقول مطلوبة'
        });
    }

    try {
        // Get current user's password from database
        const [user] = await db.promise().query(
            'SELECT mot_de_passe FROM utilisateurs WHERE id = ?',
            [req.session.userId]
        );

        if (!user || user.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'المستخدم غير موجود'
            });
        }

        // Verify current password matches database
        const isMatch = await bcrypt.compare(currentPassword, user[0].mot_de_passe);
        console.log('Password match:', isMatch);

        if (!isMatch) {
            return res.status(400).json({
                success: false,
                message: 'كلمة المرور الحالية غير صحيحة'
            });
        }

        // Hash new password
        const hashedPassword = await bcrypt.hash(newPassword, 10);

        // Update password in database
        await db.promise().query(
            'UPDATE utilisateurs SET mot_de_passe = ? WHERE id = ?',
            [hashedPassword, req.session.userId]
        );

        console.log('Password updated successfully');
        res.json({
            success: true,
            message: 'تم تغيير كلمة المرور بنجاح'
        });

    } catch (error) {
        console.error('Error changing password:', error);
        res.status(500).json({
            success: false,
            message: 'حدث خطأ في تغيير كلمة المرور'
        });
    }
});

module.exports = router;