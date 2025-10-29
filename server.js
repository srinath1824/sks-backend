const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { pool, initDatabase } = require('./database');
const { swaggerUi, specs } = require('./swagger');
require('dotenv').config();

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  process.exit(1);
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

const app = express();
const PORT = process.env.PORT || 3001;

// Security middleware
app.use(helmet());
app.use(cors({
  origin: ['http://localhost:5173', 'http://localhost:3000', 'https://sivakundalini.org', 'https://sivakundalini.org/'],
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
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
    
    // Always update mobile_searches table first
    try {
      await pool.execute(`
        INSERT INTO mobile_searches (mobile_number, click_count, name)
        VALUES (?, 1, NULL)
        ON DUPLICATE KEY UPDATE
        click_count = click_count + 1,
        last_updated = CURRENT_TIMESTAMP
      `, [mobileNumber || '']);
    } catch (dbError) {
      console.error('Database tracking error:', dbError);
      // Continue execution even if tracking fails
    }
    
    if (!mobileNumber || !/^\d{10}$/.test(mobileNumber)) {
      return res.status(400).json({ error: 'Invalid mobile number' });
    }

    // Query test_results table
    const [testResult] = await pool.execute('SELECT * FROM test_results WHERE phone = ?', [mobileNumber]);
    
    // Update name if test result found
    if (testResult.length > 0) {
      try {
        await pool.execute(`
          UPDATE mobile_searches 
          SET name = ? 
          WHERE mobile_number = ?
        `, [testResult[0].name, mobileNumber]);
      } catch (updateError) {
        console.error('Name update error:', updateError);
        // Continue execution even if name update fails
      }
    }
    
    if (testResult.length === 0) {
      return res.status(404).json({ error: 'No test result found for this mobile number' });
    }
    
    res.json({
      success: true,
      data: testResult[0]
    });

  } catch (error) {
    console.error('Track search error:', error);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Internal server error' });
    }
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
        name,
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
    if (!res.headersSent) {
      res.status(500).json({ error: 'Internal server error' });
    }
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
  if (!res.headersSent) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Request timeout middleware
app.use((req, res, next) => {
  res.setTimeout(30000, () => {
    console.error('Request timeout:', req.url);
    if (!res.headersSent) {
      res.status(408).json({ error: 'Request timeout' });
    }
  });
  next();
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

const server = app.listen(PORT, () => {
  console.log(`SKS API Server running on port ${PORT}`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully');
  server.close(() => {
    console.log('Process terminated');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('SIGINT received, shutting down gracefully');
  server.close(() => {
    console.log('Process terminated');
    process.exit(0);
  });
});