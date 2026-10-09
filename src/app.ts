import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import { errorHandler } from './middleware/errorHandler';
import vocabularyRoutes from './routes/vocabulary.routes';

const app = express();

app.use(helmet());
app.use(cors());
app.use(morgan('dev'));
app.use(express.json());

app.get('/health', (_req, res) => {
  res.json({ success: true, data: { status: 'ok' }, error: null, meta: null });
});

app.use('/api/vocabulary', vocabularyRoutes);

app.use(errorHandler);

export default app;
