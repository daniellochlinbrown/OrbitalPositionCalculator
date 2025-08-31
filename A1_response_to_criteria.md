# Assignment 1 - REST API Project - Response to Criteria
================================================

## Overview
------------------------------------------------
- **Name:** Daniel Brown  
- **Student number:** n11070315  
- **Application name:** Satellite Orbital Tracker  
- **Two line description:**  
  This REST API allows users to browse a database of satellites, retrieve their current orbital position, and propagate their location to any specified date using the SGP4 orbital model. The application also includes an interactive globe interface for visual satellite selection.  

---

## Core criteria
------------------------------------------------

### Containerise the app
- **ECR Repository name:**  
- **Video timestamp:** 
- **Relevant files:**  
  - `Dockerfile`  
  - `docker-compose.yml`  

---

### Deploy the container
- **EC2 instance ID:**  
- **Video timestamp:**   

---

### User login
- **One line description:**  
  Implements secure user authentication with Argon2 password hashing, JWT-based access tokens, and refresh token versioning stored in the database.  
- **Video timestamp:** *(Add)*  
- **Relevant files:**  
  - `src/auth/auth.js`  
  - `src/routes/auth.js`  
  - `prisma/schema.prisma`  

---

### REST API
- **One line description:**  
  Provides REST endpoints to list/query TLEs, propagate orbits (single or batch), and manage user favourites.  
- **Video timestamp:** *(Add)*  
- **Relevant files:**  
  - `src/routes/index.js`  
  - `src/routes/tle.js`  
  - `src/routes/orbits.js`  
  - `src/routes/batch.js`  
  - `src/routes/favourites.js`  
  - `src/controllers/tleController.js`  
  - `src/controllers/orbitsController.js`  

**Key endpoints (current):**
- `GET /tle?limit=###` — List most-recent TLE rows from DB (ensures visual set freshness on first call).  
- `GET /tle/:satid` — Return TLE for a specific NORAD ID from DB.  
- `GET /now/:satid` — Current position (DB-only TLE → SGP4 propagate “now”).  
- `POST /simulate` — Body `{ satid, startUtc?, startIso?, startTs?, durationSec, stepSec }` → returns propagated LLA time series.  
- `POST /simulate-many` — Body `{ satids[], durationSec, stepSec }` → multi-satellite propagation (server-side concurrency).  
- `GET /favourites` *(auth)* — List user’s favourite NORAD IDs.  
- `POST /favourites` *(auth)* — Add/ensure favourite `{ noradId }`.  
- `DELETE /favourites/:noradId` *(auth)* — Remove favourite.  

---

### Data types
- **One line description:**  
  The application uses a relational database (SQLite via Prisma) with structured tables for users, favourites, TLEs (satellites), and optional TLE history.  
- **Video timestamp:** *(Add)*  
- **Relevant files:**  
  - `prisma/schema.prisma`  

#### First kind
- **One line description:**  
  User Favourite Data  
- **Type:** Relational table (`User`)  
- **Rationale:** Stores a Users "Favourited" satellites in database  
- **Video timestamp:** *(Add)*  
- **Relevant files:**  
  - `prisma/schema.prisma`  

#### Second kind
- **One line description:**  
  Satellite Two-Line Elements (TLE) for propagation.  
- **Type:** Relational table (`Tle`)  
- **Rationale:** Persists NORAD ID, TLE line1/line2, epoch, and timestamps to support accurate SGP4 propagation.  
- **Video timestamp:** *(Add)*  
- **Relevant files:**  
  - `prisma/schema.prisma`  

---

### CPU intensive task
- **One line description:**  
  Propagating satellite positions from TLE data using the SGP4 algorithm, including batch propagation of multiple satellites.  
- **Video timestamp:** *(Add)*  
- **Relevant files:**  
  - `src/controllers/orbitsController.js`  
  - `src/routes/batch.js`  *(concurrent multi-satellite propagation)*

---

### CPU load testing
- **One line description:**  
  Stress test by calling `/simulate-many` with dozens/hundreds of NORAD IDs and small `stepSec` over large `durationSec` to sustain >80% CPU.  
- **Video timestamp:** *(Add)*  
- **Relevant files:**  
  - `src/routes/batch.js`

---

## Additional criteria
------------------------------------------------

### Extensive REST API features
- **One line description:** Not attempted  

---

### External API(s)
- **One line description:**  
  Integrates the CelesTrak **Visual** group feed (JSON) to refresh the local TLE database.  
- **Video timestamp:** *(Add)*  
- **Relevant files:**  
  - `src/controllers/tleController.js`

---

### Additional types of data
- **One line description:**  
  User favourites (NORAD IDs) and optional TLE history entries.  
- **Video timestamp:** *(Add)*  
- **Relevant files:**  
  - `prisma/schema.prisma`  

---

### Custom processing
- **One line description:** Not attempted  

---

### Infrastructure as code
- **One line description:** Not attempted  

---

### Web client
- **One line description:**  
  A static HTML/JS front-end with a sidebar search and an interactive Three.js globe to visualize single or batch orbits.  
- **Video timestamp:** *(Add)*  
- **Relevant files:**  
  - `public/index.html`  
  - `public/app.js`  
  - `public/style.css`  

---

### Upon request
- **One line description:** Not attempted  
