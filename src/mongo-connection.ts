import mongoose from 'mongoose';
import { MONGO_URI } from './config/env';

const uri: string = MONGO_URI;


const mongoConnection = mongoose.connect(uri, {
}).then(() => {
  console.log('Connected to MongoDB');
}).catch((err) => {
  console.error('Connection error to MongoDB:', err);
});

export default mongoConnection;

