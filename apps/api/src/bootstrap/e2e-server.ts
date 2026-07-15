import { createServer } from 'node:http';
import pino from 'pino';
import { createApp } from '../http/app.js';

const app=createApp({config:{nodeEnv:'test',deployEnv:'test',releaseSha:'e2e',databaseUrl:'postgres://unused',sessionSecret:'e2e-session-secret-must-be-at-least-32-characters',port:5100,cloudinary:undefined,push:undefined},logger:pino({level:'silent'})});
const server=createServer(app);server.listen(5100,'127.0.0.1');
const close=()=>server.close(()=>process.exit(0));process.once('SIGINT',close);process.once('SIGTERM',close);
