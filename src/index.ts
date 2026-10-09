import app from './app';
import { env } from './config/env';

const server = app.listen(env.PORT, () => {
  console.log(`Server running on port ${env.PORT}`);
});

process.on('SIGTERM', () => {
  server.close(() => {
    console.log('Server closed');
  });
});
