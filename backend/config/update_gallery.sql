-- Drop the existing gallery table if it exists
DROP TABLE IF EXISTS gallery;

-- Create the gallery table with proper foreign key to artisans table
CREATE TABLE gallery (
    id INT PRIMARY KEY AUTO_INCREMENT,
    artisan_id INT NOT NULL,
    image_path VARCHAR(255) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (artisan_id) REFERENCES artisans(id) ON DELETE CASCADE
);
