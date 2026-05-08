if (!process.env.UPSTASH_REDIS_REST_URL) {
  const path = require('path');
  require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
}

const express = require('express');
const app = express();

const cors = require('cors');
const errorHandler = require('../src/middleware/errorHandler');
const proxy = require('../src/routes/proxy');

const ALLOWED_ORIGINS = [
  'https://krisbelgv.github.io',
  'http://localhost:5500',
  'http://127.0.0.1:5500'
];

app.use(cors({
  origin: function (origin, callback) {
    if (!origin) return callback(null, true);
    
    if (process.env.NODE_ENV !== 'production') {
      return callback(null, true);
    }
    
    if (ALLOWED_ORIGINS.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  }
}));
app.use(express.json());

app.use('/api', proxy);
app.use(errorHandler);

const isProduction = process.env.NODE_ENV === 'production';
if (!isProduction) {
  const port = process.env.PORT || 3000;
  const envName = process.env.NODE_ENV || 'no NODE_ENV set';
  app.listen(port, () => {
    console.log(`[${envName}] Server running on http://localhost:${port}`);
    console.log(`[${envName}] Rate limiting and Upstash: DISABLED`);
  });
} else {
  console.log('[production] Running in Vercel serverless mode');
}

module.exports = app;