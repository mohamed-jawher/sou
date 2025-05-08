const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const db = require('../config/database');
const { checkAuth } = require('../middleware/auth');

// Route for password change page
router.get('/change', checkAuth, async (req, res) => {
    try {
        // Get user data for the sidebar
        const [userData] = await db.promise().query(
            'SELECT id, nom, email, img FROM utilisateurs WHERE id = ?',
            [req.session.userId]
        );

        if (!userData || userData.length === 0) {
            return res.status(404).send('User not found');
        }

        // Render the password change page
        res.render('profile/password', {
            user: {
                id: req.session.userId,
                name: userData[0].nom,
                img: userData[0].img || null
            }
        });
    } catch (error) {
        console.error('Error loading password change page:', error);
        res.status(500).send('Internal Server Error');
    }
});

// Change password route
router.post('/change', checkAuth, async (req, res) => {
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
