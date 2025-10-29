const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { pool, initDatabase } = require('./database');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3001;

// Security middleware
app.use(helmet());
app.use(cors({
  origin: ['http://localhost:5173', 'https://your-domain.com'],
  credentials: true
}));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP'
});
app.use(limiter);

// Body parser
app.use(express.json({ limit: '10mb' }));

// Initialize database
initDatabase();

// Track mobile number search
app.post('/api/track-search', async (req, res) => {
  try {
    const { mobileNumber } = req.body;
    
    if (!mobileNumber || !/^\d{10}$/.test(mobileNumber)) {
      return res.status(400).json({ error: 'Invalid mobile number' });
    }

    const query = `
      INSERT INTO mobile_searches (mobile_number, click_count, last_updated)
      VALUES ($1, 1, CURRENT_TIMESTAMP)
      ON CONFLICT (mobile_number)
      DO UPDATE SET 
        click_count = mobile_searches.click_count + 1,
        last_updated = CURRENT_TIMESTAMP
      RETURNING *
    `;

    const result = await pool.query(query, [mobileNumber]);
    
    res.json({
      success: true,
      data: result.rows[0]
    });

  } catch (error) {
    console.error('Track search error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Admin route to view all searches
app.get('/api/admin/searches', async (req, res) => {
  try {
    const { secret } = req.query;
    
    if (secret !== process.env.ADMIN_SECRET) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const query = `
      SELECT 
        id,
        mobile_number,
        click_count,
        last_updated
      FROM mobile_searches 
      ORDER BY last_updated DESC
    `;

    const result = await pool.query(query);
    
    res.json({
      success: true,
      data: result.rows,
      total: result.rows.length
    });

  } catch (error) {
    console.error('Admin searches error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// Error handling middleware
app.use((error, req, res, next) => {
  console.error('Unhandled error:', error);
  res.status(500).json({ error: 'Internal server error' });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

app.listen(PORT, () => {
  console.log(`SKS API Server running on port ${PORT}`);
});