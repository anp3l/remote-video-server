import './config/env';
import { PORT, NODE_ENV } from './config/env';
import express from 'express';
import cors from 'cors';
import path from 'path';
import config from 'config';
import mongoConnection from './mongo-connection';
import videoRoutes from './routes/video.routes';
import swaggerUi from 'swagger-ui-express';
import swaggerJsDoc from 'swagger-jsdoc';

const app = express();

const port = PORT || config.get("port")

const swaggerOptions = {
  swaggerDefinition: {
    openapi: '3.0.0',
    info: {
      title: 'Video Library API',
      version: '1.0.0',
      description: 'API for managing video content. Requires JWT token from Auth Server.'
    },
    servers: [
      {
        url: 'http://localhost:' + port
      }
    ],
    tags: [
      {
        name: 'Videos',
        description: 'Endpoints for video management'
      }
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description: 'Paste here the RSA-signed JWT token obtained from the Auth Server (port 4000)'
        }
      }
    },
    security: [
      {
        bearerAuth: []
      }
    ]
  },
  apis: [
    './src/routes/*.ts',
    './src/routes/**/*.ts'
  ]
};

const swaggerDocs = swaggerJsDoc(swaggerOptions);

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

// === MIDDLEWARE ===
app.use(cors());
app.use(express.json());

app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// === SWAGGER UI ===
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDocs, {
  explorer: true,
  customSiteTitle: "Video Library API Docs"
}));

// === DB CONNECTION ===
mongoConnection.then(() => {
  console.log('Connected to MongoDB (Video Metadata)');
}).catch((err) => {
  console.error('MongoDB connection error:', err);
});

// === ROUTES ===
app.use(videoRoutes);

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
    details: NODE_ENV === 'development' ? err.stack : undefined
  });
});

// === START SERVER ===
app.listen(port, () => {
  console.log(`🎬 Video Server running on port ${port}`);
  console.log(`📄 Swagger Docs available at http://localhost:${port}/api-docs`);
});
