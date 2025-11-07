import mongoose from 'mongoose';
import config from 'config';

const uri: string = config.get("mongo");

const mongoConnection = mongoose.connect(uri, {
}).then(() => {
  console.log('Connesso a MongoDB');
}).catch((err) => {
  console.error('Errore connessione MongoDB:', err);
});

export default mongoConnection;

