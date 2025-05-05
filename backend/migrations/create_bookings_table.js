const db = require('../config/database');

// Create bookings table
const createBookingsTable = `
CREATE TABLE IF NOT EXISTS bookings (
    id INT PRIMARY KEY AUTO_INCREMENT,
    user_id INT NOT NULL,
    artisan_id INT NOT NULL,
    booking_datetime DATETIME NOT NULL,
    description TEXT,
    status ENUM('pending', 'confirmed', 'cancelled', 'completed') DEFAULT 'pending',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES utilisateurs(id),
    FOREIGN KEY (artisan_id) REFERENCES artisans(id)
)`;

db.query(createBookingsTable, (err) => {
    if (err) {
        console.error('Error creating bookings table:', err);
        return;
    }
    console.log('Bookings table created successfully');
});
