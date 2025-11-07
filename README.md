# Remote Video Library - Backend

## Description
This is the backend of the Remote Video Library project, designed for local video management and storage. The backend is built with Node.js and uses MongoDB with Mongoose to store video metadata.

## Current Features
- CRUD operations for videos (create, read, update, delete)
- Multiple video file uploads on local server
- Metadata storage in MongoDB
- RESTful API for frontend interaction

## Current Status
- Backend is fully functional and tested locally
- Authentication and access control **not yet implemented**

## Configuration
The backend uses a JSON configuration file located in the `config` folder with the following active parameters:

```json
{
  "port": 3070,
  "mongo": "mongodb://127.0.0.1:27017/videoLibrary",
  "alloweVideoTypes": "mp4|mov|avi",
  "alloweThumbTypes": "jpg|jpeg|png|webp"
}
```

- `port`: Server port (default: 3070)
- `mongo`: MongoDB connection URI
- `alloweVideoTypes`: Allowed video file types for upload (pipe-separated)
- `alloweThumbTypes`: Allowed image file types for thumbnails

## Prerequisites
- Node.js (recommended version 16 or higher)
- Running MongoDB instance (local or remote)

## Installation
1. Clone the repository
2. Install dependencies: `npm install`
3. Configure the `config` file as needed
4. Start the server: `npm start`

## Usage
- APIs are available at `http://localhost:3070` by default
- Endpoint documentation to be added
- No authentication required at this stage

## Future Work
- Implement authentication system (e.g., JWT)
- Integrate with Angular frontend
- Improve security and user management


