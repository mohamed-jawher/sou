const express = require('express');
const router = express.Router();
const db = require('../config/database');
const { checkAuth } = require('../middleware/auth');

// Route pour la page contact
router.get('/', (req, res) => {
    res.render('contact-us/index', { 
        title: 'تواصل معنا - TN M3allim',
        user: req.session.userId ? {
            id: req.session.userId,
            role: req.session.userRole,
            name: req.session.userName
        } : null
    });
});

// Update the contact-us POST route to check for authentication
router.post('/', (req, res) => {
    try {
        const { name, email, phone, message } = req.body;
        
        // Validate input
        if (!name || !email || !message) {
            return res.status(400).json({ success: false, message: 'جميع الحقول مطلوبة' });
        }
        
        // Insert into enquete table
        const sql = 'INSERT INTO enquete (nom, email, num_tel, message) VALUES (?, ?, ?, ?)';
        db.query(sql, [name, email, phone || '', message], (err, result) => {
            if (err) {
                console.error('Error saving message:', err);
                return res.status(500).json({ success: false, message: 'حدث خطأ أثناء معالجة طلبك' });
            }
            
            res.status(200).json({ success: true, message: 'تم إرسال رسالتك بنجاح' });
        });
        
    } catch (error) {
        console.error('Error saving message:', error);
        res.status(500).json({ success: false, message: 'حدث خطأ أثناء معالجة طلبك' });
    }
});

// Legacy route for backward compatibility
router.post('/submit', (req, res) => {
    const { name, email, phone, message } = req.body;

    // Vérification des champs obligatoires
    if (!name || !email || !message) {
        return res.status(400).json({ error: 'Veuillez remplir tous les champs obligatoires.' });
    }

    const sql = 'INSERT INTO enquete (nom, email, num_tel, message) VALUES (?, ?, ?, ?)';
    db.query(sql, [name, email, phone, message], (err, result) => {
        if (err) {
            console.error('❌ Erreur MySQL:', err);
            return res.status(500).json({ error: 'Erreur lors de l\'enregistrement du message.' });
        }
        res.status(200).json({ success: 'Message envoyé avec succès.' });
    });
});

module.exports = router;