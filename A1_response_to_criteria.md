
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
  Provides REST endpoints to query TLE data, propagate satellites, and manage users.  
- **Video timestamp:** *(Add)*  
- **Relevant files:**  
  - `src/routes/index.js`  
  - `src/routes/tle.js`  
  - `src/routes/orbits.js`  

---

### Data types
- **One line description:**  
  The application uses a relational database (SQLite/Prisma) with structured tables for satellites, users, and position snapshots.  
- **Video timestamp:** *(Add)*  
- **Relevant files:**  
  - `prisma/schema.prisma`  

#### First kind
- **One line description:**  
  User account and authentication data.  
- **Type:** Relational table (`User`)  
- **Rationale:** Stores email, password hash, roles, and refresh token versioning for authentication.  
- **Video timestamp:** *(Add)*  
- **Relevant files:**  
  - `prisma/schema.prisma`  

#### Second kind
- **One line description:**  
  Satellite orbital element data.  
- **Type:** Relational table (`Tle`)  
- **Rationale:** Stores NORAD IDs, TLE lines, and timestamps to propagate satellite positions accurately.  
- **Video timestamp:** *(Add)*  
- **Relevant files:**  
  - `prisma/schema.prisma`  

---

### CPU intensive task
- **One line description:**  
  Propagating satellite positions from TLE data using the SGP4 algorithm for multiple satellites and timestamps.  
- **Video timestamp:** *(Add)*  
- **Relevant files:**  
  - `src/controllers/orbitsController.js` (uses `satellite.propagate`)  
  - `src/workers/orbit-burn-worker.js`  
  - `src/utils/orbitMath.js`  

---

### CPU load testing
- **One line description:**  
  Stress testing by requesting propagation of many satellites over fine time steps to exceed 80% CPU usage for several minutes.  
- **Video timestamp:** *(Add)*  
- **Relevant files:**  
  - `scripts/loadtest.sh` *(or your load testing script if separate)*  
  - `src/routes/batch.js`  

---

## Additional criteria
------------------------------------------------

### Extensive REST API features
- **One line description:** Not attempted  

---

### External API(s)
- **One line description:** Not attempted  

---

### Additional types of data
- **One line description:** Not attempted  

---

### Custom processing
- **One line description:** Not attempted  

---

### Infrastructure as code
- **One line description:** Not attempted  

---

### Web client
- **One line description:**  
  A static HTML/JS front-end with Montserrat-styled sidebar, satellite search, and an interactive Three.js globe to visualize orbits.  
- **Video timestamp:** *(Add)*  
- **Relevant files:**  
  - `public/index.html`  
  - `public/app.js`  
  - `public/style.css`  

---

### Upon request
- **One line description:** Not attempted  
