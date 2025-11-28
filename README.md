# Remote Video Library – Backend

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Docker](https://img.shields.io/badge/Docker-Production_Ready-blue.svg)](https://hub.docker.com/)

## Description

The backend server for the **Remote Video Library** project. Secure, private, and built with Node.js, Express, and MongoDB. Features user authentication with JWT, HLS streaming, video upload, per-user video management, and full REST API.

> **Note on Architecture:**
> This project was designed as a distributed cloud architecture where the client is public and connects to user-owned private servers. Currently, the project is configured for **self-hosted local deployment** (Localhost), giving you full control over your data and streaming infrastructure.
---

## Features

- 🔐 **JWT Authentication**: Secure signup, login, protected routes
- 🛡️ **User Isolation**: Each user accesses only their own videos
- 🎬 **HLS Streaming**: Adaptive bitrate (1080p, 720p, 480p, 360p)
- ⚡ **Async Processing**: Background transcoding with status polling
- 🖼️ **Thumbnails**: Static, custom, and animated previews (WebP)
- 💾 **Persisted Storage**: Local volume mapping for video persistence
- 📄 **Documentation**: Full Swagger/OpenAPI UI

---

## Setup & Installation

### 1. Clone the repository
```
git clone https://github.com/anp3l/remote-video-server.git
cd remote-video-server
```

### 2. Configuration

1. **Copy the example environment file:**
```
cp .env.example .env
```
2. **Generate a secure key using this command:**
```
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```
Copy the output and replace `your-very-secret-key` in the `.env` file.

### 3. Choose your Deployment Method

#### Option A: Docker (Recommended)
Includes **MongoDB** and **FFmpeg** pre-configured. Zero setup required.

- Build and start:
```
docker-compose up --build
```

- Server running at: [**http://localhost:3070**](http://localhost:3070)
- Swagger Docs: [**http://localhost:3070/docs**](http://localhost:3070/docs)
- **Persistence**: Videos are saved in `./uploads` on your host machine.

Docker Commands Cheat Sheet:
```
#Start (and rebuild if needed)
docker-compose up --build

#Stop containers
docker-compose down

#Full Reset (clean images & volumes)
docker-compose down -v --rmi all
```

#### Option B: Manual Setup
Requires **Node.js v16+**, **MongoDB**, and **FFmpeg**.

1. **Install dependencies:**
```
npm install
```

2. **Install FFmpeg:**
- Ensure `ffmpeg` with libx264/AAC support is in your PATH.
- Verify with: `ffmpeg -version`

3. **Start MongoDB:**
- Ensure MongoDB is running locally on port 27017.

4. **Start Server:**
```
npm start
```
---
## Configuration Architecture
The project separates configuration into two layers:
- **Sensitive (`.env`)**: Secrets like `JWT_SECRET` and `MONGO_URI` (git-ignored).
- **Application (`config/default.json`)**: Logic settings like allowed video formats.
---
## API Authentication

There are two ways to authenticate your requests when interacting with the Remote Video Library API:

### 1. Using Swagger UI for Authentication

- Open Swagger UI at `/docs`.
- Use the `/auth/signup` or `/auth/login` endpoint to obtain a JWT token.
- Click on the **Authorize** button (lock icon) in the top-right corner.
- Enter your JWT token in the format: `Bearer <your_token>`.
- Click **Authorize** to apply the token globally for all protected endpoints.
- You can now execute any protected API call directly from Swagger UI without manually adding the token each time.

### 2. Using Direct API Calls

- Obtain the JWT token by calling `/auth/signup` or `/auth/login` via your client (e.g., Postman, curl, frontend app).
- Include the JWT token in the Authorization header of each request to protected endpoints:
```
Authorization: Bearer <your_token>
```
---

## Video Processing & Streaming

### Adaptive Bitrate Streaming (ABR)

Videos are automatically transcoded into **4 quality levels** for optimal streaming experience:

| Quality | Resolution | Video Bitrate | Use Case                  |
|---------|------------|--------------|---------------------------|
| 1080p   | 1920x1080  | 5000 kbps    | Desktop, fiber connection |
| 720p    | 1280x720   | 2800 kbps    | Desktop, good connection  |
| 480p    | 854x480    | 1400 kbps    | Mobile, moderate connection |
| 360p    | 640x360    | 800 kbps     | Mobile, slow connection   |

**How it works:**  
- Videos are processed into HLS format with a master playlist named `{id}_master.m3u8`  
- The player automatically switches quality based on network conditions  
- Seamless quality transitions without buffering  
- Audio is automatically detected and processed; videos without audio are supported  

**Technical details:**  
- Codec: H.264 (libx264) with AAC audio  
- Segment duration: 4 seconds  
- GOP size: 48 frames for better seeking  
- Preset: medium (balance between quality and encoding speed)  

### Storage Requirements

Due to ABR, each video requires **~3-4 times** the original size:  
- Example: 100 MB original video → ~300-400 MB total storage  
- Each quality level generates separate `.ts` segments  
- Storage scales with video duration and quality settings  

### Secure Token System

Videos use **signed URLs** with HMAC-SHA256 and automatic refresh:  
- Initial token validity: 15 minutes  
- Tokens tied to user and video ID for security  
- Frontend refreshes tokens when less than 5 minutes remain  
- Refresh endpoint available at `POST /videos/:id/refresh-token` (JWT protected)  

---

## Main API Endpoints

| Method | Endpoint                       | Description                            |
| ------ | ------------------------------ | -------------------------------------- |
| POST   | `/auth/signup`                 | Register (username, email, password)   |
| POST   | `/auth/login`                  | Login (email, password)                |
| POST   | `/videos`                      | Upload video (JWT protected)           |
| GET    | `/videos`                      | List your videos (JWT protected)       |
| GET    | `/videos/:id`                  | Video details (JWT protected)          |
| PATCH  | `/videos/:id`                  | Edit metadata (JWT protected)          |
| PATCH  | `/videos/thumb/custom/:id`     | Upload custom thumbnail (JWT protected) |
| DELETE | `/videos/:id`                  | Delete video + assets (JWT protected)  |
| POST   | `/videos/:id/signed-url`       | Generate initial signed URLs for streaming and thumbnails (JWT protected)          |
| POST   | `/videos/:id/refresh-token`    | Refresh signed URL for extended playback (JWT protected)     |
| GET    | `/videos/stream/:id`           | HLS master playlist via signed URL auth (query: expires, signature, uid)            |
| GET    | `/videos/stream/:id/:file?`    | HLS segments/playlists via signed URL auth (query: expires, signature, uid)                             |
| GET    | `/videos/thumb/signed/:id`     | Serve static thumbnail via signed URL auth (WebP, query: expires, signature, uid)               |
| GET    | `/videos/thumb/static/:id`     | Static thumbnail .webp (JWT protected)  |
| GET    | `/videos/thumb/animated/:id`   | Animated thumbnail .webp (JWT protected)|
| GET    | `/videos/status/:id`           | Processing status (JWT protected)      |
| GET    | `/videos/duration/:id`         | Video duration in seconds (JWT protected)                 |
| GET    | `/videos/download/:id`         | Original video download with HTTP 206 support (JWT protected)     |

*All endpoints except `/auth/*` require authentication.*

- Full Swagger (OpenAPI) available at `/docs`.

---

## Video Upload Flow

1. **Upload** a video via `POST /videos`.  
   - The server responds immediately with basic video metadata and sets `videoStatus` to `"inProgress"`.  
   - The uploaded file is saved and referenced in the database for immediate queries.

2. **Asynchronous background processing** starts post-upload:  
   - Full metadata extraction (including duration and audio tracks)  
   - Static thumbnail generation (snapshot at 4 seconds)  
   - Video transcoding to 4 HLS adaptive bitrate quality levels  
   - Animated thumbnail generation (3 seconds preview GIF/WebP)  

3. Clients may **poll video status** via `/videos/status/:id` to track processing progress in real time.

4. On successful processing completion, `videoStatus` is updated to `"uploaded"`, signifying readiness for streaming.

---

## Usage

- Default API root: `http://localhost:3070`
- Test requests with [Postman](https://www.postman.com/) or similar
- Use the interactive Swagger docs to try endpoints

---

## Development

- Strict TypeScript, modular folder structure: models, routes, middleware
- All video files/derivatives are stored per-user for isolation/security

---

## Future Work

- Full-text and tag-based search
- User quotas, admin features
- Rate/abuse limiting

---

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.