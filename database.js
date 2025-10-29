const mysql = require('mysql2/promise');
require('dotenv').config();

const pool = mysql.createPool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  connectionLimit: 20
});

const initDatabase = async () => {
  try {
    await pool.execute(`
      CREATE TABLE IF NOT EXISTS mobile_searches (
        id INT AUTO_INCREMENT PRIMARY KEY,
        mobile_number VARCHAR(15) NOT NULL UNIQUE,
        click_count INT DEFAULT 0,
        last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      )
    `);
    console.log('Database initialized successfully');
  } catch (error) {
    console.error('Database initialization error:', error);
  }
};

module.exports = { pool, initDatabase };