# Remote Video Library – Backend

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## Description

The backend server for the **Remote Video Library** project. Secure, private, and built with Node.js, Express, and MongoDB. Features user authentication with JWT, HLS streaming, video upload, per-user video management, and full REST API.

---

## Features

- JWT authentication: signup, login, protected routes
- User management (each user can only access their own videos)
- Video upload, HLS transcoding, and async processing
- Metadata, tags, categories, thumbnails (static, custom, animated)
- Download (with HTTP 206 for partial)
- DELETE, PATCH, all CRUD for videos
- Full OpenAPI/Swagger docs

---

## Requirements

- **Node.js** v16 or higher  
- **MongoDB** instance (local or remote)  
- **ffmpeg** with libx264 and AAC support installed and available in PATH  
  - Required for video transcoding and thumbnail generation  
  - Check installation with `ffmpeg -version`  
- **Sufficient disk space** for multi-bitrate processing (about 3-4x original video size) 

---

## Setup

### 1. Clone the repository

git clone https://github.com/anp3l/remote-video-server.git

cd remote-video-server

### 2. Install dependencies

npm install

### 3. Environment variables

Create a `.env` file with:
JWT_SECRET=your-very-secret-key
PORT=3070
MONGO_URI=mongodb://127.0.0.1:27017/videoLibrary

Or use `/config/config.json` as alternative.

### 4. Start MongoDB

Start MongoDB locally or connect to a remote instance.

### 5. Run the server

npm run dev

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

  
  Authorization: Bearer <your_token>

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

- Full Swagger (OpenAPI) available at `/docs` (if enabled).

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
- Docker and deployment configs

---

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

---

## Author

Built by [Andrea](https://github.com/anp3l)  
Part of the **Remote Video Library** project suite (see `https://github.com/anp3l/remote-video-client.git`)

---

*Contributions and suggestions welcome!*