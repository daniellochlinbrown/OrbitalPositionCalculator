// src/app.js
const express = require('express');
const cors = require('cors');
const path = require('path');
const cookieParser = require('cookie-parser');
require('dotenv').config();

const { authRouter, requireAuth } = require('./auth/auth');
const routes = require('./routes');                          

const app = express();

if (process.env.TRUST_PROXY === '1') app.set('trust proxy', 1);

app.use(cors({
  origin: true,        
  credentials: true
}));

app.use(cookieParser());
app.use(express.json());

app.use(express.static(path.join(__dirname, '..', 'public')));

// ---- Auth ----
app.use('/auth', authRouter);

// ---- Protected routes ----
app.use('/', routes);

// health check
app.get('/healthz', (_req, res) => res.json({ ok: true }));

module.exports = app;
