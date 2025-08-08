const axios = require('axios');

exports.getPositions = async (req, res) => {
    const { satelliteId, lat, lon, alt } = req.query;
    const apiKey = process.env.N2YO_API_KEY;

    if (!satelliteId || !lat || !lon || !alt) {
        return res.status(400).json({ error: "Missing query parameters" });
    }

    try {
        const url = `https://api.n2yo.com/rest/v1/satellite/positions/${satelliteId}/${lat}/${lon}/${alt}/1/&apiKey=${apiKey}`;
        const { data } = await axios.get(url);
        res.json(data);
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch satellite data' });
    }
};
