const axios = require('axios');

const API_KEY = process.env.N2YO_API_KEY;
const base = 'https://api.n2yo.com/rest/v1/satellite';

const badReq = (res, msg) => res.status(400).json({ error: msg });

exports.getVisualPasses = async (req, res) => {
  const satid = req.query.satid || req.query.satelliteId;
  const lat = req.query.lat ?? req.query.latitude;
  const lon = req.query.lon ?? req.query.longitude;
  const alt = req.query.alt ?? req.query.altitude; // meters
  const days = req.query.days ?? 10;
  const minVisibility = req.query.minVisibility ?? 1;

  if (satid == null || lat == null || lon == null || alt == null) {
    return res.status(400).json({ error: 'satid (or satelliteId), lat, lon, alt required' });
  }

  try {
    const url = `${base}/visualpasses/${satid}/${lat}/${lon}/${alt}/${days}/${minVisibility}/&apiKey=${API_KEY}`;
    const { data } = await axios.get(url);
    res.json(data);
  } catch (e) {
    console.error(e.message);
    res.status(500).json({ error: 'Failed to fetch visual passes' });
  }
};

exports.getRadioPasses = async (req, res) => {
  const { satid, lat, lon, alt, days = 10, minElevation = 10 } = req.query;
  if (!satid || !lat || !lon || alt === undefined) return badReq(res, 'satid, lat, lon, alt required');

  try {
    const url = `${base}/radiopasses/${satid}/${lat}/${lon}/${alt}/${days}/${minElevation}/&apiKey=${API_KEY}`;
    const { data } = await axios.get(url);
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: 'Failed to fetch radio passes' });
  }
};

exports.getAbove = async (req, res) => {
  const { lat, lon, alt, radius = 90, category = 0 } = req.query;
  if (lat === undefined || lon === undefined || alt === undefined) return badReq(res, 'lat, lon, alt required');

  try {
    const url = `${base}/above/${lat}/${lon}/${alt}/${radius}/${category}/&apiKey=${API_KEY}`;
    const { data } = await axios.get(url);
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: 'Failed to fetch satellites above' });
  }
};
