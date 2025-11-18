import mongoose from 'mongoose';
import config from 'config';

const uri: string = config.get("mongo");

const mongoConnection = mongoose.connect(uri, {
}).then(() => {
  console.log('Connected to MongoDB');
}).catch((err) => {
  console.error('Connection error to MongoDB:', err);
});

export default mongoConnection;

