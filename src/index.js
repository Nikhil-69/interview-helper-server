// Local/long-lived server entry. On Vercel the app is served via api/index.js instead.
import { config } from './config.js';
import app from './app.js';

app.listen(config.port, () => {
  console.log(`interview-helper-server listening on http://localhost:${config.port}`);
  console.log(`admin panel at http://localhost:${config.port}/admin`);
});
