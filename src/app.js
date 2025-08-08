const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const routes = require('./routes');

const app = express();

app.use(cors());
app.use(express.json());

// Serve static frontend from /public at project root
app.use(express.static(path.join(__dirname, '..', 'public')));

// Mount API routes AFTER static
app.use('/', routes);

// (Remove any router.get('/') that sends "Orbital Position API is running.")
module.exports = app;
