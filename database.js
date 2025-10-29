const mysql = require('mysql2/promise');
require('dotenv').config();

const pool = mysql.createPool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  connectionLimit: 20,
  acquireTimeout: 60000,
  timeout: 60000,
  reconnect: true,
  idleTimeout: 300000
});

const initDatabase = async () => {
  let retries = 3;
  while (retries > 0) {
    try {
      await pool.execute(`
        CREATE TABLE IF NOT EXISTS mobile_searches (
          id INT AUTO_INCREMENT PRIMARY KEY,
          mobile_number VARCHAR(15) NOT NULL UNIQUE,
          click_count INT DEFAULT 0,
          name VARCHAR(100),
          last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        )
      `);
      
      await pool.execute(`
        CREATE TABLE IF NOT EXISTS test_results (
          id INT AUTO_INCREMENT PRIMARY KEY,
          name VARCHAR(100) NOT NULL,
          phone VARCHAR(15) NOT NULL UNIQUE,
          current_group VARCHAR(50),
          exam_date DATE,
          result VARCHAR(20)
        )
      `);
      
      console.log('Database initialized successfully');
      break;
    } catch (error) {
      console.error('Database initialization error:', error);
      retries--;
      if (retries === 0) {
        console.error('Failed to initialize database after 3 attempts');
        process.exit(1);
      }
      await new Promise(resolve => setTimeout(resolve, 5000));
    }
  }
};

module.exports = { pool, initDatabase };