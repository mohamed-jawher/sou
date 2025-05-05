const mysql = require('mysql2');
const fs = require('fs');
const path = require('path');

// Create the connection to database
const connection = mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: '',
    database: 'tn_m3allim'  // Updated database name
});

// Read and execute the SQL file
const sqlFile = path.join(__dirname, 'add_date_naissance.sql');
const sql = fs.readFileSync(sqlFile, 'utf8');

connection.query(sql, (err, results) => {
    if (err) {
        console.error('Error executing migration:', err);
        process.exit(1);
    }
    
    console.log('Migration completed successfully!');
    connection.end();
    process.exit(0);
});
