const express = require('express');
const axios = require('axios');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Example: /positions?satelliteId=25544&lat=-27.47&lon=153.03&alt=0
app.get('/positions', async (req, res) => {
    const { satelliteId, lat, lon, alt } = req.query;
    const apiKey = process.env.N2YO_API_KEY;

    if (!satelliteId || !lat || !lon || !alt) {
        return res.status(400).json({ error: "Missing query parameters" });
    }

    try {
        const response = await axios.get(`https://api.n2yo.com/rest/v1/satellite/positions/${satelliteId}/${lat}/${lon}/${alt}/1/&apiKey=${apiKey}`);
        res.json(response.data);
    } catch (err) {
        console.error(err.message);
        res.status(500).json({ error: "Failed to fetch satellite data" });
    }
});

app.listen(PORT, () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
});
