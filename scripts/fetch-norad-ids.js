// scripts/fetch-norad-ids.js
const https = require('https');
const { parse } = require('csv-parse');

const GROUP = 'active';
const url = `https://celestrak.org/NORAD/elements/gp.php?GROUP=${GROUP}&FORMAT=CSV`;

function fetch(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      if (res.statusCode !== 200) return reject(new Error(`HTTP ${res.statusCode}`));
      let data = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => resolve(data));
    }).on('error', reject);
  });
}

(async () => {
  try {
    const csv = await fetch(url);
    const ids = new Set();

    await new Promise((resolve, reject) => {
      parse(csv, { columns: true, skip_empty_lines: true }, (err, records) => {
        if (err) return reject(err);
        for (const r of records) {
          const id = Number(r.NORAD_CAT_ID);
          if (Number.isFinite(id)) ids.add(id);
        }
        resolve();
      });
    });

    const all = Array.from(ids).sort((a, b) => a - b);
    console.log(`Group: ${GROUP}, IDs: ${all.length}`);
    console.log(all.join(','));
  } catch (e) {
    console.error('Failed:', e.message);
    process.exit(1);
  }
})();
