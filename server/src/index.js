import 'dotenv/config';
import { createApp } from './app.js';

const port = Number(process.env.PORT) || 4000;
// Only this computer by default. The API has no login yet, so don't expose it
// to the network (set HOST=0.0.0.0 only behind authentication).
const host = process.env.HOST || '127.0.0.1';
createApp().listen(port, host, () => {
  console.log(`ReturnGuard API listening on http://${host}:${port}`);
});
