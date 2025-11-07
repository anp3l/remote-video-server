import express from 'express';
import cors from 'cors';
import bodyParser from 'body-parser';
import path from 'path';
import config from 'config';


import mongoConnection from './mongo-connection';
import { routeVideos } from './routes/videos.api';

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

app.use(routeVideos);

app.listen(config.get("port"), () => {
  console.log(`Server running on port ${config.get("port")}`);
});
