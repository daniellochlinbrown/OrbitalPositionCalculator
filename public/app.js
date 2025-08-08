// --------- helpers ----------
const $  = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

const out = $("#out");
const statusEl = $("#status");

function setStatus(msg) {
  if (statusEl) statusEl.textContent = msg;
  console.log("[status]", msg);
}
function show(obj) {
  if (!out) return console.log("[out]", obj);
  out.textContent = typeof obj === "string" ? obj : JSON.stringify(obj, null, 2);
}
function q(id) {
  const el = document.getElementById(id);
  return el ? el.value.trim() : "";
}
const API = (path) => (path.startsWith("http") ? path : `${path}`);

async function fetchJSON(url, opts) {
  const res = await fetch(url, opts);
  let data = null;
  try { data = await res.json(); } catch {}
  if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
  return data;
}

// --------- existing route callers (kept) ----------
async function callPositions() {
  try {
    setStatus("Fetching /positions …");
    const satid   = q("pos-satid");
    const lat     = q("pos-lat");
    const lon     = q("pos-lon");
    const alt     = q("pos-alt");
    const samples = q("pos-samples") || "1";
    const url = API(`/positions?satelliteId=${encodeURIComponent(satid)}&lat=${lat}&lon=${lon}&alt=${alt}&samples=${samples}`);
    const data = await fetchJSON(url);
    show(data);
    setStatus("Done");
  } catch (e) { setStatus(e.message); show({ error: e.message }); }
}

async function callVisualPasses() {
  try {
    setStatus("Fetching /visualpasses …");
    const params = new URLSearchParams({
      satid: q("vis-satid"),
      lat: q("vis-lat"),
      lon: q("vis-lon"),
      alt: q("vis-alt"),
      days: q("vis-days"),
      minVisibility: q("vis-min")
    });
    const data = await fetchJSON(API(`/visualpasses?${params.toString()}`));
    show(data);
    setStatus("Done");
  } catch (e) { setStatus(e.message); show({ error: e.message }); }
}

async function callRadioPasses() {
  try {
    setStatus("Fetching /radiopasses …");
    const params = new URLSearchParams({
      satid: q("rad-satid"),
      lat: q("rad-lat"),
      lon: q("rad-lon"),
      alt: q("rad-alt"),
      days: q("rad-days"),
      minElevation: q("rad-minel")
    });
    const data = await fetchJSON(API(`/radiopasses?${params.toString()}`));
    show(data);
    setStatus("Done");
  } catch (e) { setStatus(e.message); show({ error: e.message }); }
}

async function callAbove() {
  try {
    setStatus("Fetching /above …");
    const params = new URLSearchParams({
      lat: q("abv-lat"),
      lon: q("abv-lon"),
      alt: q("abv-alt"),
      radius: q("abv-radius"),
      category: q("abv-cat")
    });
    const data = await fetchJSON(API(`/above?${params.toString()}`));
    show(data);
    setStatus("Done");
  } catch (e) { setStatus(e.message); show({ error: e.message }); }
}

async function callSimulate() {
  try {
    setStatus("Simulating orbit …");
    const body = {
      satid: q("sim-satid") || undefined,
      tle1: q("sim-tle1") || undefined,
      tle2: q("sim-tle2") || undefined,
      startUtc: q("sim-start") || undefined,
      durationSec: Number(q("sim-duration") || 120),
      stepSec: Number(q("sim-step") || 2),
    };
    const data = await fetchJSON(API("/orbits/simulate"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    show(data);
    setStatus("Done");
  } catch (e) { setStatus(e.message); show({ error: e.message }); }
}

const satellites = [
  { name: "ISS (ZARYA)", id: 25544 },
  { name: "Hubble Space Telescope", id: 20580 },
  { name: "NOAA 15", id: 25338 },
  { name: "Terra (EOS AM-1)", id: 25994 },
  { name: "Aqua (EOS PM-1)", id: 27424 },
  { name: "Landsat 8", id: 39084 },
  { name: "Sentinel-2A", id: 40697 },
];

function populateSatelliteList() {
  const satList = document.getElementById("satList");
  satellites.forEach(sat => {
    const li = document.createElement("li");
    li.textContent = `${sat.name} (${sat.id})`;
    li.style.cursor = "pointer";
    li.style.padding = "5px 0";
    li.addEventListener("click", () => {
      const satidInput = document.getElementById("pos-satid");
      if (satidInput) {
        satidInput.value = sat.id;
      }
    });
    satList.appendChild(li);
  });
}

document.addEventListener("DOMContentLoaded", populateSatelliteList);


// --------- simple UI wiring (from our clean frontend) ----------
function switchSection(name) {
  $$(".section").forEach(s => s.classList.remove("active"));
  const target = document.getElementById(name);
  if (target) target.classList.add("active");
}

document.addEventListener("DOMContentLoaded", () => {
  // Top nav (if present)
  $$(".navbtn").forEach(btn => btn.addEventListener("click", () => switchSection(btn.dataset.section)));

  // Simple UI buttons
  const dry = $("#btn-dry-run");
  if (dry) dry.addEventListener("click", () => {
    const satid = $("#satid")?.value?.trim() || "";
    const lat   = $("#lat")?.value?.trim() || "";
    const lon   = $("#lon")?.value?.trim() || "";
    const alt   = $("#alt")?.value?.trim() || "";
    setStatus("Dry run complete (no API calls).");
    show({ message: "Inputs captured.", satid, observer: { lat, lon, alt } });
  });

  const clear = $("#btn-clear");
  if (clear) clear.addEventListener("click", () => {
    setStatus("Idle");
    show("// output will appear here");
  });

  // API tester buttons (only bind if those controls exist on the page)
  $("#btn-positions")     && $("#btn-positions").addEventListener("click", callPositions);
  $("#btn-visualpasses")  && $("#btn-visualpasses").addEventListener("click", callVisualPasses);
  $("#btn-radiopasses")   && $("#btn-radiopasses").addEventListener("click", callRadioPasses);
  $("#btn-above")         && $("#btn-above").addEventListener("click", callAbove);
  $("#btn-simulate")      && $("#btn-simulate").addEventListener("click", callSimulate);
});
