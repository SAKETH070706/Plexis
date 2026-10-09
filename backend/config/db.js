const mongoose = require('mongoose');

let isListenersAttached = false;

const connectDB = async () => {
  try {
    const isTest = process.env.NODE_ENV === 'test';
    let uri = process.env.MONGO_URI || 'mongodb://localhost:27017/crm';
    if (isTest) {
      uri = process.env.MONGO_URI_TEST || (
        process.env.MONGO_URI
          ? process.env.MONGO_URI.replace('/crm?', '/crm_test?').replace(/\/crm$/, '/crm_test')
          : 'mongodb://localhost:27017/crm_test'
      );
    }

    if (!isListenersAttached) {
      mongoose.connection.on('error', (err) => {
        console.error('[MongoDB Connection Runtime Error]:', err.message);
      });
      mongoose.connection.on('disconnected', () => {
        if (process.env.NODE_ENV !== 'test') {
          console.warn('[MongoDB Notice]: Database connection lost. Reconnecting...');
        }
      });
      isListenersAttached = true;
    }

    if (mongoose.connection.readyState === 0) {
      await mongoose.connect(uri, {
        maxPoolSize: isTest ? 10 : 50,
        minPoolSize: isTest ? 1 : 5,
        serverSelectionTimeoutMS: 5000,
        socketTimeoutMS: 45000,
      });
      console.log(`MongoDB connected (${isTest ? 'TEST DB: ' + mongoose.connection.name : 'DEV/PROD DB'})`);
    }
  } catch (err) {
    console.error('[MongoDB Connection Fatal Error]:', err.message);
    process.exit(1);
  }
};

module.exports = connectDB;