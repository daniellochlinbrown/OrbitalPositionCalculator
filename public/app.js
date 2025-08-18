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

// Auth
let ACCESS_TOKEN = ""; 
function setAccessToken(t) {
  ACCESS_TOKEN = t || "";
  const loggedOut = $("#auth-when-logged-out");
  const loggedIn  = $("#auth-when-logged-in");
  if (loggedOut && loggedIn) {
    const on = Boolean(ACCESS_TOKEN);
    loggedOut.style.display = on ? "none" : "";
    loggedIn.style.display  = on ? "" : "none";
  }
}

// ----- Register drawer helpers -----
function openRegisterDrawer(prefillEmail = "") {
  const ov = $("#reg-overlay"), dr = $("#reg-drawer");
  if (!ov || !dr) return;
  if (prefillEmail) $("#reg-email").value = prefillEmail;
  $("#reg-password").value = "";
  const err = $("#reg-error"); if (err) { err.style.display = "none"; err.textContent = ""; }
  ov.hidden = false;
  dr.hidden = false;
  requestAnimationFrame(() => dr.setAttribute("open", ""));
  setTimeout(() => $("#reg-email")?.focus(), 50);
}
function closeRegisterDrawer() {
  const ov = $("#reg-overlay"), dr = $("#reg-drawer");
  if (!ov || !dr) return;
  dr.removeAttribute("open");
  setTimeout(() => { ov.hidden = true; dr.hidden = true; }, 200);
}
async function doRegister() {
  const email = ($("#reg-email")?.value || "").trim().toLowerCase();
  const password = $("#reg-password")?.value || "";
  const err = $("#reg-error");
  const showErr = (msg) => { if (err) { err.textContent = msg; err.style.display = ""; } setStatus(msg); };

  if (!email || !password) return showErr("Enter email and password.");
  if (password.length < 8) return showErr("Password must be at least 8 characters.");

  try {
    setStatus("Registering …");
    const res = await fetch(API("/auth/register"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ email, password })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data?.error || `Register failed (${res.status})`);
    setAccessToken(data.accessToken);
    const u = $("#auth-user"); if (u) u.textContent = data?.user?.email || email;
    setStatus("Registered & logged in.");
    closeRegisterDrawer();
  } catch (e) {
    showErr(e.message || "Register failed");
  }
}


async function apiFetch(url, opts = {}) {
  const headers = new Headers(opts.headers || {});
  if (ACCESS_TOKEN) headers.set("Authorization", `Bearer ${ACCESS_TOKEN}`);
  const res = await fetch(url, { ...opts, headers, credentials: "include" });

  if (res.status === 401) {
    const r = await fetch(API("/auth/refresh"), { method: "POST", credentials: "include" });
    if (r.ok) {
      const { accessToken } = await r.json();
      setAccessToken(accessToken);
      const retryHeaders = new Headers(opts.headers || {});
      if (accessToken) retryHeaders.set("Authorization", `Bearer ${accessToken}`);
      return fetch(url, { ...opts, headers: retryHeaders, credentials: "include" });
    }
  }
  return res;
}

async function fetchJSON(url, opts) {
  const res = await apiFetch(url, opts);
  let data = null;
  try { data = await res.json(); } catch {}
  if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
  return data;
}

async function login(email, password) {
  const data = await fetchJSON(API("/auth/login"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
    credentials: "include",
  });
  setAccessToken(data.accessToken);
  const u = $("#auth-user");
  if (u) u.textContent = data?.user?.email || email;
  return data;
}
async function logout() {
  try { await fetchJSON(API("/auth/logout"), { method: "POST", credentials: "include" }); } catch {}
  setAccessToken("");
}


// ---------- 3D + markers ----------
function addMarker(latDeg, lonDeg, altKm, color = 0xffcc00) {
  if (!THREE_SCENE) return;
  const { orbitGroup, R } = THREE_SCENE;
  const pos = llaToCartesian(latDeg, lonDeg, altKm || 0, R);

  const dotGeom = new THREE.SphereGeometry(0.012, 12, 12);
  const dotMat  = new THREE.MeshBasicMaterial({ color });
  const dot     = new THREE.Mesh(dotGeom, dotMat);
  dot.position.copy(pos);

  const lineGeom = new THREE.BufferGeometry().setFromPoints([ new THREE.Vector3(0,0,0), pos ]);
  const lineMat  = new THREE.LineBasicMaterial({ linewidth: 1, color, transparent: true, opacity: 0.5 });
  const line     = new THREE.Line(lineGeom, lineMat);

  orbitGroup.add(line);
  orbitGroup.add(dot);
  return dot;
}

// --------- API callers ----------
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

async function callNow(satid) {
  try {
    setStatus(`Fetching /now/${satid} …`);
    const data = await fetchJSON(API(`/now/${satid}`));
    show(data);
    setStatus("Done");
  } catch (e) { setStatus(e.message); show({ error: e.message }); }
}

// --------- Simulation ----------
function getSimSatId() {
  const simId  = document.getElementById("sim-satid")?.value?.trim();
  const dashId = document.getElementById("satid")?.value?.trim();
  return simId || dashId || "";
}

async function callSimulateQuick(satid, durationSec = 600, stepSec = 1) {
  try {
    if (!satid) throw new Error("satid is required (fill Simulation or Dashboard Satellite field)");
    setStatus(`Simulating ${durationSec}s @${stepSec}s for ${satid} …`);
    console.log("[simulate] POST /simulate", { satid, durationSec, stepSec });

    const data = await fetchJSON(API(`/simulate`), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ satid, durationSec, stepSec })
    });

    console.log("[simulate] response", data);
    show(data);
    if (data?.points?.length) {
      drawOrbit(data);
    }
    setStatus("Done");
  } catch (e) {
    console.error("[simulate] error", e);
    setStatus(e.message);
    show({ error: e.message });
  }
}

async function onSimulateClick() {
  const satid       = getSimSatId();
  const durationSec = Number(document.getElementById("sim-duration")?.value || 600);
  const stepSec     = Number(document.getElementById("sim-step")?.value || 1);
  console.log("[simulate] click", { satid, durationSec, stepSec });
  await callSimulateQuick(satid, durationSec, stepSec);
}

// --------- Sidebar satellites ----------
const satellites = [
  { name: "ISS (ZARYA)", id: 25544 },
  { name: "Hubble Space Telescope", id: 20580 },
  { name: "NOAA 15", id: 25338 },
  { name: "Terra (EOS AM-1)", id: 25994 },
  { name: "Aqua (EOS PM-1)", id: 27424 },
  { name: "Landsat 8", id: 39084 },
  { name: "Sentinel-2A", id: 40697 },
];

function fillSatInputs(id) {
  ["satid","pos-satid","vis-satid","rad-satid","sim-satid"].forEach(k => {
    const el = document.getElementById(k);
    if (el) el.value = id;
  });
}

function renderSidebar() {
  const ul = document.getElementById("satList");
  if (!ul) return;

  ul.innerHTML = "";
  satellites.forEach(s => {
    const li = document.createElement("li");
    li.className = "sat-item";

    const name = document.createElement("div");
    name.className = "name";
    name.textContent = `${s.name} (${s.id})`;
    name.title = "Click to fetch current position";
    name.addEventListener("click", async () => {
      fillSatInputs(s.id);
      await callNow(s.id);
    });

    const actions = document.createElement("div");
    actions.className = "mini";

    const simBtn = document.createElement("button");
    simBtn.className = "mini-btn";
    simBtn.textContent = "Sim 10m";
    simBtn.title = "Simulate 10 minutes @ 1s";
    simBtn.addEventListener("click", async (e) => {
      e.stopPropagation();
      fillSatInputs(s.id);
      await callSimulateQuick(s.id); // 600s @ 1s
    });

    actions.appendChild(simBtn);
    li.appendChild(name);
    li.appendChild(actions);
    ul.appendChild(li);
  });
}

// --------- Sections / Nav ----------
$$(".topbar .nav .navbtn").forEach(btn => {
  const section = btn.dataset.section;
  if (!section) return;
  btn.addEventListener("click", () => switchSection(section));
});

function switchSection(name) {
  if (!name) return; 
  document.querySelectorAll(".section").forEach(sec => {
    sec.classList.toggle("active", sec.id === name);
  });
  document.querySelectorAll(".topbar .nav .navbtn").forEach(b => {
    b.classList.toggle("active", b.dataset.section === name);
  });
}

function enableFallbackDrag(dom) {
  if (!THREE_SCENE) return;
  const { earth, orbitGroup } = THREE_SCENE;

  let dragging = false;
  let lastX = 0, lastY = 0;

  const getXY = (e) => {
    if (e.touches && e.touches[0]) return [e.touches[0].clientX, e.touches[0].clientY];
    return [e.clientX, e.clientY];
  };

  function onDown(e) { dragging = true; [lastX, lastY] = getXY(e); }
  function onMove(e) {
    if (!dragging) return;
    const [x, y] = getXY(e);
    const dx = (x - lastX) * 0.005;
    const dy = (y - lastY) * 0.005;
    lastX = x; lastY = y;

    if (earth) {
      earth.rotation.y -= dx;
      earth.rotation.x -= dy;
    }
    if (orbitGroup) {
      orbitGroup.rotation.y -= dx;
      orbitGroup.rotation.x -= dy;
    }
  }
  function onUp() { dragging = false; }

  dom.addEventListener('mousedown', onDown);
  dom.addEventListener('mousemove', onMove);
  dom.addEventListener('mouseup', onUp);
  dom.addEventListener('mouseleave', onUp);

  dom.addEventListener('touchstart', onDown, { passive: true });
  dom.addEventListener('touchmove', onMove,   { passive: true });
  dom.addEventListener('touchend', onUp);
}

function frameOrbit(object3D) {
  if (!THREE_SCENE) return;
  const { camera, controls } = THREE_SCENE;

  const box = new THREE.Box3().setFromObject(object3D);
  const center = new THREE.Vector3();
  const size = new THREE.Vector3();
  box.getCenter(center);
  box.getSize(size);

  const fitOffset = 1.8;
  const maxSize = Math.max(size.x, size.y, size.z);
  const fov = (camera.fov * Math.PI) / 180;
  let distance = (maxSize / 2) / Math.tan(fov / 2) * fitOffset;
  distance = Math.min(Math.max(distance, 2.5), 8);

  const dir = new THREE.Vector3(1, 0.6, 1).normalize();
  const targetPos = center.clone().add(dir.multiplyScalar(distance));
  camera.position.copy(targetPos);

  if (controls && controls.target) {
    controls.target.copy(center);
    controls.update();
  } else {
    camera.lookAt(center);
  }
}

// ---------- 3D Globe (Three.js) ----------
let THREE_SCENE = null;

function initGlobe() {
  const mount = document.getElementById("globeWrap");
  if (!mount || THREE_SCENE) return; 

  const width = mount.clientWidth;
  const height = mount.clientHeight;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0b0f17);

  const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 2000);
  camera.position.set(0, 0, 4.0);

  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(width, height);
  mount.appendChild(renderer.domElement);

  const ControlsCtor =
    (window.THREE && THREE.OrbitControls) ||
    (window.OrbitControls ? window.OrbitControls : null);

  let controls = null;
  if (ControlsCtor) {
    controls = new ControlsCtor(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.enablePan = false;
    controls.enableZoom = true;
    controls.minDistance = 1.6;
    controls.maxDistance = 8;
    controls.target.set(0, 0, 0);
    controls.update();
  } else {
    console.warn("OrbitControls not found; enabling fallback drag");
    enableFallbackDrag(renderer.domElement);
  }

  // Lights
  scene.add(new THREE.AmbientLight(0xffffff, 0.6));
  const dir = new THREE.DirectionalLight(0xffffff, 0.6);
  dir.position.set(5, 3, 5);
  scene.add(dir);

  // Earth
  const R = 1.0;
  const earthGeo = new THREE.SphereGeometry(R, 64, 64);
  const earthMat = new THREE.MeshPhongMaterial({
    map: new THREE.TextureLoader().load("https://unpkg.com/three-globe/example/img/earth-blue-marble.jpg"),
    specular: 0x333333,
    shininess: 5
  });
  const earth = new THREE.Mesh(earthGeo, earthMat);
  scene.add(earth);

  // Atmosphere glow
  const atmoGeo = new THREE.SphereGeometry(R * 1.02, 64, 64);
  const atmoMat = new THREE.MeshBasicMaterial({ color: 0x3ab5ff, transparent: true, opacity: 0.08, side: THREE.BackSide });
  const atmo = new THREE.Mesh(atmoGeo, atmoMat);
  scene.add(atmo);

  // Groups, satellite marker
  const orbitGroup = new THREE.Group();
  const pathGroup  = new THREE.Group();  
  orbitGroup.add(pathGroup);
  scene.add(orbitGroup);

  const satGeom = new THREE.SphereGeometry(0.015, 16, 16);
  const satMat = new THREE.MeshBasicMaterial({ color: 0xffcc00 });
  const sat = new THREE.Mesh(satGeom, satMat);
  orbitGroup.add(sat); 
  orbitGroup.rotation.y = 0;

  // Resize handling
  if (typeof ResizeObserver !== "undefined") {
    new ResizeObserver(() => {
      const w = mount.clientWidth, h = mount.clientHeight;
      renderer.setSize(w, h);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    }).observe(mount);
  } else {
    window.addEventListener("resize", () => {
      const w = mount.clientWidth, h = mount.clientHeight;
      renderer.setSize(w, h);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    });
  }

  THREE_SCENE = { scene, camera, renderer, controls, earth, atmo, orbitGroup, pathGroup, sat, R, framedOnce: false, path: null };

    let last = performance.now();
  function animate() {
    requestAnimationFrame(animate);

    const now = performance.now();
    const dtMs = now - last;
    last = now;

    if (THREE_SCENE && THREE_SCENE.path) {
      const p = THREE_SCENE.path;
      const speed = 1.0;
      p.acc += (dtMs / 1000) * speed;

      while (p.acc >= p.dt) {
        p.acc -= p.dt;
        p.i = (p.i + 1) % (p.positions.length - 1);
      }

      const a = p.positions[p.i];
      const b = p.positions[(p.i + 1) % p.positions.length];
      const alpha = p.dt > 0 ? (p.acc / p.dt) : 0;
      THREE_SCENE.sat.position.lerpVectors(a, b, alpha);
    }

    if (THREE_SCENE.controls && typeof THREE_SCENE.controls.update === "function") THREE_SCENE.controls.update();
    renderer.render(scene, camera);
  }
  animate();
}

// Map offsets
let MERIDIAN_OFFSET_DEG = 90;
let LAT_OFFSET_DEG      = 0;

function llaToCartesian(latDeg, lonDeg, altKm, R) {
  const Re = 6371;
  const r  = (Re + (altKm || 0)) * (R / Re);

  const lat = ((latDeg + LAT_OFFSET_DEG) * Math.PI) / 180;
  const lon = ((lonDeg + MERIDIAN_OFFSET_DEG) * Math.PI) / 180;

  const x = r * Math.cos(lat) * Math.sin(lon);
  const y = r * Math.sin(lat);
  const z = r * Math.cos(lat) * Math.cos(lon);
  return new THREE.Vector3(x, y, z);
}

/**
 * Draw an orbit line + move satellite along it over time
 * sim: { info, points:[{t, lla:{lat,lon,alt}}...] }
 */
function drawOrbit(sim) {
  if (!THREE_SCENE) initGlobe();

  const { pathGroup, sat, R } = THREE_SCENE;
  pathGroup.clear();

  const pts = sim.points || [];
  if (pts.length < 2) { setStatus("Not enough points to draw."); return; }

  const positions = pts.map(p => llaToCartesian(p.lla.lat, p.lla.lon, p.lla.alt, R));

  const geom = new THREE.BufferGeometry().setFromPoints(positions);
  const mat  = new THREE.LineBasicMaterial({ linewidth: 2 });
  const line = new THREE.Line(geom, mat);
  pathGroup.add(line);

  sat.position.copy(positions[0]);

  const dt = Math.max(1, ((pts[1]?.t ?? (pts[0].t + 1)) - pts[0].t));
  THREE_SCENE.path = { positions, dt, i: 0, acc: 0 };

  if (!THREE_SCENE.framedOnce) {
    frameOrbit(line);
    THREE_SCENE.framedOnce = true;
  }

  setStatus(`Orbit drawn: ${positions.length} points`);
}

function isRegisterMode() {
  return !!document.body.dataset.registerMode;
}
function setRegisterMode(on) {
  document.body.dataset.registerMode = on ? '1' : '';
  const p2 = $("#auth-password2");
  if (p2) p2.style.display = on ? "" : "none";
  const toggle = $("#btn-toggle-auth");
  if (toggle) toggle.textContent = on ? "Have an account?" : "Need an account?";
}

async function register(email, password) {
  const res = await fetch(API("/auth/register"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ email, password })
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || `Register failed (${res.status})`);
  setAccessToken(data.accessToken);
  const u = $("#auth-user");
  if (u) u.textContent = data?.user?.email || email;
  return data;
}

// --------- DOM Ready ----------
document.addEventListener("DOMContentLoaded", () => {
  const on = (sel, ev, fn, opts) => { const el = $(sel); if (el) el.addEventListener(ev, fn, opts); return !!el; };

  renderSidebar();
  initGlobe();

  // --- NAV ---
  $$(".topbar .nav .navbtn").forEach(btn => {
    const section = btn.dataset.section;
    if (!section) return;
    btn.addEventListener("click", () => switchSection(section));
  });
  switchSection("dashboard");

  // --- SIMULATION ---
  on("#btn-simulate", "click", onSimulateClick);

  // --- DASHBOARD HELPERS ---
  on("#btn-dry-run", "click", () => {
    const satid = $("#satid")?.value?.trim() || "";
    const lat   = $("#lat")?.value?.trim() || "";
    const lon   = $("#lon")?.value?.trim() || "";
    const alt   = $("#alt")?.value?.trim() || "";
    setStatus("Dry run complete (no API calls).");
    show({ message: "Inputs captured.", satid, observer: { lat, lon, alt } });
  });
  on("#btn-clear", "click", () => {
    setStatus("Idle");
    show("// output will appear here");
  });

  // --- EXISTING API BINDINGS ---
  on("#btn-positions",    "click", callPositions);
  on("#btn-visualpasses", "click", callVisualPasses);
  on("#btn-radiopasses",  "click", callRadioPasses);
  on("#btn-above",        "click", callAbove);

  // ===================== AUTH PANEL =====================
  const emailEl = $("#auth-email");
  const passEl  = $("#auth-password");

  // Login
  on("#btn-login", "click", async () => {
    try {
      const email = (emailEl?.value || "").trim().toLowerCase();
      const password = passEl?.value || "";
      if (!email || !password) throw new Error("Enter email and password.");
      setStatus("Logging in …");
      await login(email, password);
      setStatus("Logged in.");
    } catch (e) {
      setStatus(e.message);
      show({ error: e.message });
    }
  });

  // Enter in password -> login
  if (passEl) {
    passEl.addEventListener("keydown", (e) => {
      if (e.key === "Enter") $("#btn-login")?.click();
    });
  }

  // --- REGISTER ---
  on("#btn-register", "click", () => {
    const prefill = $("#auth-email")?.value?.trim() || "";
    if (typeof openRegisterDrawer === "function") {
      openRegisterDrawer(prefill);
    }
  });
  on("#reg-close", "click", () => {
    if (typeof closeRegisterDrawer === "function") closeRegisterDrawer();
  });
  on("#reg-overlay", "click", (e) => {
    if (e.target === e.currentTarget && typeof closeRegisterDrawer === "function") {
      closeRegisterDrawer();
    }
  });
  on("#reg-submit", "click", async () => {
    if (typeof doRegister === "function") await doRegister();
  });
  const regPw = $("#reg-password");
  regPw && regPw.addEventListener("keydown", (e) => { if (e.key === "Enter" && typeof doRegister === "function") doRegister(); });
  const regEmail = $("#reg-email");
  regEmail && regEmail.addEventListener("keydown", (e) => { if (e.key === "Enter") $("#reg-password")?.focus(); });

  // Logout
  on("#btn-logout", "click", async () => {
    await logout();
    setStatus("Logged out.");
  });

  // Initial auth UI
  setAccessToken(""); // start logged out
});
