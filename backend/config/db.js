const mongoose = require('mongoose');

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
    if (mongoose.connection.readyState === 0) {
      await mongoose.connect(uri);
      console.log(`MongoDB connected (${isTest ? 'TEST DB: ' + mongoose.connection.name : 'DEV/PROD DB'})`);
    }
  } catch (err) {
    console.log(err);
    process.exit(1);
  }
};

module.exports = connectDB;