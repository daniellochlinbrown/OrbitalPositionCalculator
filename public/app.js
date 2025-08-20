// public/app.js
// ========= helpers =========
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

// ---- Auth ----
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

// ========= Popular draw config & utils =========
const POP_DURATION_SEC = 84000; // ~23.3h ahead
const POP_STEP_SEC     = 60;    // 60s steps to keep things light

// Your provided NORAD IDs (deduped + validated)
const USER_NORAD_IDS = Array.from(new Set(String(
  "25544,59588,57800,54149,52794,48865,48274,46265,43682,43641,43521,42758,41337,41038,39766,39679,39358,38341,37731,33504,31793,31792,31789,31598,31114,29507,29228,28932,28931,28738,28499,28480,28415,28353,28222,28059,27601,27597,27432,27424,27422,27386,26474,26070,25994,25977,25876,25861,25860,25732,25407,25400,24883,24298,23705,23561,23405,23343,23088,23087,22830,22803,22626,22566,22286,22285,22236,22220,22219,21949,21938,21876,21819,21610,21574,21423,21422,21397,21088,20775,20666,20663,20625,20580,20511,20466,20465,20453,20443,20323,20262,20261,19650,19574,19573,19257,19210,19120,19046,18958,18749,18421,18187,18153,17973,17912,17590,17589,17567,17295,16908,16882,16792,16719,16496,16182,15945,15772,15483,14820,14699,14208,14032,13819,13553,13403,13154,13068,12904,12585,12465,12139,11672,11574,11267,10967,10114,8459,6155,6153,5730,5560,5118,4327,3669,3597,3230,2802,877,733,694,43013,39444"
).split(',').map(s => parseInt(s.trim(), 10)).filter(n => Number.isFinite(n) && n > 0)));

// Simple dependency-free concurrency limiter
function pLimitLocal(concurrency = 6) {
  let active = 0;
  const q = [];
  const next = () => {
    if (active >= concurrency || q.length === 0) return;
    active++;
    const { fn, res, rej } = q.shift();
    Promise.resolve(fn()).then(
      v => { active--; next(); res(v); },
      e => { active--; next(); rej(e); }
    );
  };
  return (fn) => new Promise((res, rej) => { q.push({ fn, res, rej }); next(); });
}

// Popularity heuristics
function scoreName(nameRaw) {
  const name = String(nameRaw || '').toUpperCase();

  // Big crowd-pleasers
  if (/\bISS\b|ZARYA/.test(name))         return 100;
  if (/HUBBLE/.test(name))                return 96;
  if (/\bTESS\b/.test(name))              return 93;

  // NASA Earth-obs flagships
  if (/\bAQUA\b/.test(name))              return 90;
  if (/\bTERRA\b/.test(name))             return 89;
  if (/\bSUOMI\b|\bNPP\b/.test(name))     return 87;
  if (/LANDSAT/.test(name))               return 86;
  if (/SENTINEL/.test(name))              return 84;

  // Weather & nav (often searched)
  if (/NOAA|METOP|HIMAWARI|GOES|GPS|GLONASS|GALILEO|BEIDOU|IRIDIUM/.test(name)) return 80;

  // Downweight gigantic fleets to reduce clutter
  if (/STARLINK|ONEWEB/.test(name))       return 40;

  // Generic catch-alls
  if (/COSMOS|COSMOS-/.test(name))        return 55;

  // Unknown: neutral
  return 60;
}

// Optional: special bumps for known NORADs
const ID_BUMPS = new Map([
  [25544, 15], // ISS — ensure #1
  [20580, 10], // Hubble
  [43013,  8], // TESS
  [25994,  6], // Terra
  [27424,  6], // Aqua
  [39444,  5], // Suomi NPP (common name in DB)
]);

async function fetchMetaFor(ids) {
  try {
    const res = await fetchJSON(API('/tle/meta'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids })
    });
    const map = new Map();
    (res?.items || []).forEach(it => map.set(Number(it.noradId), it.name || null));
    return map;
  } catch {
    // If endpoint absent, proceed with ID bumps only
    return new Map();
  }
}

async function rankIds(ids) {
  const nameById = await fetchMetaFor(ids);

  const scored = ids.map(id => {
    const nm = nameById.get(id);
    let s = nm ? scoreName(nm) : 60;
    if (ID_BUMPS.has(id)) s += ID_BUMPS.get(id);
    return { id, name: nm, score: s };
  });

  // Stable sort: score desc, then by original order
  const indexOf = new Map(ids.map((v, i) => [v, i]));
  scored.sort((a, b) => (b.score - a.score) || (indexOf.get(a.id) - indexOf.get(b.id)));
  return scored.map(x => x.id);
}

function groupsFrom(sortedIds) {
  return {
    top10:  sortedIds.slice(0, 10),
    top25:  sortedIds.slice(0, 25),
    top50:  sortedIds.slice(0, 50),
    all:    sortedIds.slice(),
  };
}


function selectedGroupName() {
  // Prefer new Fleet control, fallback to any legacy select if present
  const el =
    document.getElementById("fleet-size") ||
    document.getElementById("popular-count");
  return el ? el.value : "25";
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

async function callNow(satid) {
  try {
    setStatus(`Fetching /now/${satid} …`);
    const data = await fetchJSON(API(`/now/${satid}`));
    show(data);
    setStatus("Done");
  } catch (e) { setStatus(e.message); show({ error: e.message }); }
}

// --------- Simulation (single) ----------
function getSimSatId() {
  const simId  = document.getElementById("sim-satid")?.value?.trim();
  const dashId = document.getElementById("satid")?.value?.trim();
  return simId || dashId || "";
}

async function callSimulateQuick(satid, durationSec = 600, stepSec = 1) {
  try {
    if (!satid) throw new Error("satid is required (fill Simulation or Dashboard Satellite field)");
    setStatus(`Simulating ${durationSec}s @${stepSec}s for ${satid} …`);
    const data = await fetchJSON(API(`/simulate?db=1`), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ satid, durationSec, stepSec })
    });
    show(data);
    if (data?.points?.length) drawOrbit(data);
    setStatus("Done");
  } catch (e) { setStatus(e.message); show({ error: e.message }); }
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
    // Only fill inputs; do NOT fetch
    name.title = "Click to fill Satellite ID (no fetch)";
    name.addEventListener("click", () => {
      fillSatInputs(s.id);
      setStatus(`Selected ${s.name} (${s.id})`);
      show({ message: "Satellite selected (no API call)", satid: String(s.id) });
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
      await callSimulateQuick(s.id);
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

  // Groups (multi-path capable)
  const orbitGroup = new THREE.Group();
  const pathGroup  = new THREE.Group();
  orbitGroup.add(pathGroup);
  scene.add(orbitGroup);

  // Single-sat marker (kept for /simulate single)
  const satGeom = new THREE.SphereGeometry(0.015, 16, 16);
  const satMat  = new THREE.MeshBasicMaterial({ color: 0xffcc00 });
  const sat = new THREE.Mesh(satGeom, satMat);
  orbitGroup.add(sat);
  orbitGroup.rotation.y = 0;

  // Tooltip div (for hover labels)
  const tooltip = document.createElement('div');
  tooltip.id = 'sat-tooltip';
  tooltip.style.position = 'absolute';
  tooltip.style.pointerEvents = 'none';
  tooltip.style.padding = '4px 6px';
  tooltip.style.background = 'rgba(0,0,0,0.7)';
  tooltip.style.color = '#fff';
  tooltip.style.fontSize = '12px';
  tooltip.style.borderRadius = '6px';
  tooltip.style.transform = 'translate(-50%,-120%)';
  tooltip.style.whiteSpace = 'nowrap';
  tooltip.style.display = 'none';
  mount.style.position = 'relative';
  mount.appendChild(tooltip);

  // Raycaster for hover
  const raycaster = new THREE.Raycaster();
  const mouse = new THREE.Vector2();
  let hoveredTrack = null; // reference to THREE_SCENE.paths[i] or {sat, meta} for single

  function updateTooltipPositionForObject(obj3D) {
    if (!obj3D) return;
    const v = obj3D.position.clone().project(camera);
    if (v.z > 1 || v.z < -1) { tooltip.style.display = 'none'; return; }
    const x = (v.x * 0.5 + 0.5) * renderer.domElement.clientWidth;
    const y = (-v.y * 0.5 + 0.5) * renderer.domElement.clientHeight;
    tooltip.style.left = `${x}px`;
    tooltip.style.top  = `${y}px`;
  }

  renderer.domElement.addEventListener('mousemove', (e) => {
    const rect = renderer.domElement.getBoundingClientRect();
    mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

    const sats = [];
    const satToTrack = new Map();

    // Multi-sat markers
    if (Array.isArray(THREE_SCENE.paths)) {
      for (const tr of THREE_SCENE.paths) {
        if (tr?.sat) {
          sats.push(tr.sat);
          satToTrack.set(tr.sat.id || tr.sat.uuid, tr);
        }
      }
    }
    // Single-sat marker
    if (THREE_SCENE.sat) {
      sats.push(THREE_SCENE.sat);
      satToTrack.set(THREE_SCENE.sat.id || THREE_SCENE.sat.uuid, { sat: THREE_SCENE.sat, meta: THREE_SCENE.singleMeta || {} });
    }

    raycaster.setFromCamera(mouse, camera);
    const hits = raycaster.intersectObjects(sats, false);

    if (hits.length) {
      const obj = hits[0].object;
      const key = obj.id || obj.uuid;
      const track = satToTrack.get(key);
      hoveredTrack = track || null;

      const name = track?.meta?.name || (track?.meta?.satid ? `NORAD ${track.meta.satid}` : "Satellite");
      tooltip.textContent = name;
      tooltip.style.display = '';
      updateTooltipPositionForObject(obj);
    } else {
      hoveredTrack = null;
      tooltip.style.display = 'none';
    }
  });

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

  THREE_SCENE = {
    scene, camera, renderer, controls, earth, atmo, orbitGroup, pathGroup, sat, R,
    framedOnce: false,
    // single path state
    path: null,
    singleMeta: null,
    // multi-path state
    paths: [],
    tooltip
  };

  let last = performance.now();
  function animate() {
    requestAnimationFrame(animate);

    const now = performance.now();
    const dtSec = (now - last) / 1000;
    last = now;

    // Single-sat animation
    if (THREE_SCENE && THREE_SCENE.path) {
      const p = THREE_SCENE.path;
      const speed = 1.0;
      p.acc += dtSec * speed;

      while (p.acc >= p.dt) {
        p.acc -= p.dt;
        p.i = (p.i + 1) % (p.positions.length - 1);
      }

      const a = p.positions[p.i];
      const b = p.positions[(p.i + 1) % p.positions.length];
      const alpha = p.dt > 0 ? (p.acc / p.dt) : 0;
      THREE_SCENE.sat.position.lerpVectors(a, b, alpha);
    }

    // Multi-sat animation (markers only)
    if (THREE_SCENE && Array.isArray(THREE_SCENE.paths)) {
      for (const track of THREE_SCENE.paths) {
        if (!track.positions || track.positions.length < 2) continue;
        track.acc += dtSec * track.speed;
        while (track.acc >= track.dt) {
          track.acc -= track.dt;
          track.i = (track.i + 1) % (track.positions.length - 1);
        }
        const a = track.positions[track.i];
        const b = track.positions[(track.i + 1) % track.positions.length];
        const t = track.dt > 0 ? (track.acc / track.dt) : 0;
        track.sat.position.lerpVectors(a, b, t);
      }
    }

    // Keep tooltip stuck above hovered object
    if (hoveredTrack?.sat) {
      THREE_SCENE.tooltip.style.display = '';
      const obj = hoveredTrack.sat;
      const v = obj.position.clone().project(camera);
      if (v.z > 1 || v.z < -1) {
        THREE_SCENE.tooltip.style.display = 'none';
      } else {
        const x = (v.x * 0.5 + 0.5) * renderer.domElement.clientWidth;
        const y = (-v.y * 0.5 + 0.5) * renderer.domElement.clientHeight;
        THREE_SCENE.tooltip.style.left = `${x}px`;
        THREE_SCENE.tooltip.style.top  = `${y}px`;
      }
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
 * Draw a single satellite (marker only) and animate along its path.
 * sim: { satid, name, info, points:[{t, lla:{lat,lon,alt}}...] }
 */
function drawOrbit(sim) {
  if (!THREE_SCENE) initGlobe();

  const { pathGroup, sat, R } = THREE_SCENE;
  pathGroup.clear(); // clear multi markers
  THREE_SCENE.paths = []; // reset multi state

  const pts = sim.points || [];
  if (pts.length < 2) { setStatus("Not enough points to draw."); return; }

  const positions = pts.map(p => llaToCartesian(p.lla.lat, p.lla.lon, p.lla.alt, R));
  sat.position.copy(positions[0]);

  const dt = Math.max(1, ((pts[1]?.t ?? (pts[0].t + 1)) - pts[0].t));
  THREE_SCENE.path = { positions, dt, i: 0, acc: 0 };
  THREE_SCENE.singleMeta = { name: sim.name || `NORAD ${sim.satid}`, satid: sim.satid };

  if (!THREE_SCENE.framedOnce) {
    // Build a temporary Box3 around first few positions for framing
    const tmpLineGeom = new THREE.BufferGeometry().setFromPoints(positions.slice(0, 64));
    const tmpLineObj = new THREE.Line(tmpLineGeom, new THREE.LineBasicMaterial());
    frameOrbit(tmpLineObj);
    THREE_SCENE.framedOnce = true;
  }

  setStatus(`Satellite ready: ${positions.length} points (marker only)`);
}

// ======== Multi-orbit helpers (markers only) ========
function frameAll() {
  if (!THREE_SCENE) return;
  const { camera, controls, pathGroup } = THREE_SCENE;
  const box = new THREE.Box3().setFromObject(pathGroup);
  if (!isFinite(box.min.x) || !isFinite(box.max.x)) return;
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

  if (controls && controls.target) { controls.target.copy(center); controls.update(); }
  else { camera.lookAt(center); }
}

function clearAllOrbits() {
  if (!THREE_SCENE) return;
  THREE_SCENE.paths = [];
  THREE_SCENE.pathGroup.clear();
  THREE_SCENE.path = null;
  setStatus("Cleared satellites.");
}

// color helper (HSL → hex int)
function colorForIndex(i, total) {
  const hue = (i / Math.max(1, total)) * 360;
  const s = 70, l = 55;
  const h = hue / 360, ss = s/100, ll = l/100;
  const hue2rgb = (p, q, t) => { if (t < 0) t += 1; if (t > 1) t -= 1; if (t < 1/6) return p + (q - p) * 6 * t; if (t < 1/2) return q; if (t < 2/3) return p + (q - p) * (2/3 - t) * 6; return p; };
  const q = ll < 0.5 ? ll * (1 + ss) : ll + ss - ll * ss;
  const p = 2 * ll - q;
  const r = Math.round(hue2rgb(p, q, h + 1/3) * 255);
  const g = Math.round(hue2rgb(p, q, h) * 255);
  const b = Math.round(hue2rgb(p, q, h - 1/3) * 255);
  return (r << 16) | (g << 8) | b;
}

function addOrbitPathForSim(sim, idx, total) {
  if (!THREE_SCENE) initGlobe();
  const { pathGroup, R } = THREE_SCENE;
  const pts = sim?.points || [];
  if (pts.length < 2) return;

  const positions = pts.map(p => llaToCartesian(p.lla.lat, p.lla.lon, p.lla.alt, R));

  const color = colorForIndex(idx, total);
  const satGeom = new THREE.SphereGeometry(0.012, 12, 12);
  const satMat  = new THREE.MeshBasicMaterial({ color });
  const sat     = new THREE.Mesh(satGeom, satMat);
  sat.position.copy(positions[0]);
  pathGroup.add(sat);

  const dt = Math.max(1, ((pts[1]?.t ?? (pts[0].t + 1)) - pts[0].t));
  THREE_SCENE.paths.push({
    positions, dt, i: 0, acc: 0, sat, speed: 1.0,
    meta: { satid: sim.satid, name: sim.name || `NORAD ${sim.satid}` }
  });
}

function drawOrbits(simResults) {
  clearAllOrbits();
  const total = simResults.length;
  simResults.forEach((sim, i) => {
    if (!sim?.points?.length) return;
    addOrbitPathForSim(sim, i, total);
  });
  frameAll();
  setStatus(`Plotted ${THREE_SCENE.paths.length} satellites (markers only, ${POP_DURATION_SEC}s @ ${POP_STEP_SEC}s).`);
}

// ======== Simulate Fleet of Satellites =========
async function simulateManyDb(ids, durationSec, stepSec) {
  // Prefer batch endpoint if present
  try {
    const res = await fetchJSON(API(`/simulate-many?db=1`), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ satids: ids, durationSec, stepSec }),
    });
    if (Array.isArray(res?.results)) return res;
  } catch (e) {
    console.warn("[simulate-many] endpoint not available, falling back:", e.message);
  }

  // Fallback: limited concurrency over /simulate?db=1
  const limit = pLimitLocal(4);
  const results = [];
  await Promise.all(ids.map(id => limit(async () => {
    try {
      const sim = await fetchJSON(API(`/simulate?db=1`), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ satid: String(id), durationSec, stepSec }),
      });
      results.push({ ...sim, satid: String(id) });
    } catch (err) {
      results.push({ satid: String(id), error: err.message || "Failed" });
    }
  })));
  return { count: results.length, results };
}

async function onDrawPopularClick() {
  try {
    initGlobe();
    setStatus("Ranking satellites by interest…");
    const ranked = await rankIds(USER_NORAD_IDS);
    const groups = groupsFrom(ranked);
    const which  = selectedGroupName();
    const ids    = which === '10'  ? groups.top10
                : which === '25'  ? groups.top25
                : which === '50'  ? groups.top50
                :                   groups.all;


    if (!ids.length) throw new Error("No satellites in selected group.");

    const durationSec = POP_DURATION_SEC;
    const stepSec     = POP_STEP_SEC;

    setStatus(`Simulating ${ids.length} satellites for ${durationSec}s @ ${stepSec}s (DB-only)…`);
    const res  = await simulateManyDb(ids, durationSec, stepSec);
    const list = res?.results || [];
    const ok   = list.filter(x => !x.error && x.points?.length);
    const bad  = list.filter(x => x.error);

    drawOrbits(ok);
    show({ group: which, requested: ids.length, success: ok.length, failed: bad.length, failedIds: bad.map(x => x.satid) });
    setStatus(`Done. Plotted ${ok.length}/${ids.length}.`);
  } catch (e) {
    setStatus(e.message); show({ error: e.message });
  }
}

// ======== Registration helpers ========
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

  // --- SIMULATION (single) ---
  on("#btn-simulate", "click", onSimulateClick);

  // --- FLEET / CONSTELLATION DRAW (multi) ---
  on("#btn-deploy-fleet", "click", onDrawPopularClick);  
  on("#btn-clear-fleet", "click", clearAllOrbits);        

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
