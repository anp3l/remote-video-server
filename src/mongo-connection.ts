import mongoose from 'mongoose';
import { MONGO_URI } from './server.settings';

const mongoConnection = mongoose.connect(MONGO_URI, {
}).then(() => {
  console.log('Connesso a MongoDB');
}).catch((err) => {
  console.error('Errore connessione MongoDB:', err);
});

export default mongoConnection;

