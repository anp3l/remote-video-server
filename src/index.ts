import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import bodyParser from 'body-parser';
import path from 'path';
import config from 'config';

import mongoConnection from './mongo-connection';
import { routeVideos } from './routes/videos.api';

const app = express();

// === PROCESS ERROR HANDLERS ===
process.on('unhandledRejection', (reason, promise) => {
  console.error('=== UNHANDLED REJECTION ===');
  console.error('Reason:', reason);
  console.error('Promise:', promise);
  console.error('===========================');
});

process.on('uncaughtException', (error) => {
  console.error('=== UNCAUGHT EXCEPTION ===');
  console.error('Error:', error);
  console.error('Stack:', error.stack);
  console.error('==========================');
  process.exit(1);
});

app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

mongoConnection.then(() => {
  console.log('Connected to MongoDB');
}).catch((err) => {
  console.error('MongoDB connection error:', err);
});

app.use(routeVideos);

// === GLOBAL ERROR HANDLER ===
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('=== GLOBAL ERROR HANDLER ===');
  console.error('URL:', req.method, req.url);
  console.error('Error:', err);
  console.error('Message:', err.message);
  console.error('Stack:', err.stack);
  console.error('============================');
  
  res.status(err.status || 500).json({
    error: err.message || 'Internal Server Error',
    details: process.env.NODE_ENV === 'development' ? err.stack : undefined
  });
});

app.listen(config.get("port"), () => {
  console.log(`Server running on port ${config.get("port")}`);
});
