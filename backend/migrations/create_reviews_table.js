const db = require('../config/database');

// Create reviews table
const createReviewsTable = `
CREATE TABLE IF NOT EXISTS reviews (
    id INT PRIMARY KEY AUTO_INCREMENT,
    user_id INT NOT NULL,
    artisan_id INT NOT NULL,
    rating INT NOT NULL CHECK (rating BETWEEN 1 AND 5),
    comment TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES utilisateurs(id),
    FOREIGN KEY (artisan_id) REFERENCES utilisateurs(id),
    UNIQUE KEY unique_review (user_id, artisan_id)
)`;

db.query(createReviewsTable, (err) => {
    if (err) {
        console.error('Error creating reviews table:', err);
        process.exit(1);
    }
    console.log('Reviews table created successfully');
    process.exit(0);
});
