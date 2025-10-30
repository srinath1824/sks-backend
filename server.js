const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { pool, initDatabase } = require('./database');
const { swaggerUi, specs } = require('./swagger');
require('dotenv').config();

// Handle uncaught exceptions - log but don't exit
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  // Don't exit in production, let Railway handle restarts
});

// Handle unhandled promise rejections - log but don't exit
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  // Don't exit in production, let Railway handle restarts
});

// Handle memory warnings
process.on('warning', (warning) => {
  console.warn('Warning:', warning.name, warning.message);
});

const app = express();
const PORT = process.env.PORT || 3002;

// CORS must be before other middleware
app.use(cors({
  origin: '*',
  credentials: false,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  preflightContinue: false,
  optionsSuccessStatus: 200
}));

// Security middleware
app.use(helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" }
}));

// Rate limiting for high load (skip for OPTIONS)
const limiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 1000, // 1000 requests per minute per IP
  message: { error: 'Too many requests, please try again later' },
  skip: (req) => req.method === 'OPTIONS',
  standardHeaders: true,
  legacyHeaders: false
});
app.use(limiter);

// Body parser
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Initialize database
initDatabase();

// Swagger documentation
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(specs));

/**
 * @swagger
 * /api/search-result:
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
app.post('/api/search-result', async (req, res) => {
  try {
    const { mobileNumber } = req.body;
    
    // Only track actual POST requests, not OPTIONS
    if (req.method === 'POST' && mobileNumber) {
      try {
        await pool.execute(`
          INSERT INTO mobile_searches (mobile_number, click_count, name)
          VALUES (?, 1, NULL)
          ON DUPLICATE KEY UPDATE
          click_count = click_count + 1,
          last_updated = CURRENT_TIMESTAMP
        `, [mobileNumber]);
      } catch (dbError) {
        console.error('Database tracking error:', dbError);
        // Continue execution even if tracking fails
      }
    }
    
    if (!mobileNumber || !/^\d{10}$/.test(mobileNumber)) {
      return res.status(400).json({ error: 'Invalid mobile number' });
    }

    // Query test_results table with error handling
    let testResult = [];
    try {
      [testResult] = await pool.execute('SELECT * FROM test_results WHERE phone = ?', [mobileNumber]);
    } catch (dbError) {
      console.error('Database query error:', dbError);
      return res.status(500).json({ error: 'Database temporarily unavailable' });
    }
    
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
    
    const response = {
      success: true,
      data: testResult[0]
    };
    
    // Only add whatsappLink if result is 'Selected'
    if (testResult[0].result === 'Selected') {
      response.whatsappLink = process.env.WHATSAPP_LINK;
    }
    
    res.json(response);

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

    let result = [];
    try {
      [result] = await pool.execute(`
        SELECT 
          id,
          mobile_number,
          click_count,
          name,
          last_updated
        FROM mobile_searches 
        ORDER BY last_updated DESC
      `);
    } catch (dbError) {
      console.error('Admin query error:', dbError);
      return res.status(500).json({ error: 'Database temporarily unavailable' });
    }
    
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

// Handle preflight requests
app.options('*', (req, res) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET,PUT,POST,DELETE,OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.sendStatus(200);
});

// Request timeout middleware
app.use((req, res, next) => {
  if (req.method === 'OPTIONS') return next();
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

// Graceful shutdown for Railway
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully');
  server.close(() => {
    console.log('Server closed');
    // Let Railway handle the process termination
  });
});

process.on('SIGINT', () => {
  console.log('SIGINT received, shutting down gracefully');
  server.close(() => {
    console.log('Server closed');
    // Let Railway handle the process termination
  });
});