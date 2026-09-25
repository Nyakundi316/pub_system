// Vercel entry: the whole Express app as one serverless function. No Socket.IO
// here — functions can't hold connections open; src/index.ts is the long-lived
// server for docker/VPS hosting.
import { createApp } from '../src/app';

export default createApp();
