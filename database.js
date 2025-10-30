const mysql = require('mysql2/promise');
require('dotenv').config();

const pool = mysql.createPool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  connectionLimit: 100, // Increased for high load
  acquireTimeout: 60000,
  timeout: 60000,
  reconnect: true,
  idleTimeout: 300000,
  queueLimit: 0, // No limit on queued connections
  maxIdle: 10, // Maximum idle connections
  enableKeepAlive: true,
  keepAliveInitialDelay: 0
});

const initDatabase = async () => {
  let retries = 5;
  while (retries > 0) {
    try {
      // Test connection first
      await pool.execute('SELECT 1');
      
      await pool.execute(`
        CREATE TABLE IF NOT EXISTS mobile_searches (
          id INT AUTO_INCREMENT PRIMARY KEY,
          mobile_number VARCHAR(15) NOT NULL UNIQUE,
          click_count INT DEFAULT 0,
          name VARCHAR(100),
          last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          INDEX idx_mobile_number (mobile_number),
          INDEX idx_last_updated (last_updated)
        )
      `);
      
      await pool.execute(`
        CREATE TABLE IF NOT EXISTS test_results (
          id INT AUTO_INCREMENT PRIMARY KEY,
          name VARCHAR(100) NOT NULL,
          phone VARCHAR(15) NOT NULL UNIQUE,
          current_group VARCHAR(50),
          exam_date DATE,
          result VARCHAR(20),
          INDEX idx_phone (phone)
        )
      `);
      
      console.log('Database initialized successfully');
      return;
    } catch (error) {
      console.error('Database initialization error:', error);
      retries--;
      if (retries === 0) {
        console.error('Failed to initialize database after 5 attempts, continuing without DB');
        return; // Don't exit, continue without DB
      }
      await new Promise(resolve => setTimeout(resolve, 10000));
    }
  }
};

module.exports = { pool, initDatabase };