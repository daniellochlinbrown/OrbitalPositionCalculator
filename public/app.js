/* ----------------------- tiny DOM helpers ----------------------- */
const $  = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

/* ----------------------- app state ----------------------- */
let ALL_SATS = [];       // full list from the server [{ id, name, updatedAt }]
let FILTERED_SATS = [];  // list currently shown in the sidebar
let FAVS = new Set();    // favourite NORAD IDs
let ACCESS_TOKEN = "";   // JWT for auth-only endpoints
const FAV_API = '/favourites';


const out = $("#out");
const statusEl = $("#status");

/* ----------------------- small utilities ----------------------- */
const API = (path) => (path.startsWith("http") ? path : `${path}`);

function setStatus(msg) {
  if (statusEl) statusEl.textContent = msg;
  console.log("[status]", msg);
}

function show(obj) {
  if (!out) return console.log("[out]", obj);
  out.textContent = typeof obj === "string" ? obj : JSON.stringify(obj, null, 2);
}

function debounce(fn, ms = 200) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}

// simple date helper to decide “stale”
function isOlderThan(dateStr, hours = 12) {
  if (!dateStr) return true;
  const t = new Date(dateStr).getTime();
  if (!Number.isFinite(t)) return true;
  return (Date.now() - t) > hours * 3600 * 1000;
}
function getCurrentSearchTerm() {
  const el = $("#satSearch");
  return el ? el.value.trim() : "";
}

function sortByFavouritesThenDefault(list) {
  // Favourites first; otherwise keep original fetch order (_ord)
  return list.slice().sort((a, b) => {
    const af = FAVS.has(a.id) ? 1 : 0;
    const bf = FAVS.has(b.id) ? 1 : 0;
    if (af !== bf) return bf - af;
    const ai = a._ord ?? 0, bi = b._ord ?? 0;
    return ai - bi;
  });
}


/* ----------------------- auth + fetch helpers ----------------------- */
function setAccessToken(token) {
  ACCESS_TOKEN = token || "";

  const loggedOut = $("#auth-when-logged-out");
  const loggedIn  = $("#auth-when-logged-in");
  const on = Boolean(ACCESS_TOKEN);

  if (loggedOut && loggedIn) {
    loggedOut.style.display = on ? "none" : "";
    loggedIn.style.display  = on ? "" : "none";
  }

  if (on) {
    if (typeof loadFavourites === "function") {
      loadFavourites().catch(e => {
        console.warn("[favs] load failed:", e?.message || e);
        setStatus("Favourites unavailable");
      });
    }
  } else {
    FAVS = new Set();
    renderSidebar();
    renderFavourites();
  }
}

function parseJwt(token) {
  try {
    const base = token.split('.')[1]
      .replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(atob(base));
  } catch { return null; }
}

function setUserLabel(email) {
  const el = document.getElementById('auth-user');
  if (el) el.textContent = email || '—';
}


 async function attemptAutoLogin() {
   try {
     const res = await fetch(API('/auth/refresh'), {
       method: 'POST',
       credentials: 'include',
     });
     if (!res.ok) return false;
     const { accessToken } = await res.json().catch(() => ({}));
     if (!accessToken) return false;

     setAccessToken(accessToken);
      // show the user’s email from the JWT
      const payload = parseJwt(accessToken);
      setUserLabel(payload?.email || '—');

     // load favourites immediately
     if (typeof loadFavourites === 'function') {
       await loadFavourites().catch(() => {});
     }
     setStatus('Welcome back.');
     return true;
   } catch {
     return false;
   }
 }




async function apiFetch(url, opts = {}) {
  const headers = new Headers(opts.headers || {});
  if (ACCESS_TOKEN) headers.set("Authorization", `Bearer ${ACCESS_TOKEN}`);

  const res = await fetch(url, { ...opts, headers, credentials: "include" });

  // auto-refresh token once if we got a 401
  if (res.status === 401) {
    const r = await fetch(API("/auth/refresh"), { method: "POST", credentials: "include" });
    if (r.ok) {
      const { accessToken } = await r.json().catch(() => ({}));
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
  setUserLabel(data?.user?.email || email);
  return data;
}


async function logout() {
  try { await fetchJSON(API("/auth/logout"), { method: "POST", credentials: "include" }); } catch {}
  setAccessToken("");
}

/* ----------------------- favourites ----------------------- */
async function loadFavourites() {
  try {
    const data = await fetchJSON(API(FAV_API));
    FAVS = new Set((data?.items || []).map(Number));
    applySearchFilter(getCurrentSearchTerm());
    renderFavourites();
  } catch (e) {
    console.warn("[favs] load failed:", e?.message || e);
    setStatus("Favourites unavailable");
  }
}

async function toggleFavourite(noradId) {
  if (!ACCESS_TOKEN) { setStatus("Please log in to manage favourites."); return; }
  const id = Number(noradId);

  try {
    if (FAVS.has(id)) {
      await fetchJSON(API(`${FAV_API}/${id}`), { method: "DELETE" });
      FAVS.delete(id);
    } else {
      await fetchJSON(API(FAV_API), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ noradId: id }),
      });
      FAVS.add(id);
    }
  } catch (e) {
    setStatus(e.message || "Failed to update favourites");
  }

  // Re-apply current search + favourites-first sort, then repaint
  applySearchFilter(getCurrentSearchTerm());
  renderFavourites();
}

/* ----------------------- register drawer ----------------------- */
function openRegisterDrawer(prefillEmail = "") {
  const ov = $("#reg-overlay"), dr = $("#reg-drawer");
  if (!ov || !dr) return;
  if (prefillEmail) $("#reg-email").value = prefillEmail;
  $("#reg-password").value = "";
  const err = $("#reg-error");
  if (err) { err.style.display = "none"; err.textContent = ""; }
  ov.hidden = false; dr.hidden = false;
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

/* ----------------------- satellites: fetch + search + render ----------------------- */

// small, popular fallback so the UI never feels empty
const POPULAR_FALLBACK = [
  { id: 25544, name: "ISS (ZARYA)" },
  { id: 20580, name: "Hubble Space Telescope" },
  { id: 25994, name: "Terra (EOS AM-1)" },
  { id: 27424, name: "Aqua (EOS PM-1)" },
  { id: 39444, name: "Suomi NPP" },
];

async function fetchAllSatellites(initialLimit = 150, finalLimit = 500) {
  const sortFn = (typeof sortByFavouritesThenDefault === 'function')
    ? sortByFavouritesThenDefault
    : (list) => list.slice().sort((a, b) => {
        const ai = a._ord ?? 0, bi = b._ord ?? 0;
        return ai - bi;
      });
  const currentTerm = (typeof getCurrentSearchTerm === 'function')
    ? getCurrentSearchTerm()
    : ($("#satSearch")?.value?.trim() || "");

  try {
    const first = await fetchJSON(API(`/tle?limit=${initialLimit}`));
    const firstItems = Array.isArray(first?.items) ? first.items : [];

    if (!firstItems.length) {
      // fallback list
      ALL_SATS = (Array.isArray(POPULAR_FALLBACK) ? POPULAR_FALLBACK : []).map((r, i) => ({
        ...r,
        _ord: i,
      }));
      FILTERED_SATS = sortFn(ALL_SATS);
      setStatus("Showing popular satellites (no DB rows yet).");
      return;
    }
    ALL_SATS = firstItems.map((r, i) => ({
      id: Number(r.noradId),
      name: r.name || `NORAD ${r.noradId}`,
      updatedAt: r.updatedAt || null,
      _ord: i,
    }));
    FILTERED_SATS = sortFn(ALL_SATS);

    if (finalLimit > initialLimit) {
      Promise.resolve().then(async () => {
        try {
          const rest = await fetchJSON(API(`/tle?limit=${finalLimit}`));
          const restItems = Array.isArray(rest?.items) ? rest.items : [];
          if (restItems.length > firstItems.length) {
            const existingById = new Map(ALL_SATS.map(s => [s.id, s]));
            const merged = restItems.map((r, i) => {
              const id = Number(r.noradId);
              const prev = existingById.get(id) || {};
              return {
                ...prev,
                id,
                name: r.name || `NORAD ${id}`,
                updatedAt: r.updatedAt || null,
                _ord: i, 
              };
            });
            ALL_SATS = merged;
            if (currentTerm) applySearchFilter(currentTerm);
            else { FILTERED_SATS = sortFn(ALL_SATS); renderSidebar(); }
            setStatus(`Loaded ${ALL_SATS.length} satellites`);
          }
        } catch (e) {
          console.warn("[/tle] background fetch failed:", e?.message || e);
        }
      });
    }
  } catch (e) {
    console.warn("[/tle] failed, using fallback:", e?.message || e);
    ALL_SATS = (Array.isArray(POPULAR_FALLBACK) ? POPULAR_FALLBACK : []).map((r, i) => ({
      ...r,
      _ord: i,
    }));
    FILTERED_SATS = sortFn(ALL_SATS);
    setStatus("Loaded starter list (API unavailable).");
  }
}

// refresh stale rows server-side; try canonical + fallbacks
async function ensureFresh(ids, maxAgeHours = 12) {
  if (!ids?.length) return { items: [] };
  const payload = { ids, maxAgeHours, refreshStale: true };

  try {
    return await fetchJSON(API('/tle/ensure'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
  } catch (e1) {
    if (!/HTTP 404/.test(e1.message)) throw e1;
  }
  try {
    return await fetchJSON(API('/tle/batch-ensure'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
  } catch (e2) {
    if (!/HTTP 404/.test(e2.message)) throw e2;
  }
  return await fetchJSON(API('/tle/batch'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
}


function applySearchFilter(q) {
  const term = (q || "").toLowerCase();
  const base = !term
    ? ALL_SATS
    : ALL_SATS.filter(s =>
        String(s.id).includes(term) ||
        (s.name || "").toLowerCase().includes(term)
      );
  FILTERED_SATS = sortByFavouritesThenDefault(base);
  renderSidebar();
}


function fillSatInputs(id) {
  ["satid","pos-satid","vis-satid","rad-satid","sim-satid"].forEach(k => {
    const el = document.getElementById(k);
    if (el) el.value = id;
  });
}

/* ---------- sidebar ---------- */
function createSatListItem(s) {
  const li = document.createElement("li");
  li.className = "sat-item";

  const nameWrap = document.createElement("div");
  nameWrap.className = "name";

  const title = document.createElement("span");
  title.className = "title";
  title.textContent = s.name ?? `NORAD ${s.id}`;

  const sub = document.createElement("span");
  sub.className = "sub";
  sub.textContent = `NORAD ${s.id}`;

  nameWrap.appendChild(title);
  nameWrap.appendChild(sub);

  nameWrap.title = "Click to simulate 10 minutes @1s";
  nameWrap.addEventListener("click", async () => {
    fillSatInputs(s.id);
    setStatus(`Selected ${s.name ?? `NORAD ${s.id}`} (${s.id}) — simulating…`);
    try { await callSimulateQuick(String(s.id)); } catch (e) { setStatus(e.message || "Simulation failed"); }
  });

  const actions = document.createElement("div");
  actions.className = "mini";

  const favBtn = document.createElement("button");
  favBtn.className = "mini-btn";
  const paintStar = () => favBtn.textContent = FAVS.has(Number(s.id)) ? "★" : "☆";
  paintStar();
  favBtn.title = "Toggle favourite";
  favBtn.addEventListener("click", async (e) => {
    e.stopPropagation();
    await toggleFavourite(s.id);
    paintStar();
  });

  actions.appendChild(favBtn);

  li.appendChild(nameWrap);
  li.appendChild(actions);
  return li;
}

function renderSidebarChunked(items, chunkSize = 50) {
  const ul = $("#satList");
  if (!ul) return;

  ul.innerHTML = "";
  if (!items.length) {
    ul.innerHTML = `<li class="sat-item"><div class="name"><span class="title">No satellites</span><span class="sub">Try a different search</span></div></li>`;
    return;
  }

  let i = 0;
  const step = () => {
    const frag = document.createDocumentFragment();
    for (let c = 0; c < chunkSize && i < items.length; c++, i++) {
      frag.appendChild(createSatListItem(items[i]));
    }
    ul.appendChild(frag);
    if (i < items.length) {
      (window.requestIdleCallback || window.requestAnimationFrame)(step);
    }
  };
  step();
}

function renderSidebar() {
  renderSidebarChunked(FILTERED_SATS);
}

function renderFavourites() {
  const ul = $("#favList");
  if (!ul) return;

  ul.innerHTML = "";
  const ids = Array.from(FAVS.values()).sort((a,b) => a - b);

  if (!ids.length) {
    ul.innerHTML = `<li class="sat-item"><div class="name muted">No favourites yet. Star a satellite in the sidebar.</div></li>`;
    return;
  }

  ids.forEach(id => {
    const li = document.createElement("li");
    li.className = "sat-item";

    const name = document.createElement("div");
    name.className = "name";
    name.textContent = `NORAD ${id}`;
    name.title = "Click to simulate";
    name.addEventListener("click", async () => {
      fillSatInputs(id);
      setStatus(`Selected NORAD ${id} — simulating…`);
      try { await callSimulateQuick(String(id)); } catch (e) { setStatus(e.message || "Simulation failed"); }
    });

    const actions = document.createElement("div");
    actions.className = "mini";

    const unstarBtn = document.createElement("button");
    unstarBtn.className = "mini-btn";
    unstarBtn.textContent = "★";
    unstarBtn.title = "Remove from favourites";
    unstarBtn.addEventListener("click", async (e) => {
      e.stopPropagation();
      await toggleFavourite(id);
    });

    actions.appendChild(unstarBtn);
    li.appendChild(name);
    li.appendChild(actions);
    ul.appendChild(li);
  });
}

/* ----------------------- nav / sections ----------------------- */
function switchSection(name) {
  if (!name) return;
  $$(".section").forEach(sec => sec.classList.toggle("active", sec.id === name));
  $$(".topbar .nav .navbtn").forEach(b => b.classList.toggle("active", b.dataset.section === name));
}

/* ----------------------- simulation (single) ----------------------- */
function getSimSatId() {
  const simId  = $("#sim-satid")?.value?.trim();
  const dashId = $("#satid")?.value?.trim();
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
  } catch (e) {
    setStatus(e.message);
    show({ error: e.message });
  }
}

async function onSimulateClick() {
  const satid       = getSimSatId();
  const durationSec = Number($("#sim-duration")?.value || 600);
  const stepSec     = Number($("#sim-step")?.value || 1);
  await callSimulateQuick(satid, durationSec, stepSec);
}

/* ----------------------- multi-sim ranking helpers ----------------------- */
function scoreName(nameRaw) {
  const name = String(nameRaw || "").toUpperCase();
  if (/\bISS\b|ZARYA/.test(name)) return 100;
  if (/HUBBLE/.test(name)) return 96;
  if (/\bTESS\b/.test(name)) return 93;
  if (/\bAQUA\b/.test(name)) return 90;
  if (/\bTERRA\b/.test(name)) return 89;
  if (/\bSUOMI\b|\bNPP\b/.test(name)) return 87;
  if (/LANDSAT/.test(name)) return 86;
  if (/SENTINEL/.test(name)) return 84;
  if (/NOAA|METOP|HIMAWARI|GOES|GPS|GLONASS|GALILEO|BEIDOU|IRIDIUM/.test(name)) return 80;
  if (/STARLINK|ONEWEB/.test(name)) return 40;
  if (/COSMOS|COSMOS-/.test(name)) return 55;
  return 60;
}

const ID_BUMPS = new Map([
  [25544, 15],
  [20580, 10],
  [43013,  8],
  [25994,  6],
  [27424,  6],
  [39444,  5],
]);

async function fetchMetaFor(ids) {
  try {
    const res = await fetchJSON(API("/tle/meta"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids })
    });
    const map = new Map();
    (res?.items || []).forEach(it => map.set(Number(it.noradId), it.name || null));
    return map;
  } catch {
    return new Map();
  }
}

async function rankIds(ids) {
  const nameById = await fetchMetaFor(ids);
  const scored = ids.map(id => {
    const nm = nameById.get(id);
    let s = nm ? scoreName(nm) : 60;
    if (ID_BUMPS.has(id)) s += ID_BUMPS.get(id);
    return { id, score: s };
  });
  const indexOf = new Map(ids.map((v, i) => [v, i]));
  scored.sort((a, b) => (b.score - a.score) || (indexOf.get(a.id) - indexOf.get(b.id)));
  return scored.map(x => x.id);
}

function groupsFrom(sortedIds) {
  return {
    top10: sortedIds.slice(0, 10),
    top25: sortedIds.slice(0, 25),
    top50: sortedIds.slice(0, 50),
    all:   sortedIds.slice(),
  };
}

/* ----------------------- three.js globe ----------------------- */
let THREE_SCENE = null;
let MERIDIAN_OFFSET_DEG = 90;
let LAT_OFFSET_DEG = 0;

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

  if (controls && controls.target) { controls.target.copy(center); controls.update(); }
  else { camera.lookAt(center); }
}

function revealOrbitForTrack(track) {
  if (!THREE_SCENE || !track || !track.positions?.length) return;
  const { pathGroup } = THREE_SCENE;

  if (Array.isArray(THREE_SCENE.paths)) {
    THREE_SCENE.paths.forEach(t => {
      if (t.line) {
        pathGroup.remove(t.line);
        t.line.geometry?.dispose?.();
        t.line.material?.dispose?.();
        t.line = null;
      }
    });
  }

  const lineGeom = new THREE.BufferGeometry().setFromPoints(track.positions);
  const lineMat  = new THREE.LineBasicMaterial({ color: 0x38BDF8, transparent: true, opacity: 0.9 });
  const line     = new THREE.Line(lineGeom, lineMat);
  pathGroup.add(line);
  track.line = line;

  frameOrbit(line);
  const label = track?.meta?.name || (track?.meta?.satid ? `NORAD ${track.meta.satid}` : "Satellite");
  setStatus(`Showing orbit for ${label}`);
}

function initGlobe() {
  const mount = $("#globeWrap");
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
    renderer.domElement.addEventListener("mousedown", () => {});
  }

  scene.add(new THREE.AmbientLight(0xffffff, 0.6));
  const dir = new THREE.DirectionalLight(0xffffff, 0.6);
  dir.position.set(5, 3, 5);
  scene.add(dir);

  const R = 1.0;
  const earthGeo = new THREE.SphereGeometry(R, 64, 64);
  const earthMat = new THREE.MeshPhongMaterial({
    map: new THREE.TextureLoader().load("https://unpkg.com/three-globe/example/img/earth-blue-marble.jpg"),
    specular: 0x333333,
    shininess: 5
  });
  const earth = new THREE.Mesh(earthGeo, earthMat);
  scene.add(earth);

  const atmoGeo = new THREE.SphereGeometry(R * 1.02, 64, 64);
  const atmoMat = new THREE.MeshBasicMaterial({ color: 0x3ab5ff, transparent: true, opacity: 0.08, side: THREE.BackSide });
  const atmo = new THREE.Mesh(atmoGeo, atmoMat);
  scene.add(atmo);

  const orbitGroup = new THREE.Group();
  const pathGroup  = new THREE.Group();
  orbitGroup.add(pathGroup);
  scene.add(orbitGroup);

  const satGeom = new THREE.SphereGeometry(0.015, 16, 16);
  const satMat  = new THREE.MeshBasicMaterial({ color: 0xffcc00 });
  const sat = new THREE.Mesh(satGeom, satMat);
  orbitGroup.add(sat);
  sat.visible = false;

  const tooltip = document.createElement("div");
  tooltip.id = "sat-tooltip";
  Object.assign(tooltip.style, {
    position: "absolute",
    pointerEvents: "none",
    padding: "4px 6px",
    background: "rgba(0,0,0,0.7)",
    color: "#fff",
    fontSize: "12px",
    borderRadius: "6px",
    transform: "translate(-50%,-120%)",
    whiteSpace: "nowrap",
    display: "none"
  });
  mount.style.position = "relative";
  mount.appendChild(tooltip);

  const raycaster = new THREE.Raycaster();
  const mouse = new THREE.Vector2();
  let hoveredTrack = null;

  renderer.domElement.addEventListener("mousemove", (e) => {
    const rect = renderer.domElement.getBoundingClientRect();
    mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

    const sats = [];
    const satToTrack = new Map();

    if (Array.isArray(THREE_SCENE.paths)) {
      for (const tr of THREE_SCENE.paths) {
        if (tr?.sat) {
          sats.push(tr.sat);
          satToTrack.set(tr.sat.id || tr.sat.uuid, tr);
        }
      }
    }
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
      tooltip.style.display = "";

      const v = obj.position.clone().project(camera);
      if (v.z > 1 || v.z < -1) {
        tooltip.style.display = "none";
      } else {
        const x = (v.x * 0.5 + 0.5) * renderer.domElement.clientWidth;
        const y = (-v.y * 0.5 + 0.5) * renderer.domElement.clientHeight;
        tooltip.style.left = `${x}px`;
        tooltip.style.top  = `${y}px`;
      }
    } else {
      hoveredTrack = null;
      tooltip.style.display = "none";
    }
  });

  renderer.domElement.addEventListener("click", (e) => {
    const rect = renderer.domElement.getBoundingClientRect();
    mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

    const sats = [];
    const satToTrack = new Map();

    if (Array.isArray(THREE_SCENE.paths)) {
      for (const tr of THREE_SCENE.paths) {
        if (tr?.sat) {
          sats.push(tr.sat);
          satToTrack.set(tr.sat.id || tr.sat.uuid, tr);
        }
      }
    }
    if (THREE_SCENE.sat && THREE_SCENE.path) {
      sats.push(THREE_SCENE.sat);
      satToTrack.set(THREE_SCENE.sat.id || THREE_SCENE.sat.uuid, { ...THREE_SCENE.path, sat: THREE_SCENE.sat, meta: THREE_SCENE.singleMeta });
    }

    raycaster.setFromCamera(mouse, camera);
    const hits = raycaster.intersectObjects(sats, false);
    if (!hits.length) return;

    const obj = hits[0].object;
    const key = obj.id || obj.uuid;
    const track = satToTrack.get(key);
    if (track) revealOrbitForTrack(track);
  });

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
    scene, camera, renderer, controls,
    earth, atmo, orbitGroup, pathGroup, sat, R,
    path: null,
    singleMeta: null,
    paths: [],
    tooltip
  };

  let last = performance.now();
  function animate() {
    requestAnimationFrame(animate);

    const now = performance.now();
    const dtSec = (now - last) / 1000;
    last = now;

    if (THREE_SCENE.path) {
      const p = THREE_SCENE.path;
      p.acc += dtSec * 1.0;
      while (p.acc >= p.dt) {
        p.acc -= p.dt;
        p.i = (p.i + 1) % (p.positions.length - 1);
      }
      const a = p.positions[p.i];
      const b = p.positions[(p.i + 1) % p.positions.length];
      const alpha = p.dt > 0 ? (p.acc / p.dt) : 0;
      THREE_SCENE.sat.position.lerpVectors(a, b, alpha);
    }

    if (Array.isArray(THREE_SCENE.paths)) {
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

    if (THREE_SCENE.controls && typeof THREE_SCENE.controls.update === "function") THREE_SCENE.controls.update();
    renderer.render(scene, camera);
  }
  animate();
}

/* ----------------------- draw orbits ----------------------- */
function drawOrbit(sim) {
  if (!THREE_SCENE) initGlobe();
  const { pathGroup, sat, R } = THREE_SCENE;
  sat.visible = true; 

  pathGroup.clear();
  THREE_SCENE.paths = [];

  const pts = sim.points || [];
  if (pts.length < 2) { setStatus("Not enough points to draw."); return; }

  const positions = pts.map(p => llaToCartesian(p.lla.lat, p.lla.lon, p.lla.alt, R));
  sat.position.copy(positions[0]);

  const lineGeom = new THREE.BufferGeometry().setFromPoints(positions);
  const lineMat  = new THREE.LineBasicMaterial({ color: 0x38BDF8, transparent: true, opacity: 0.8 });
  const line     = new THREE.Line(lineGeom, lineMat);
  pathGroup.add(line);

  const dt = Math.max(1, ((pts[1]?.t ?? (pts[0].t + 1)) - pts[0].t));
  THREE_SCENE.path = { positions, dt, i: 0, acc: 0 };
  THREE_SCENE.singleMeta = { name: sim.name || `NORAD ${sim.satid}`, satid: sim.satid };

  frameOrbit(line);
  setStatus(`Orbit ready: ${(sim.name || `NORAD ${sim.satid}`)} — ${positions.length} pts`);
}

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
  if (THREE_SCENE.sat) THREE_SCENE.sat.visible = false; 
  setStatus("Cleared satellites.");
}


function clearSingleSimulation() {
  if (!THREE_SCENE) return;
  const { pathGroup } = THREE_SCENE;

  // remove single-sim line(s), keep multi-sim spheres
  const toRemove = [];
  pathGroup.children.forEach(obj => { if (obj.isLine) toRemove.push(obj); });
  toRemove.forEach(obj => {
    pathGroup.remove(obj);
    obj.geometry?.dispose?.();
    obj.material?.dispose?.();
  });

  THREE_SCENE.path = null;
  THREE_SCENE.singleMeta = null;
  if (THREE_SCENE.sat) THREE_SCENE.sat.visible = false; 

  if (THREE_SCENE.tooltip) THREE_SCENE.tooltip.style.display = "none";

  setStatus("Cleared single-satellite simulation.");
}



function colorForIndex(i, total) {
  const hue = (i / Math.max(1, total)) * 360;
  const s = 70, l = 55;
  const h = hue / 360, ss = s/100, ll = l/100;
  const hue2rgb = (p, q, t) => {
    if (t < 0) t += 1; if (t > 1) t -= 1;
    if (t < 1/6) return p + (q - p) * 6 * t;
    if (t < 1/2) return q;
    if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
    return p;
  };
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
  setStatus(`Plotted ${THREE_SCENE.paths.length} satellites (markers only, 84000s @ 60s).`);
}

/* ----------------------- multi-sim batching ----------------------- */
function pLimitLocal(concurrency = 4) {
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

async function simulateManyDb(ids, durationSec, stepSec) {
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

/* ----------------------- fleet controls ----------------------- */
const USER_NORAD_IDS = Array.from(new Set(String(
  "25544,59588,57800,54149,52794,48865,48274,46265,43682,43641,43521,42758,41337,41038,39766,39679,39358,38341,37731,33504,31793,31792,31789,31598,31114,29507,29228,28932,28931,28738,28499,28480,28415,28353,28222,28059,27601,27597,27432,27424,27422,27386,26474,26070,25994,25977,25876,25861,25860,25732,25407,25400,24883,24298,23705,23561,23405,23343,23088,23087,22830,22803,22626,22566,22286,22285,22236,22220,22219,21949,21938,21876,21819,21610,21574,21423,21422,21397,21088,20775,20666,20663,20625,20580,20511,20466,20465,20453,20443,20323,20262,20261,19650,19574,19573,19257,19210,19120,19046,18958,18749,18421,18187,18153,17973,17912,17590,17589,17567,17295,16908,16882,16792,16719,16496,16182,15945,15772,15483,14820,14699,14208,14032,13819,13553,13403,13154,13068,12904,12585,12465,12139,11672,11574,11267,10967,10114,8459,6155,6153,5730,5560,5118,4327,3669,3597,3230,2802,877,733,694,43013,39444"
).split(",").map(s => parseInt(s.trim(), 10)).filter(n => Number.isFinite(n) && n > 0)));

const POP_DURATION_SEC = 84000;
const POP_STEP_SEC = 60;

function selectedGroupName() {
  const el = $("#fleet-size") || $("#popular-count");
  return el ? el.value : "25";
}

async function onDrawPopularClick() {
  try {
    initGlobe();
    setStatus("Ranking satellites by interest…");
    const ranked = await rankIds(USER_NORAD_IDS);
    const groups = groupsFrom(ranked);
    const which  = selectedGroupName();
    const ids    = which === "10" ? groups.top10
                 : which === "25" ? groups.top25
                 : which === "50" ? groups.top50
                 : groups.all;

    if (!ids.length) throw new Error("No satellites in selected group.");

    setStatus(`Simulating ${ids.length} satellites for ${POP_DURATION_SEC}s @ ${POP_STEP_SEC}s (DB-only)…`);
    const res  = await simulateManyDb(ids, POP_DURATION_SEC, POP_STEP_SEC);
    const list = res?.results || [];
    const ok   = list.filter(x => !x.error && x.points?.length);
    const bad  = list.filter(x => x.error);

    drawOrbits(ok);
    show({ group: which, requested: ids.length, success: ok.length, failed: bad.length, failedIds: bad.map(x => x.satid) });
    setStatus(`Done. Plotted ${ok.length}/${ids.length}.`);
  } catch (e) {
    setStatus(e.message);
    show({ error: e.message });
  }
}

/* ----------------------- boot ----------------------- */
document.addEventListener("DOMContentLoaded", async () => {

  setAccessToken("");

  await attemptAutoLogin();
  const on = (sel, ev, fn, opts) => {
    const el = $(sel); if (el) el.addEventListener(ev, fn, opts);
    return !!el;
  };
  try {
    await fetchAllSatellites(150, 500);
  } catch (e) {
    console.warn("[sidebar] satellite load failed:", e?.message || e);
    ALL_SATS = [];
    FILTERED_SATS = [];
  }

  renderSidebar();
  initGlobe();

  // after paint, ask server to refresh only the stale ones
  setTimeout(async () => {
    try {
      const STALE_MAX = 200;
      const staleIds = ALL_SATS.filter(s => isOlderThan(s.updatedAt, 12)).slice(0, STALE_MAX).map(s => s.id);
      if (!staleIds.length) return;

      const batch = await ensureFresh(staleIds, 12);
      const byId = new Map((batch?.items || []).map(i => [Number(i.noradId), i]));
      if (!byId.size) return;

    ALL_SATS = ALL_SATS.map(s => {
      const hit = byId.get(s.id);
      return hit ? {
        id: s.id,
        name: hit.name || s.name,
        updatedAt: hit.updatedAt ?? s.updatedAt ?? null,
        epoch: hit.epoch,
        source: hit.source,
        stale: !!hit.stale
      } : s;
    });
      FILTERED_SATS = ALL_SATS.slice();
      renderSidebar();
      setStatus("Satellite data updated.");
    } catch (e) {
      console.warn("[ensureFresh] skipped:", e?.message || e);
    }
  }, 0);

  const searchEl = $("#satSearch");
  if (searchEl) {
    searchEl.addEventListener("input", debounce((e) => applySearchFilter(e.target.value), 150));
  }

  // nav
  $$(".topbar .nav .navbtn").forEach(btn => {
    const section = btn.dataset.section;
    if (section) btn.addEventListener("click", () => switchSection(section));
  });
  switchSection("dashboard");

  // simulate (single)
  on("#btn-simulate", "click", onSimulateClick);

  // fleet controls
  on("#btn-deploy-fleet", "click", onDrawPopularClick);
  on("#btn-clear-fleet", "click", clearAllOrbits);

  // dashboard helpers
  on("#btn-dry-run", "click", () => {
    const satid = $("#satid")?.value?.trim() || "";
    const lat   = $("#lat")?.value?.trim() || "";
    const lon   = $("#lon")?.value?.trim() || "";
    const alt   = $("#alt")?.value?.trim() || "";
    setStatus("Inputs captured.");
    show({ satid, observer: { lat, lon, alt } });
  });
  on("#btn-clear", "click", () => {
    clearSingleSimulation();    
    setStatus("Idle");
    show("// output will appear here");
  });


  // auth
  const emailEl = $("#auth-email");
  const passEl  = $("#auth-password");

  on("#btn-login", "click", async () => {
    try {
      const email = (emailEl?.value || "").trim().toLowerCase();
      const password = passEl?.value || "";
      if (!email || !password) throw new Error("Enter email and password.");
      setStatus("Logging in …");
      await login(email, password);
      await loadFavourites();
      setStatus("Logged in.");
    } catch (e) {
      setStatus(e.message);
      show({ error: e.message });
    }
  });

  if (passEl) {
    passEl.addEventListener("keydown", (e) => {
      if (e.key === "Enter") $("#btn-login")?.click();
    });
  }

  // register drawer
  on("#btn-register", "click", () => {
    const prefill = $("#auth-email")?.value?.trim() || "";
    openRegisterDrawer(prefill);
  });
  on("#reg-close", "click", closeRegisterDrawer);
  on("#reg-overlay", "click", (e) => { if (e.target === e.currentTarget) closeRegisterDrawer(); });
  on("#reg-submit", "click", async () => { await doRegister(); });

  const regPw = $("#reg-password");
  if (regPw) regPw.addEventListener("keydown", (e) => { if (e.key === "Enter") doRegister(); });
  const regEmail = $("#reg-email");
  if (regEmail) regEmail.addEventListener("keydown", (e) => { if (e.key === "Enter") $("#reg-password")?.focus(); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeRegisterDrawer(); });

  // logout
  on("#btn-logout", "click", async () => {
    await logout();
    FAVS.clear();
    applySearchFilter(getCurrentSearchTerm());
    renderFavourites();
    setUserLabel('');
    setStatus("Logged out.");
  });


});
