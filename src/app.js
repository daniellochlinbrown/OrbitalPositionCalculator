const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const routes = require('./routes');

const app = express();

app.use(cors());
app.use(express.json());

app.use(express.static(path.join(__dirname, '..', 'public')));

app.use('/', routes);

module.exports = app;
