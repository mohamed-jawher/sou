const express = require('express');
const router = express.Router();
const multer = require('multer');
const bcrypt = require('bcrypt');
const db = require('../config/database');
const upload = require('../config/upload');
const { checkAuth, checkArtisanAuth } = require('../middleware/auth');
const path = require('path');
const fs = require('fs');

// Configure multer for file upload
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        const uploadDir = path.join(__dirname, '../public/uploads/profiles');
        // Create directory if it doesn't exist
        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true });
        }
        cb(null, uploadDir);
    },
    filename: function (req, file, cb) {
        const uniqueSuffix = Date.now() + '_' + Math.round(Math.random() * 1E9);
        cb(null, req.session.userId + '_' + uniqueSuffix + path.extname(file.originalname));
    }
});

const uploadPhoto = multer({
    storage: storage,
    limits: {
        fileSize: 5 * 1024 * 1024 // 5MB limit
    },
    fileFilter: function (req, file, cb) {
        const filetypes = /jpeg|jpg|png/;
        const mimetype = filetypes.test(file.mimetype);
        const extname = filetypes.test(path.extname(file.originalname).toLowerCase());

        if (mimetype && extname) {
            return cb(null, true);
        }
        cb(new Error('يرجى تحميل صور بصيغة: jpg, jpeg, png فقط'));
    }
});

// Configure multer for gallery uploads
const galleryDir = path.join(__dirname, '..', 'public', 'uploads', 'gallery');

const galleryStorage = multer.diskStorage({
    destination: function (req, file, cb) {
        if (!fs.existsSync(galleryDir)) {
            fs.mkdirSync(galleryDir, { recursive: true });
        }
        cb(null, galleryDir);
    },
    filename: function (req, file, cb) {
        const uniqueSuffix = Date.now() + '_' + Math.round(Math.random() * 1E9);
        const filename = req.session.userId + '_' + uniqueSuffix + path.extname(file.originalname);
        cb(null, filename);
    }
});

const galleryUpload = multer({
    storage: galleryStorage,
    limits: {
        fileSize: 10 * 1024 * 1024 // 5MB limit
    },
    fileFilter: function (req, file, cb) {
        const filetypes = /jpeg|jpg|png/;
        const mimetype = filetypes.test(file.mimetype);
        const extname = filetypes.test(path.extname(file.originalname).toLowerCase());

        if (mimetype && extname) {
            return cb(null, true);
        }
        cb(new Error('يرجى تحميل صور بصيغة: jpg, jpeg, png فقط'));
    }
});

// Route pour la page profile
router.get('/', checkArtisanAuth, checkAuth, async (req, res) => {
    try {
        const query = `
            SELECT u.*, a.spécialité, a.expérience, a.localisation, a.rating, a.disponibilité, a.description, a.tarif_horaire
            FROM utilisateurs u
            LEFT JOIN artisans a ON u.id = a.utilisateur_id
            WHERE u.id = ?
        `;
        
        const [userData] = await db.promise().query(query, [req.session.userId]);
        
        if (userData[0] && userData[0].photo_profile) {
            userData[0].photo_profile = `data:image/jpeg;base64,${userData[0].photo_profile.toString('base64')}`;
        }

        res.render('profile/index', {
            title: 'الملف الشخصي- TN M3allim',
            user: {
                id: req.session.userId,
                role: req.session.userRole,
                name: req.session.userName,
                photo_profile: userData[0]?.photo_profile || '/img/avatar-placeholder.png'
            },
            profile: userData[0]
        });
    } catch (error) {
        console.error('Error:', error);
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

// Create directories (move this near the top with other initialization code)
// Add this after the imports
const uploadDir = path.join(__dirname, '..', 'public', 'uploads', 'profiles');

if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}
if (!fs.existsSync(galleryDir)) {
    fs.mkdirSync(galleryDir, { recursive: true });
}

// Route to handle profile photo upload
router.post('/upload-photo', checkAuth, uploadPhoto.single('photo'), async (req, res) => {
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
        const [user] = await connection.query('SELECT photo_profile FROM utilisateurs WHERE id = ?', [req.session.userId]);
        if (user[0].photo_profile) {
            const oldPhotoPath = path.join(__dirname, '../public', user[0].photo_profile);
            if (fs.existsSync(oldPhotoPath)) {
                fs.unlinkSync(oldPhotoPath);
            }
        }

        // Update database with new photo path
        const relativePath = path.join('uploads/profiles', req.file.filename).replace(/\\/g, '/');
        await connection.query(
            'UPDATE utilisateurs SET photo_profile = ? WHERE id = ?',
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
        if (req.file) {
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
        const [user] = await connection.query('SELECT photo_profile FROM utilisateurs WHERE id = ?', [req.session.userId]);
        
        if (user[0].photo_profile) {
            // Delete photo file
            const photoPath = path.join(__dirname, '../public', user[0].photo_profile);
            if (fs.existsSync(photoPath)) {
                fs.unlinkSync(photoPath);
            }

            // Update database
            await connection.query(
                'UPDATE utilisateurs SET photo_profile = NULL WHERE id = ?',
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

// Keep existing routes (/, /data)
router.post('/update-profile', checkAuth, upload.fields([
    { name: 'profilePhoto', maxCount: 1 },
    { name: 'galleryImages', maxCount: 10 }
]), async (req, res) => {
    const userId = req.session.userId;
    const userRole = req.session.userRole;
    
    try {
        // Get form data
        const { 
            fullname, phone, address, governorate, city, postalCode,
            currentPassword, newPassword,
            profession, experience, hourlyRate, description
        } = req.body;
        
        // Update basic user information without using transactions
        const updateUserQuery = `
            UPDATE utilisateurs 
            SET nom = ?, telephone = ?, adresse = ?, gouvernorat = ?, ville = ?, code_postal = ?
            WHERE id = ?
        `;
        
        db.query(
            updateUserQuery,
            [fullname, phone, address, governorate, city, postalCode, userId],
            async (err, result) => {
                if (err) {
                    console.error('Error updating user data:', err);
                    return res.status(500).json({ 
                        success: false, 
                        message: 'Error updating user data: ' + err.message
                    });
                }
                
                // Handle password change if requested
                if (currentPassword && newPassword) {
                    try {
                        // Verify current password
                        const userQuery = 'SELECT mot_de_passe FROM utilisateurs WHERE id = ?';
                        db.query(userQuery, [userId], async (err, userResults) => {
                            if (err) {
                                console.error('Error fetching user password:', err);
                                return res.status(500).json({ 
                                    success: false, 
                                    message: 'Error verifying password'
                                });
                            }
                            
                            if (userResults.length === 0) {
                                return res.status(404).json({
                                    success: false,
                                    message: 'User not found'
                                });
                            }
                            
                            const isPasswordValid = await bcrypt.compare(currentPassword, userResults[0].mot_de_passe);
                            
                            if (!isPasswordValid) {
                                return res.status(400).json({
                                    success: false,
                                    message: 'Current password is incorrect'
                                });
                            }
                            
                            // Hash new password
                            const hashedPassword = await bcrypt.hash(newPassword, 10);
                            
                            // Update password
                            const updatePasswordQuery = 'UPDATE utilisateurs SET mot_de_passe = ? WHERE id = ?';
                            db.query(updatePasswordQuery, [hashedPassword, userId], (err, result) => {
                                if (err) {
                                    console.error('Error updating password:', err);
                                }
                            });
                        });
                    } catch (error) {
                        console.error('Password update error:', error);
                    }
                }
                
                // Handle profile photo
                if (req.files && req.files.profilePhoto) {
                    const profilePhoto = req.files.profilePhoto[0];
                    
                    // Convert the file to buffer
                    const photoBuffer = profilePhoto.buffer;

                    // Update the photo in the database
                    const updatePhotoQuery = 'UPDATE utilisateurs SET photo_profile = ? WHERE id = ?';
                    db.query(updatePhotoQuery, [photoBuffer, userId], (err, result) => {
                        if (err) {
                            console.error('Error updating profile photo:', err);
                            return res.status(500).json({
                                success: false,
                                message: 'Error updating profile photo'
                            });
                        }

                        // Get the updated user data to send back
                        const getUserQuery = 'SELECT * FROM utilisateurs WHERE id = ?';
                        db.query(getUserQuery, [userId], (err, results) => {
                            if (err || !results.length) {
                                return res.json({ 
                                    success: true, 
                                    message: 'تم تحديث الملف الشخصي بنجاح'
                                });
                            }

                            const userData = results[0];
                            const photo_profile = userData.photo_profile 
                                ? `data:image/jpeg;base64,${userData.photo_profile.toString('base64')}`
                                : null;

                            res.json({
                                success: true,
                                message: 'تم تحديث الملف الشخصي بنجاح',
                                user: {
                                    ...userData,
                                    photo_profile
                                }
                            });
                        });
                    });
                } else {
                    res.json({ 
                        success: true, 
                        message: 'تم تحديث الملف الشخصي بنجاح'
                    });
                }
                
                // Update artisan-specific information if user is an artisan
                // Inside the update-profile route, after handling artisan profile
                if (userRole === 'artisan') {
                    const checkArtisanQuery = 'SELECT id FROM artisans WHERE utilisateur_id = ?';
                    db.query(checkArtisanQuery, [userId], (err, artisanResults) => {
                        if (err) {
                            console.error('Error checking artisan profile:', err);
                            return;
                        }
                        
                        if (artisanResults && artisanResults.length > 0) {
                            // Update existing artisan profile
                            // In the update-profile route where artisan data is updated
                            const updateArtisanQuery = `
                                UPDATE artisans 
                                SET spécialité = ?, 
                                    expérience = ?, 
                                    localisation = ?,
                                    tarif_horaire = ?
                                WHERE utilisateur_id = ?
                            `;
                            
                            db.query(
                                updateArtisanQuery,
                                [profession, experience, address, hourlyRate, userId],
                                (err, result) => {
                                    if (err) {
                                        console.error('Error updating artisan profile:', err);
                                    }
                                }
                            );
                        } else {
                            // Create new artisan profile
                            const createArtisanQuery = `
                                INSERT INTO artisans (utilisateur_id, spécialité, expérience, localisation)
                                VALUES (?, ?, ?, ?)
                            `;
                            
                            db.query(
                                createArtisanQuery,
                                [userId, profession, experience, address],
                                (err, result) => {
                                    if (err) {
                                        console.error('Error creating artisan profile:', err);
                                    }
                                }
                            );
                        }
                        
                        // Add gallery images handling
                        // Inside the artisan profile update section where gallery images are handled
                        if (req.files && req.files.galleryImages) {
                            const artisanId = artisanResults[0].id;
                            console.log('Uploading gallery images for artisan:', artisanId); // Debug log
                            
                            // Handle each gallery image
                            const promises = req.files.galleryImages.map(image => {
                                return new Promise((resolve, reject) => {
                                    const imageFileName = `${userId}_${Date.now()}_${Math.random().toString(36).substring(7)}${path.extname(image.originalname)}`;
                                    console.log('Processing image:', imageFileName); // Debug log
                                    
                                    // Save file to disk
                                    fs.writeFile(
                                        path.join(__dirname, '..', 'public', 'uploads', 'gallery', imageFileName),
                                        image.buffer,
                                        async (err) => {
                                            if (err) {
                                                console.error('Error saving file:', err);
                                                reject(err);
                                                return;
                                            }
                                            
                                            // Save to database with error handling
                                            try {
                                                const insertGalleryQuery = 'INSERT INTO gallery (artisan_id, image_path) VALUES (?, ?)';
                                                const result = await new Promise((resolve, reject) => {
                                                    db.query(insertGalleryQuery, [artisanId, imageFileName], (err, result) => {
                                                        if (err) {
                                                            console.error('Database error:', err);
                                                            reject(err);
                                                            return;
                                                        }
                                                        console.log('Image saved to database:', result); // Debug log
                                                        resolve(result);
                                                    });
                                                });
                                                resolve(result);
                                            } catch (error) {
                                                console.error('Error saving to database:', error);
                                                reject(error);
                                            }
                                        }
                                    );
                                });
                            });
                            
                            // Wait for all images to be processed
                            Promise.all(promises)
                                .then(() => {
                                    console.log('All gallery images saved successfully');
                                })
                                .catch(err => {
                                    console.error('Error processing gallery images:', err);
                                });
                        }
                    });
                }
                
                // Update session name if it changed
                if (fullname && fullname !== req.session.userName) {
                    req.session.userName = fullname;
                }
            }
        );
    } catch (error) {
        console.error('Error updating profile:', error);
        res.status(500).json({ 
            success: false, 
            message: error.message || 'حدث خطأ أثناء تحديث الملف الشخصي'
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
        console.log('Gallery images:', images);
        res.json(images);
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

module.exports = router;