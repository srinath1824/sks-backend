# SKS API Server

Node.js API server for tracking mobile number searches in the SKS meditation test results system.

## Setup

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Configure environment variables:**
   Update `.env` file with your database credentials:
   ```
   PORT=3001
   DB_HOST=localhost
   DB_PORT=5432
   DB_NAME=sks_database
   DB_USER=postgres
   DB_PASSWORD=your_password
   ADMIN_SECRET=your_admin_secret_key
   ```

3. **Start the server:**
   ```bash
   # Development
   npm run dev
   
   # Production
   npm start
   ```

## API Endpoints

### Track Mobile Search
- **POST** `/api/track-search`
- **Body:** `{ "mobileNumber": "9876543210" }`
- **Response:** `{ "success": true, "data": {...} }`

### Admin View (Protected)
- **GET** `/api/admin/searches?secret=your_admin_secret_key`
- **Response:** `{ "success": true, "data": [...], "total": 10 }`

### Health Check
- **GET** `/health`
- **Response:** `{ "status": "OK", "timestamp": "..." }`

## Database Schema

```sql
CREATE TABLE mobile_searches (
  id SERIAL PRIMARY KEY,
  mobile_number VARCHAR(15) NOT NULL UNIQUE,
  click_count INTEGER DEFAULT 0,
  last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

## Features

- **Rate Limiting:** 100 requests per 15 minutes per IP
- **Security:** Helmet.js for security headers
- **CORS:** Configured for frontend domains
- **Connection Pooling:** PostgreSQL connection pooling
- **Error Handling:** Comprehensive error handling
- **Auto-increment:** Click count auto-increments on duplicate searches

## Usage in Frontend

```javascript
// Track search when user submits
const trackSearch = async (mobileNumber) => {
  try {
    await fetch('http://localhost:3001/api/track-search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mobileNumber })
    });
  } catch (error) {
    console.error('Tracking failed:', error);
  }
};
```