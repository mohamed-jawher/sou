const express = require('express');
const router = express.Router();
const db = require('../config/database');

// Setup route to add social media columns
router.get('/add-social-media-columns', async (req, res) => {
    try {
        // Add social media columns to utilisateurs table
        const alterQuery = `
            ALTER TABLE utilisateurs 
            ADD COLUMN facebook VARCHAR(255) DEFAULT NULL,
            ADD COLUMN instagram VARCHAR(255) DEFAULT NULL,
            ADD COLUMN linkedin VARCHAR(255) DEFAULT NULL;
        `;

        await db.promise().query(alterQuery);

        res.json({
            success: true,
            message: 'Social media columns added successfully'
        });
    } catch (error) {
        console.error('Error adding social media columns:', error);
        res.status(500).json({
            success: false,
            error: 'Error adding social media columns'
        });
    }
});

module.exports = router;
