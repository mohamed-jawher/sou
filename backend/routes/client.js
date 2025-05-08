const express = require('express');
const router = express.Router();
const db = require('../config/database');
const { checkClientAuth,checkAuth } = require('../middleware/auth');

router.get('/', (req, res) => {
    const query = `
        SELECT a.*, u.nom, u.email, u.photo_profile, u.telephone,
               u.facebook, u.instagram, u.linkedin, u.gouvernorat, u.ville
        FROM artisans a 
        JOIN utilisateurs u ON a.utilisateur_id = u.id
        WHERE u.rôle = 'artisan'
        ORDER BY u.photo_profile ASC
    `;
    
    db.query(query, (err, artisans) => {
        if (err) {
            console.error('Error fetching artisans:', err);
            return res.render('client/index', { 
                title: 'TN M3allim - Client',
                artisans: []
            });
        }

        // Format artisans data
        const formattedArtisans = artisans.map(artisan => {
            let photoProfile = null;
            if (artisan.photo_profile) {
                try {
                    photoProfile = Buffer.from(artisan.photo_profile).toString('base64');
                } catch (error) {
                    console.error('Error converting photo to base64:', error);
                }
            }

            return {
                id: artisan.id,
                nom: artisan.nom,
                email: artisan.email,
                telephone: artisan.telephone,
                spécialité: artisan.spécialité,
                localisation: artisan.localisation,
                gouvernorat: artisan.gouvernorat,
                ville: artisan.ville,
                rating: artisan.rating || 0,
                disponibilité: artisan.disponibilité || false,
                expérience: artisan.expérience,
                photo_profile: photoProfile,
                facebook: artisan.facebook,
                instagram: artisan.instagram,
                linkedin: artisan.linkedin
            };
        });

        // Get distinct gouvernorats
        const gouvernoratQuery = `
            SELECT DISTINCT gouvernorat 
            FROM utilisateurs 
            WHERE rôle = 'artisan' 
            ORDER BY gouvernorat ASC
        `;

        db.query(gouvernoratQuery, (err, gouvernorats) => {
            if (err) {
                console.error('Error fetching gouvernorats:', err);
                gouvernorats = [];
            }

            // Get distinct cities
            const villeQuery = `
                SELECT DISTINCT ville 
                FROM utilisateurs 
                WHERE rôle = 'artisan' 
                ORDER BY ville ASC
            `;

            db.query(villeQuery, (err, villes) => {
                if (err) {
                    console.error('Error fetching villes:', err);
                    villes = [];
                }

                res.render('client/index', { 
                    title: 'TN M3allim - Client',
                    artisans: formattedArtisans,
                    gouvernorats: gouvernorats,
                    villes: villes
                });
            });
        });
    });
});

// Get cities by gouvernorat
router.get('/cities/:gouvernorat', (req, res) => {
    const gouvernorat = req.params.gouvernorat;
    const query = `
        SELECT DISTINCT ville 
        FROM utilisateurs 
        WHERE rôle = 'artisan' 
        AND gouvernorat = ?
        AND ville IS NOT NULL 
        AND ville != ''
        ORDER BY ville ASC
    `;

    db.query(query, [gouvernorat], (err, results) => {
        if (err) {
            console.error('Error fetching cities:', err);
            return res.json([]);
        }
        res.json(results);
    });
});

// Filter artisans
router.get('/filter', (req, res) => {
    const { gouvernorat, ville, speciality } = req.query;
    let query = `
        SELECT a.*, u.nom, u.email, u.photo_profile, u.gouvernorat, u.ville, u.telephone,
               u.facebook, u.instagram, u.linkedin
        FROM artisans a 
        JOIN utilisateurs u ON a.utilisateur_id = u.id
        WHERE u.rôle = 'artisan'
    `;
    const params = [];

    if (gouvernorat) {
        query += ' AND u.gouvernorat = ?';
        params.push(gouvernorat);
    }
    if (ville) {
        query += ' AND u.ville = ?';
        params.push(ville);
    }
    if (speciality) {
        query += ' AND a.spécialité LIKE ?';
        params.push(`%${speciality}%`);
    }

    query += ' ORDER BY a.rating DESC, u.nom ASC';

    db.query(query, params, (err, artisans) => {
        if (err) {
            console.error('Error filtering artisans:', err);
            return res.json([]);
        }

        const formattedArtisans = artisans.map(artisan => ({
            id: artisan.id,
            nom: artisan.nom,
            email: artisan.email,
            telephone: artisan.telephone,
            spécialité: artisan.spécialité,
            gouvernorat: artisan.gouvernorat,
            ville: artisan.ville,
            rating: artisan.rating || 0,
            disponibilité: artisan.disponibilité || false,
            expérience: artisan.expérience,
            photo_profile: artisan.photo_profile ? Buffer.from(artisan.photo_profile).toString('base64') : null,
            facebook: artisan.facebook,
            instagram: artisan.instagram,
            linkedin: artisan.linkedin
        }));

        res.json(formattedArtisans);
    });
});

// Update the route path by removing 'artisan' prefix
router.get('/get-gallery/:artisanId', (req, res) => {
    const artisanId = req.params.artisanId;
    
    const galleryQuery = `
        SELECT id, image_path AS image_data
        FROM gallery
        WHERE artisan_id = ?
    `;
    
    db.query(galleryQuery, [artisanId], (err, results) => {
        if (err) {
            console.error('Error fetching gallery:', err);
            return res.status(500).json({ error: 'Database error' });
        }
        
        const gallery = results.map(item => ({
            id: item.id,
            image_data: item.image_data ? item.image_data.toString('base64') : null,
            preview: `/public/uploads/gallery/${item.image_data}`
        }));
        
        res.json(gallery);
    });
});


module.exports = router;