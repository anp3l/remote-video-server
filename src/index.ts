import express from 'express';
import cors from 'cors';
import bodyParser from 'body-parser';
import path from 'path';


import mongoConnection from './mongo-connection';
import { videoRoutes } from './routes/videos.api';
import { SERVER_PORT } from './server.settings';

const app = express();

app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

mongoConnection.then(() => {
  console.log('Connected to MongoDB');
}).catch((err) => {
  console.error('MongoDB connection error:', err);
});

app.use(videoRoutes);

app.listen(SERVER_PORT, () => {
  console.log(`Server running on port ${SERVER_PORT}`);
});
