import express from 'express';
import path from 'path';
import { earnRouter } from './routes/earn';
import { refundRouter } from './routes/refund';
import { burnRouter } from './routes/burn';
import { membersRouter } from './routes/members';
import { campaignsRouter } from './routes/campaigns';
import { adjustmentsRouter } from './routes/adjustments';
import { reportsRouter } from './routes/reports';

const app = express();
const PORT = parseInt(process.env.PORT || '3000', 10);

// Middleware
app.use(express.json());

// Serve static files for the customer-service UI
app.use(express.static(path.join(__dirname, '..', 'public')));

// API routes
app.use('/api/earn', earnRouter);
app.use('/api/refund', refundRouter);
app.use('/api/burn', burnRouter);
app.use('/api/members', membersRouter);
app.use('/api/campaigns', campaignsRouter);
app.use('/api/adjustments', adjustmentsRouter);
app.use('/api/reports', reportsRouter);

// Health check
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', service: 'pointhub' });
});

app.listen(PORT, () => {
  console.log(`PointHub listening on port ${PORT}`);
});

export default app;
