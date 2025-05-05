const mysql = require('mysql2');

// Use a connection pool instead of a single connection
const db = mysql.createPool({
    host: 'localhost',
    user: 'root',
    password: '',
    database: 'tn_m3allim'
});

db.on('error', function(err) {
  console.error('Database error:', err);
});

module.exports = db;