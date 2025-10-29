const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { pool, initDatabase } = require('./database');
const { swaggerUi, specs } = require('./swagger');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3001;

// Security middleware
app.use(helmet());
app.use(cors({
  origin: ['http://localhost:5173', 'http://localhost:3000', 'https://sivakundalini.org/'],
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

// Swagger documentation
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(specs));

/**
 * @swagger
 * /api/track-search:
 *   post:
 *     summary: Track mobile number search
 *     description: Records or increments the search count for a mobile number
 *     tags: [Tracking]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/TrackSearchRequest'
 *           example:
 *             mobileNumber: "9876543210"
 *     responses:
 *       200:
 *         description: Search tracked successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SuccessResponse'
 *       400:
 *         description: Invalid mobile number
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *             example:
 *               error: "Invalid mobile number"
 *       429:
 *         description: Too many requests
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *             example:
 *               error: "Too many requests from this IP"
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
app.post('/api/track-search', async (req, res) => {
  try {
    const { mobileNumber } = req.body;
    
    if (!mobileNumber || !/^\d{10}$/.test(mobileNumber)) {
      return res.status(400).json({ error: 'Invalid mobile number' });
    }

    await pool.execute(`
      INSERT INTO mobile_searches (mobile_number, click_count)
      VALUES (?, 1)
      ON DUPLICATE KEY UPDATE
      click_count = click_count + 1,
      last_updated = CURRENT_TIMESTAMP
    `, [mobileNumber]);
    
    const [result] = await pool.execute('SELECT * FROM mobile_searches WHERE mobile_number = ?', [mobileNumber]);
    
    res.json({
      success: true,
      data: result[0]
    });

  } catch (error) {
    console.error('Track search error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * @swagger
 * /api/admin/searches:
 *   get:
 *     summary: Get all mobile searches (Admin only)
 *     description: Retrieves all mobile number searches with their click counts
 *     tags: [Admin]
 *     security:
 *       - AdminSecret: []
 *     parameters:
 *       - in: query
 *         name: secret
 *         required: true
 *         schema:
 *           type: string
 *         description: Admin secret key
 *     responses:
 *       200:
 *         description: List of all searches
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/AdminResponse'
 *       401:
 *         description: Unauthorized - Invalid or missing secret
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *             example:
 *               error: "Unauthorized"
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
app.get('/api/admin/searches', async (req, res) => {
  try {
    const { secret } = req.query;
    
    if (secret !== process.env.ADMIN_SECRET) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const [result] = await pool.execute(`
      SELECT 
        id,
        mobile_number,
        click_count,
        last_updated
      FROM mobile_searches 
      ORDER BY last_updated DESC
    `);
    
    res.json({
      success: true,
      data: result,
      total: result.length
    });

  } catch (error) {
    console.error('Admin searches error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * @swagger
 * /health:
 *   get:
 *     summary: Health check endpoint
 *     description: Returns the server status and current timestamp
 *     tags: [Health]
 *     responses:
 *       200:
 *         description: Server is healthy
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/HealthResponse'
 *             example:
 *               status: "OK"
 *               timestamp: "2024-01-15T10:30:00.000Z"
 */
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