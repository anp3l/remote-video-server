# Remote Video Library – Video Server

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Docker](https://img.shields.io/badge/Docker-Supported-2496ED?logo=docker&logoColor=white)](#option-a-docker)


## Description

A standalone **Video Resource Server** built for secure video management, processing, and HLS streaming.

Originally developed as part of the **Remote Video Library** ecosystem, this service is intentionally designed to be **reusable as-is** in other projects that need a private video backend (upload, transcoding, storage, streaming) with stateless authentication.

**Key responsibilities:**
- Validates **RS256 JWT** access tokens issued by an external Identity Provider (e.g., the Remote Video Library Auth Server).
- Handles video upload, transcoding, and persisted storage.
- Serves HLS playback securely via **HMAC-signed URLs** (separate from JWT auth).

> **Architecture note**
> This service is stateless with respect to user credentials: it does not manage passwords or sessions. It relies on cryptographic verification of JWTs via an RSA Public Key (provided via environment variable or file).
---

## Authentication Standard (JWT Requirements)

To use this Video Server with your own Identity Provider (IdP), your JWTs must meet the following standard:

1. **Algorithm:** `RS256` (RSA Signature with SHA-256).
2. **Required Claims:**
   `userId` (string): Unique identifier for the user (used for data isolation).
3. **Verification:** You must provide the IdP's RSA Public Key to this server (via `PUBLIC_KEY_BASE64` environment variable or `public.pem` file).

**Example Payload:**
```
{
  "userId": "65a123456789abcdef123456",  // MongoDB ObjectId
  "username": "johndoe",
  "iat": 1704239022,                     // Issued At (Timestamp)
  "exp": 1704843822                      // Expiration (7 days later)
}
```

---

## Features

- 🔐 **RSA Token Verification**: Validates JWTs signed by the external Auth Server
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
   Copy the output and replace `STREAM_SECRET` in the `.env` file.
3. **Configure the Auth Public Key (Crucial):**
   This server requires the **Public Key** from the Auth Server to verify tokens.

   **Recommended (Environment Variable):**
   Get the Base64 string of the public key (from the Auth Server Setup) and add it to your `.env`:
   ```
   PUBLIC_KEY_BASE64=... (paste the long base64 string here)
   ```
   **Alternative (File-based for local dev):**
   Copy `public.pem` from the `auth-server` project to the root of this project.


### 3. Choose your Deployment Method

#### Option A: Docker (Recommended)
Includes **MongoDB** and **FFmpeg** pre-configured. 

> **Note:** Ensure `PUBLIC_KEY_BASE64` is set in your `.env` file before starting.

- **Build and start:**
   ```
   docker-compose up --build
   ```
- **Server running at:** [**http://localhost:3070**](http://localhost:3070)
- **Swagger Docs:** [**http://localhost:3070/api-docs**](http://localhost:3070/api-docs)
- **Persistence**: Videos are saved in `./uploads` on your host machine.

**Docker Commands Cheat Sheet:**
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
- **Auth Key**: `PUBLIC_KEY_BASE64` (in `.env`) or `public.pem` (fallback) is used to verify JWT signatures.
- **Environment (`.env`)**: Contains `STREAM_SECRET` (HMAC key for video URL signing) and DB connection strings.
- **App Config (`config/default.json`)**: Application logic settings (allowed formats, max sizes).

---
## API Authentication

This server acts as a Resource Server. It does not issue tokens.

### How to Authenticate Requests

- **Login** via the separate **Auth Server** (running on port 4000) to obtain a JWT.
- **Include** the JWT in the Authorization header for all requests to this server:

   ```
   Authorization: Bearer <your_rsa_signed_token>
   ```

### 2. Using Swagger UI

- Open Swagger UI at `/api-docs`.
- Click **Authorize**.
- Paste the token obtained from the Auth Server.
- You can now test video endpoints directly.
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

Streaming playback is protected by **Signed URLs** (HMAC-SHA256), separate from the main JWT auth. 
- The `STREAM_SECRET` in `.env` is used to sign these URLs.
- Tokens expire after 15 minutes (default) and must be refreshed via the API. 
- Frontend refreshes tokens when less than 5 minutes remain  
- Refresh endpoint available at `POST /videos/:id/refresh-token` (JWT protected)  

---

## API Endpoints

**Note**: All endpoints below require a valid JWT Bearer token.

| Method | Endpoint                       | Description                            |
| ------ | ------------------------------ | -------------------------------------- |
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


- **Full Swagger (OpenAPI) available at:** `http://localhost:3070/api-docs`
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

## Roadmap & Future Architecture

### Upcoming Features
- 🔍 **Advanced Search**: Full-text and tag-based search for video libraries.
- 📊 **Quotas & Limits**: User storage quotas and rate limiting for API abuse prevention.
- 👮 **Admin Dashboard**: Global management features for instance administrators.

### Architecture Evolution: JWKS (JSON Web Key Sets)
Currently, this server uses a static Public Key (`PUBLIC_KEY_BASE64`) for verifying tokens. To support a seamless "Bring Your Own Server" model in the future:

1. **Decentralization**: We will transition to the **OpenID Connect / JWKS** standard.
2. **Automatic Config**: The Video Server will fetch public keys dynamically from the Auth Server's `/.well-known/jwks.json` endpoint.
3. **Benefit**: Users will deploy their own instances by simply providing the Auth Server URL, eliminating manual key management and enabling automatic key rotation.


---

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
