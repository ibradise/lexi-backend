import app from './app';
import { env } from './config/env';
import { sweepPendingWords } from './services/aiQueue.service';

const server = app.listen(env.PORT, () => {
  console.log(`Server running on port ${env.PORT}`);
  void sweepPendingWords();
});

process.on('SIGTERM', () => {
  server.close(() => {
    console.log('Server closed');
  });
});
