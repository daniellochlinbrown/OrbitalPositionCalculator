// src/app.js
const express = require('express');
const cors = require('cors');
const path = require('path');
const cookieParser = require('cookie-parser');
require('dotenv').config();

const { authRouter } = require('./auth/auth');
const routes = require('./routes');
const orbits = require('./controllers/orbitsController');


const app = express();

if (process.env.TRUST_PROXY === '1') app.set('trust proxy', 1);

// CORS
app.use(
  cors({
    origin: true,          
    credentials: true,     
  })
);
app.use(cookieParser());
app.use(express.json());

app.use(express.static(path.join(__dirname, '..', 'public')));

// -------------------- Auth routes --------------------
app.use('/auth', authRouter);

// -------------------- API routes --------------------
app.get('/now-db/:satid', orbits.getNowDbOnly);
app.post('/simulate-db', orbits.simulateDbOnly);

// Default orbit endpoints
app.get('/now/:satid', orbits.getNow);
app.post('/simulate', orbits.simulate);

app.use('/', routes);

// -------------------- Health check --------------------
app.get('/healthz', (_req, res) => res.json({ ok: true }));

module.exports = app;
