import express from 'express';
import cors from 'cors';
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import studentRoutes from './routes/studentRoutes';
import { logger } from './services';
import { StudentVerification, Institution, StudentWallet, StudentProfile } from './models';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 4025;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Request logging
app.use((req, res, next) => {
  logger.info(`${req.method} ${req.path}`, {
    ip: req.ip,
    userAgent: req.get('user-agent')
  });
  next();
});

// Routes
app.use('/api/student', studentRoutes);

// Health check
app.get('/health', async (req, res) => {
  const mongoStatus = mongoose.connection.readyState === 1 ? 'connected' : 'disconnected';

  res.json({
    status: 'ok',
    service: 'rez-student-service',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    mongodb: mongoStatus
  });
});

// Ready check
app.get('/health/ready', async (req, res) => {
  try {
    // Check MongoDB connection
    await mongoose.connection.db?.admin().ping();

    // Check collections exist
    const collections = await mongoose.connection.db?.listCollections().toArray();
    const collectionNames = collections?.map(c => c.name) || [];

    const requiredCollections = [
      'studentverifications',
      'institutions',
      'studentwallets',
      'studentprofiles'
    ];

    const missingCollections = requiredCollections.filter(
      c => !collectionNames.includes(c)
    );

    if (missingCollections.length > 0) {
      return res.status(503).json({
        status: 'not_ready',
        missing: missingCollections
      });
    }

    res.json({
      status: 'ready',
      collections: collectionNames.length
    });
  } catch (error) {
    res.status(503).json({
      status: 'error',
      error: 'MongoDB not ready'
    });
  }
});

// Metrics endpoint
app.get('/metrics', async (req, res) => {
  try {
    const [verificationCount, institutionCount, walletCount, profileCount] = await Promise.all([
      StudentVerification.countDocuments(),
      Institution.countDocuments(),
      StudentWallet.countDocuments(),
      StudentProfile.countDocuments()
    ]);

    const verifiedCount = await StudentVerification.countDocuments({ status: 'verified' });

    res.json({
      verifications: verificationCount,
      verifiedStudents: verifiedCount,
      institutions: institutionCount,
      wallets: walletCount,
      profiles: profileCount
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to get metrics' });
  }
});

// Error handling
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  logger.error('Unhandled error', { error: err.message, stack: err.stack });
  res.status(500).json({ error: 'Internal server error' });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// Connect to MongoDB and start server
const startServer = async () => {
  try {
    const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/rez-student';

    logger.info('Connecting to MongoDB...', { uri: MONGODB_URI.replace(/\/\/.*@/, '//<credentials>@') });

    await mongoose.connect(MONGODB_URI);

    logger.info('Connected to MongoDB successfully');

    // Create indexes
    await createIndexes();

    app.listen(PORT, () => {
      logger.info(`Student Service started on port ${PORT}`);
      logger.info(`Health check: http://localhost:${PORT}/health`);
    });
  } catch (error) {
    logger.error('Failed to start server', { error });
    process.exit(1);
  }
};

async function createIndexes() {
  try {
    logger.info('Creating indexes...');

    // Student Verification indexes
    await StudentVerification.collection.createIndex({ userId: 1 });
    await StudentVerification.collection.createIndex({ institutionId: 1 });
    await StudentVerification.collection.createIndex({ status: 1 });
    await StudentVerification.collection.createIndex({ submittedAt: -1 });

    // Institution indexes
    await Institution.collection.createIndex({ name: 1 }, { unique: true });
    await Institution.collection.createIndex({ domain: 1 }, { sparse: true });
    await Institution.collection.createIndex({ 'address.city': 1 });
    await Institution.collection.createIndex({ 'address.coordinates': '2dsphere' });

    // Student Wallet indexes
    await StudentWallet.collection.createIndex({ userId: 1 }, { unique: true });
    await StudentWallet.collection.createIndex({ institutionId: 1 });

    // Student Profile indexes
    await StudentProfile.collection.createIndex({ userId: 1 }, { unique: true });
    await StudentProfile.collection.createIndex({ referralCode: 1 }, { unique: true });
    await StudentProfile.collection.createIndex({ institutionId: 1, currentCoins: -1 });

    logger.info('Indexes created successfully');
  } catch (error) {
    logger.error('Failed to create indexes', { error });
  }
}

// Handle graceful shutdown
process.on('SIGTERM', async () => {
  logger.info('SIGTERM received, shutting down...');
  await mongoose.connection.close();
  process.exit(0);
});

process.on('SIGINT', async () => {
  logger.info('SIGINT received, shutting down...');
  await mongoose.connection.close();
  process.exit(0);
});

// Start the server
startServer();
