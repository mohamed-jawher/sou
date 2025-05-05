const db = require('./database');

async function updateGalleryTable() {
    const connection = await db.promise().getConnection();
    
    try {
        await connection.beginTransaction();

        // Drop existing gallery table
        await connection.query('DROP TABLE IF EXISTS gallery');

        // Create new gallery table with proper foreign key
        await connection.query(`
            CREATE TABLE gallery (
                id INT PRIMARY KEY AUTO_INCREMENT,
                artisan_id INT NOT NULL,
                image_path VARCHAR(255) NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (artisan_id) REFERENCES artisans(id) ON DELETE CASCADE
            )
        `);

        await connection.commit();
        console.log('Gallery table updated successfully');
    } catch (error) {
        await connection.rollback();
        console.error('Error updating gallery table:', error);
    } finally {
        connection.release();
        process.exit();
    }
}

updateGalleryTable();
