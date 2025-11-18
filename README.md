# Remote Video Library – Backend

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

- Node.js v16 or higher
- MongoDB instance (local or remote)
- [ffmpeg](https://ffmpeg.org/) available in your PATH

---

## Setup

1. **Clone the repository** `https://github.com/andrea-peluso/remote-video-server.git`
2. **Install dependencies** `npm install`
3. **Environment variables** 
Create a `.env` file with:
JWT_SECRET=your-very-secret-key
PORT=3070
MONGO_URI=mongodb://127.0.0.1:27017/videoLibrary

Or use `/config/config.json` as alternative.

4. **Start MongoDB**
5. **Start the server** `npm run dev`

---

## API Authentication

Obtain a JWT via `/auth/signup` or `/auth/login`.  
Add this header to **every** video request:

Authorization: Bearer <token>

---

## Main API Endpoints

| Method | Endpoint                       | Description                            |
| ------ | ------------------------------ | -------------------------------------- |
| POST   | `/auth/signup`                 | Register (username, email, password)   |
| POST   | `/auth/login`                  | Login (email, password)                |
| GET    | `/videos`                      | List your videos                       |
| POST   | `/videos`                      | Upload video(s)                        |
| GET    | `/videos/:id`                  | Video details                          |
| PATCH  | `/videos/:id`                  | Edit metadata                          |
| DELETE | `/videos/:id`                  | Delete video + assets                  |
| GET    | `/videos/stream/:id/:file?`    | HLS stream                             |
| GET    | `/videos/thumb/static/:id`     | Static thumbnail (.webp)               |
| PATCH  | `/videos/thumb/custom/:id`     | Upload custom thumbnail                |
| GET    | `/videos/thumb/animated/:id`   | Animated thumbnail (.webp)             |
| GET    | `/videos/status/:id`           | Processing status (light polling)      |
| GET    | `/videos/duration/:id`         | Video duration (secs)                  |
| GET    | `/videos/download/:id`         | Original video download (HTTP 206)     |

*All endpoints except `/auth/*` require authentication.*

- Full Swagger (OpenAPI) available at `/docs` (if enabled).

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

MIT or similar – see LICENSE.

---

## Author

Built by [Andrea](https://github.com/andrea-peluso)  
Part of the **Remote Video Library** project suite (see `https://github.com/andrea-peluso/remote-video-client.git`)

---

*Pull requests and suggestions welcome!*