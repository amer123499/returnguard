import 'dotenv/config';
import { createApp } from './app.js';

const port = Number(process.env.PORT) || 4000;
// Keep local development loopback-only; production platforms need a public bind.
const host = process.env.HOST || (process.env.NODE_ENV === 'production' ? '0.0.0.0' : '127.0.0.1');
createApp().listen(port, host, () => {
  console.log(`ReturnGuard API listening on http://${host}:${port}`);
});
