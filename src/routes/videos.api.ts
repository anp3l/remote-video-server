import express from 'express';
import  fs from "fs";
import  path from "path";
import { File } from "../models/data.model";
import {
  VIDEO_PATH,
  makeMulterUploadMiddleware,
  uploadThumb,
  uploadVideoWithThumb
} from "../server.settings";
import { verifyToken, AuthRequest, verifySignedUrl } from "../middleware/auth.middleware";
import * as videoUtils from '../utils/videoUtils';
import { generateSignedUrl } from '../utils/signedUrl';
import { ENABLE_LOGS } from '../config/env';

type MulterFile = Express.Multer.File;


export const routeVideos = express.Router();

/**
 * @swagger
 * /videos:
 *   post:
 *     summary: Upload a single video with optional thumbnail
 *     description: Upload one video with optional thumbnail. The video is processed asynchronously to generate HLS streams, static and animated thumbnails.
 *     tags: [Videos]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required:
 *               - videos
 *             properties:
 *               videos:
 *                 type: string
 *                 format: binary
 *                 description: Video file to upload (max 500MB)
 *               thumbnail:
 *                 type: string
 *                 format: binary
 *                 description: Optional custom thumbnail (max 5MB)
 *               title:
 *                 type: string
 *                 description: Video title
 *                 example: "My video"
 *               description:
 *                 type: string
 *                 description: Video description
 *                 example: "Detailed content description"
 *               tags:
 *                 type: string
 *                 description: Comma-separated tags
 *                 example: "tutorial,angular,typescript"
 *               category:
 *                 type: string
 *                 description: Video category
 *                 example: "programming"
 *     responses:
 *       200:
 *         description: Video uploaded successfully and processing
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 result:
 *                   type: object
 *                   properties:
 *                     ok:
 *                       type: number
 *                       description: Number of videos uploaded (always 1)
 *                 op:
 *                   type: object
 *                   properties:
 *                     _id:
 *                       type: string
 *                       description: Video ID
 *                     title:
 *                       type: string
 *                     description:
 *                       type: string
 *                     tags:
 *                       type: array
 *                       items:
 *                         type: string
 *                     category:
 *                       type: string
 *                     videoStatus:
 *                       type: string
 *                       enum: [processing, uploaded, error]
 *                       description: Video processing status
 *                     permalink:
 *                       type: string
 *                       description: Video permalink URL
 *                 insertedCount:
 *                   type: number
 *                   description: Total number of videos inserted (always 1)
 *       400:
 *         description: No files received or insertion error
 *       401:
 *         description: Missing or invalid token
 *       413:
 *         description: File too large
 *       500:
 *         description: Error during upload
 */
routeVideos.post(
  "/videos",
  verifyToken,
  makeMulterUploadMiddleware(
    uploadVideoWithThumb.fields([
      { name: 'videos', maxCount: 1 },
      { name: 'thumbnail', maxCount: 1 }
    ])
  ),
  async (req: AuthRequest, res, next) => {

    const userId = req.userId;

    const files = req.files as { [key: string]: MulterFile[] } | undefined;

    if (!files || !files.videos || files.videos.length === 0) {
      return res.status(400).json({ error: "No files received" });
    }

    const videoFile = files.videos[0];
    const thumbnailFile = files.thumbnail?.[0];

    if (thumbnailFile && thumbnailFile.size > 5 * 1024 * 1024) {
      fs.unlinkSync(thumbnailFile.path);
      return res.status(413).json({ 
        error: "Thumbnail too large",
        message: "Thumbnail must be maximum 5 MB" 
      });
    }

    const { title, description, tags, category } = req.body;
    let parsedTags: string[] = [];
    if (tags) {
      if (Array.isArray(tags)) {
        parsedTags = tags;
      } else if (typeof tags === 'string') {
        try {
          parsedTags = JSON.parse(tags);
        } catch {
          parsedTags = tags.split(',').map(tag => tag.trim()).filter(tag => tag);
        }
      }
    }

    const data = {
      ...videoFile,
      userId: userId,
      videoStatus: "inProgress",
      title: title || "",
      description: description || "",
      tags: parsedTags,
      category: category || "",
    };

    try {
      const doc = await File.create(data);
      // Fire-and-forget async processing

      videoUtils.createVideo(doc, thumbnailFile?.path).catch((err) => {
        console.error("Video processing failed:", err);
      });

      const op = {
        ...doc.toObject(),
        permalink: `https://${req.headers.host}/videos/${doc._id}`,
      };

      res.json({
        result: { ok: 1 },
        op,
        insertedCount: 1,
      });
    } catch (e) {
      console.error('MongoDB insert error:', e);
      res.status(400).json({ error: "Insert failed", details: e });
    }
  }
);

/**
 * @swagger
 * /videos/thumb/custom/{id}:
 *   patch:
 *     summary: Upload a custom thumbnail for an existing video
 *     description: Replaces the automatic thumbnail with a custom one. The file is converted to WebP and processed in the background.
 *     tags: [Videos]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: MongoDB ID of the video
 *         example: "507f1f77bcf86cd799439011"
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required:
 *               - thumbnail
 *             properties:
 *               thumbnail:
 *                 type: string
 *                 format: binary
 *                 description: Thumbnail image file (max 500MB, supported formats jpg, png, webp)
 *     responses:
 *       200:
 *         description: Thumbnail is being processed
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Thumbnail update in progress"
 *       400:
 *         description: No thumbnail file uploaded
 *       401:
 *         description: Missing or invalid token
 *       403:
 *         description: Not authorized to modify this video
 *       404:
 *         description: Video not found
 *       413:
 *         description: File too large
 *       500:
 *         description: Error saving the thumbnail
 */
routeVideos.patch(
  "/videos/thumb/custom/:id",
  verifyToken,
  makeMulterUploadMiddleware(uploadThumb.single("thumbnail")),
  async (req: AuthRequest, res) => {
    const { id } = req.params;
    const file = req.file;
    const userId = req.userId;

    // Check if the video exists
    const video = await File.findById(id);
    if (!video) {
      return res.status(404).json({ error: "Video not found" });
    }

    // Check ownership: user can only update their own videos
    if (video.userId.toString() !== userId) {
      return res.status(403).json({ error: "Not authorized to modify this video" });
    }

    // Check if file exists
    if (!file) {
      return res.status(400).json({ error: "No thumbnail file uploaded" });
    }

    try {
      // Create custom thumbnail in the background
      videoUtils
        .createCustomThumbnail(file.path, id)
        .catch((err) => {
          console.error("Error creating custom thumbnail:", err);
        });

      // Respond with a success message
      res.json({ message: "Thumbnail update in progress" });
    } catch (err) {
      console.error("Error saving custom thumbnail:", err);
      res.status(500).json({ error: "Failed to save custom thumbnail" });
    }
  }
);


/**
 * @swagger
 * /videos/{id}:
 *   patch:
 *     summary: Update video metadata
 *     description: Partially updates metadata of an existing video (title, description, tags, category). Only provided fields will be updated.
 *     tags: [Videos]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: MongoDB ID of the video to update
 *         example: "507f1f77bcf86cd799439011"
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               title:
 *                 type: string
 *                 description: New video title
 *                 example: "Angular 20 Tutorial"
 *               description:
 *                 type: string
 *                 description: New video description
 *                 example: "Complete guide to Angular 20"
 *               tags:
 *                 type: array
 *                 items:
 *                   type: string
 *                 description: New video tags
 *                 example: ["angular", "typescript", "tutorial"]
 *               category:
 *                 type: string
 *                 description: New video category
 *                 example: "programming"
 *           examples:
 *             updateTitle:
 *               summary: Update only the title
 *               value:
 *                 title: "New video title"
 *             updateAll:
 *               summary: Update all fields
 *               value:
 *                 title: "Complete tutorial"
 *                 description: "Detailed description"
 *                 tags: ["angular", "web-dev"]
 *                 category: "tutorial"
 *             updateTags:
 *               summary: Update only tags
 *               value:
 *                 tags: ["javascript", "frontend"]
 *     responses:
 *       200:
 *         description: Video successfully updated
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 _id:
 *                   type: string
 *                 title:
 *                   type: string
 *                 description:
 *                   type: string
 *                 tags:
 *                   type: array
 *                   items:
 *                     type: string
 *                 category:
 *                   type: string
 *                 videoStatus:
 *                   type: string
 *                 hls:
 *                   type: string
 *                 static_thumbnail:
 *                   type: string
 *                 animated_thumbnail:
 *                   type: string
 *                 custom_thumbnail:
 *                   type: string
 *                 duration:
 *                   type: number
 *                 createdAt:
 *                   type: string
 *                   format: date-time
 *       401:
 *         description: Missing or invalid token
 *       403:
 *         description: Not authorized to modify this video
 *       404:
 *         description: Video not found
 *       500:
 *         description: Error during update
 */
routeVideos.patch(
  "/videos/:id",
  verifyToken,
  async (req: AuthRequest, res) => {
    const { id } = req.params;
    const { title, description, tags, category } = req.body;
    const userId = req.userId;

    try {
      // First, find the video to check ownership
      const video = await File.findById(id);
      
      if (!video) {
        return res.status(404).json({ error: "Video not found" });
      }

      // Check ownership
      if (video.userId.toString() !== userId) {
        return res.status(403).json({ error: "Not authorized to modify this video" });
      }

      // Build updates object
      const updates: any = {};
      if (title !== undefined) updates.title = title;
      if (description !== undefined) updates.description = description;
      if (category !== undefined) updates.category = category;
      if (tags !== undefined) updates.tags = tags;

      // Update the video
      const updatedVideo = await File.findByIdAndUpdate(
        id,
        { $set: updates },
        { new: true, runValidators: true }
      );

      res.json(updatedVideo);
    } catch (error) {
      console.error("Video update error:", error);
      res.status(500).json({ error: "Error during update" });
    }
  }
);


/**
 * @swagger
 * /videos/stream/{id}/{file}:
 *   get:
 *     summary: Stream HLS video or segments
 *     description: Serves the master playlist file (.m3u8) or video segments (.ts) for HLS streaming. Uses signed URL authentication via query parameters (no JWT required).
 *     tags: [Videos]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: MongoDB ID of the video
 *         example: "507f1f77bcf86cd799439011"
 *       - in: path
 *         name: file
 *         required: false
 *         schema:
 *           type: string
 *         description: Specific file name (segment .ts or playlist .m3u8). If omitted, serves main master playlist
 *         example: "507f1f77bcf86cd799439011_v0_001.ts"
 *       - in: query
 *         name: expires
 *         required: true
 *         schema:
 *           type: string
 *         description: Expiration timestamp (milliseconds since epoch)
 *         example: "1700000000000"
 *       - in: query
 *         name: signature
 *         required: true
 *         schema:
 *           type: string
 *         description: HMAC-SHA256 signature for URL verification
 *         example: "a3f5b8c2d1e4f7a9b2c5d8e1f4a7b0c3"
 *       - in: query
 *         name: uid
 *         required: true
 *         schema:
 *           type: string
 *         description: User ID who owns the video
 *         example: "507f1f77bcf86cd799439011"
 *     responses:
 *       200:
 *         description: Video stream or playlist
 *         content:
 *           application/vnd.apple.mpegurl:
 *             schema:
 *               type: string
 *               format: binary
 *               description: HLS playlist file (.m3u8)
 *           video/MP2T:
 *             schema:
 *               type: string
 *               format: binary
 *               description: HLS video segment (.ts)
 *       401:
 *         description: Missing or invalid signature parameters
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: "Missing signature parameters"
 *       403:
 *         description: Not authorized to view this video
 *       404:
 *         description: Video or file not found
 *       423:
 *         description: Video processing not completed yet
 *       500:
 *         description: Error streaming video
 * /videos/stream/{id}:
 *   get:
 *     summary: Stream main HLS master playlist
 *     description: Serves the master playlist file (.m3u8) of the video. Uses signed URL authentication.
 *     tags: [Videos]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: MongoDB ID of the video
 *         example: "507f1f77bcf86cd799439011"
 *       - in: query
 *         name: expires
 *         required: true
 *         schema:
 *           type: string
 *         description: Expiration timestamp (milliseconds since epoch)
 *         example: "1700000000000"
 *       - in: query
 *         name: signature
 *         required: true
 *         schema:
 *           type: string
 *         description: HMAC-SHA256 signature for URL verification
 *         example: "a3f5b8c2d1e4f7a9b2c5d8e1f4a7b0c3"
 *       - in: query
 *         name: uid
 *         required: true
 *         schema:
 *           type: string
 *         description: User ID who owns the video
 *         example: "507f1f77bcf86cd799439011"
 *     responses:
 *       200:
 *         description: Master HLS playlist
 *       401:
 *         description: Invalid signed URL
 *       403:
 *         description: Not authorized
 *       404:
 *         description: Video not available
 *       423:
 *         description: Video processing in progress
 */
routeVideos.get(
  "/videos/stream/:id/:file?",
  verifySignedUrl,
  async (req: AuthRequest, res) => {
    const { id, file } = req.params;
    const userId = req.userId;

    try {
      const fileData = await File.findById(id);
      
      if (!fileData || !fileData.hls) {
        return res.status(404).json({ error: "Video not available" });
      }

      // Check ownership
      if (fileData.userId.toString() !== userId) {
        return res.status(403).json({ error: "Not authorized to view this video" });
      }

      if (fileData.videoStatus !== "uploaded") {
        return res
          .status(423)
          .json({ error: "Video processing not completed yet" });
      }

      const baseDir = path.join(VIDEO_PATH, id);
      const filePath = file
        ? path.join(baseDir, file)
        : path.join(baseDir, fileData.hls); // .m3u8 file

      if (!fs.existsSync(filePath)) {
        return res.status(404).json({ error: "File not found" });
      }

      const MIME_TYPES: { [key: string]: string } = {
        ts: "video/MP2T",
        m3u8: "application/vnd.apple.mpegurl",
      };

      const ext = path.extname(filePath).slice(1);
      res.setHeader(
        "Content-Type",
        MIME_TYPES[ext] || "application/octet-stream"
      );

      fs.createReadStream(filePath).pipe(res);
    } catch (e) {
      res.status(500).json({ error: "Error streaming video", details: e });
    }
  }
);

/**
 * @swagger
 * /videos/thumb/signed/{id}:
 *   get:
 *     summary: Serve static thumbnail via signed URL
 *     description: Returns the static thumbnail in WebP format using signed URL authentication. This endpoint is used by the video player and requires signature, expiration, and user ID query parameters. Priority - 1) Custom thumbnail (if uploaded), 2) Automatically generated thumbnail.
 *     tags: [Videos]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: MongoDB ID of the video
 *         example: "507f1f77bcf86cd799439011"
 *       - in: query
 *         name: expires
 *         required: true
 *         schema:
 *           type: number
 *         description: Unix timestamp when the URL expires
 *         example: 1700000000000
 *       - in: query
 *         name: signature
 *         required: true
 *         schema:
 *           type: string
 *         description: HMAC-SHA256 signature for URL verification
 *         example: "a3f5b8c2d1e4f7a9b2c5d8e1f4a7b0c3d6e9f2a5b8c1d4e7f0a3b6c9d2e5f8a1"
 *       - in: query
 *         name: uid
 *         required: true
 *         schema:
 *           type: string
 *         description: User ID who generated the signed URL
 *         example: "507f1f77bcf86cd799439011"
 *     responses:
 *       200:
 *         description: Thumbnail image in WebP format
 *         content:
 *           image/webp:
 *             schema:
 *               type: string
 *               format: binary
 *               description: WebP thumbnail image file (custom or auto-generated)
 *       401:
 *         description: Missing or invalid signature parameters
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   enum:
 *                     - "Missing signature parameters"
 *                     - "Signed URL expired"
 *                     - "Invalid signature"
 *                   example: "Signed URL expired"
 *       403:
 *         description: Not authorized to view this video
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: "Not authorized to view this video"
 *       404:
 *         description: Thumbnail not available or file not found
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   enum:
 *                     - "Thumbnail not available"
 *                     - "Thumbnail file not found"
 *                   example: "Thumbnail not available"
 *       500:
 *         description: Internal error - thumbnail unexpectedly missing
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: "Static thumbnail missing unexpectedly"
 */
routeVideos.get(
  "/videos/thumb/signed/:id",
  verifySignedUrl,
  async (req: AuthRequest, res) => {
    const id = req.params.id;
    const userId = req.userId;
    
    const file = await File.findById(id);

    if (!file || file.videoStatus !== "uploaded") {
      return res.status(404).json({ error: "Thumbnail not available" });
    }

    // Check ownership
    if (file.userId.toString() !== userId) {
      return res.status(403).json({ error: "Not authorized to view this video" });
    }

    // Check custom thumbnail exists
    const customThumbPath = path.join(VIDEO_PATH, id, `${id}_custom.webp`);
    if (fs.existsSync(customThumbPath)) {
      res.setHeader("Content-Type", "image/webp");
      return fs.createReadStream(customThumbPath).pipe(res);
    }

    if (!file.static_thumbnail) {
      return res.status(500).json({ error: "Static thumbnail missing unexpectedly" });
    }

    const defaultThumbPath = path.join(VIDEO_PATH, id, file.static_thumbnail);
    if (fs.existsSync(defaultThumbPath)) {
      res.setHeader("Content-Type", "image/webp");
      return fs.createReadStream(defaultThumbPath).pipe(res);
    }

    return res.status(404).json({ error: "Thumbnail file not found" });
  }
);

/**
 * @swagger
 * /videos/thumb/{id}:
 *   get:
 *     summary: Serve static thumbnail of a video
 *     description: Returns the static thumbnail in WebP format. Priority - 1) Custom thumbnail (if uploaded), 2) Automatically generated thumbnail
 *     tags: [Videos]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: MongoDB ID of the video
 *         example: "507f1f77bcf86cd799439011"
 *     responses:
 *       200:
 *         description: Thumbnail image in WebP format
 *         content:
 *           image/webp:
 *             schema:
 *               type: string
 *               format: binary
 *               description: WebP thumbnail image file (custom or auto-generated)
 *       401:
 *         description: Missing or invalid token
 *       403:
 *         description: Not authorized to view this video
 *       404:
 *         description: Thumbnail not available or file not found
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   enum:
 *                     - "Thumbnail not available"
 *                     - "Thumbnail file not found"
 *                   example: "Thumbnail not available"
 *       500:
 *         description: Internal error - thumbnail unexpectedly missing
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: "Static thumbnail missing unexpectedly"
 */
routeVideos.get(
  "/videos/thumb/static/:id",
  verifyToken,
  async (req: AuthRequest, res) => {
    const id = req.params.id;
    const userId = req.userId;
    
    const file = await File.findById(id);

    if (!file || file.videoStatus !== "uploaded") {
      return res.status(404).json({ error: "Thumbnail not available" });
    }

    // Check ownership
    if (file.userId.toString() !== userId) {
      return res.status(403).json({ error: "Not authorized to view this video" });
    }

    // Check custom thumbnail exists
    const customThumbPath = path.join(VIDEO_PATH, id, `${id}_custom.webp`);
    if (fs.existsSync(customThumbPath)) {
      res.setHeader("Content-Type", "image/webp");
      return fs.createReadStream(customThumbPath).pipe(res);
    }

    if (!file.static_thumbnail) {
      return res.status(500).json({ error: "Static thumbnail missing unexpectedly" });
    }

    const defaultThumbPath = path.join(VIDEO_PATH, id, file.static_thumbnail);
    if (fs.existsSync(defaultThumbPath)) {
      res.setHeader("Content-Type", "image/webp");
      return fs.createReadStream(defaultThumbPath).pipe(res);
    }

    return res.status(404).json({ error: "Thumbnail file not found" });
  }
);


/**
 * @swagger
 * /videos/thumb/animated/{id}:
 *   get:
 *     summary: Serve animated thumbnail of a video
 *     description: Returns the animated thumbnail in WebP format. Automatically generated during video processing (first 3 seconds at 10fps).
 *     tags: [Videos]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: MongoDB ID of the video
 *         example: "507f1f77bcf86cd799439011"
 *     responses:
 *       200:
 *         description: Animated thumbnail in WebP format
 *         content:
 *           image/webp:
 *             schema:
 *               type: string
 *               format: binary
 *               description: Animated WebP file (3 seconds at 10fps)
 *       401:
 *         description: Missing or invalid token
 *       403:
 *         description: Not authorized to view this video
 *       404:
 *         description: Animated thumbnail not available or file not found
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   enum:
 *                     - "Animated thumbnail not available yet"
 *                     - "Animated thumbnail not found"
 *                   example: "Animated thumbnail not available yet"
 *       500:
 *         description: Internal error - animated thumbnail unexpectedly missing
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: "Animated thumbnail missing unexpectedly"
 */
routeVideos.get(
  "/videos/thumb/animated/:id",
  verifyToken,
  async (req: AuthRequest, res) => {
    const id = req.params.id;
    const userId = req.userId;

    const file = await File.findById(id);
    
    if (!file || file.videoStatus !== "uploaded") {
      return res
        .status(404)
        .json({ error: "Animated thumbnail not available yet" });
    }

    // Check ownership
    if (file.userId.toString() !== userId) {
      return res.status(403).json({ error: "Not authorized to view this video" });
    }

    if (!file.animated_thumbnail) {
      return res.status(500).json({ error: "Animated thumbnail missing unexpectedly" });
    }

    const animatedPath = path.join(VIDEO_PATH, id, file.animated_thumbnail);
    if (!fs.existsSync(animatedPath)) {
      return res.status(404).json({ error: "Animated thumbnail not found" });
    }

    res.setHeader("Content-Type", "image/webp");
    fs.createReadStream(animatedPath).pipe(res);
  }
);



/**
 * @swagger
 * /videos/download/{id}:
 *   get:
 *     summary: Download original video
 *     description: Download the video in original quality. Supports range requests (HTTP 206) for partial downloads and resume. The file name will be the video title.
 *     tags: [Videos]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: MongoDB ID of the video
 *         example: "507f1f77bcf86cd799439011"
 *       - in: header
 *         name: Range
 *         required: false
 *         schema:
 *           type: string
 *         description: Header to request only a portion of the file (e.g. "bytes=0-1023" for first 1024 bytes)
 *         example: "bytes=0-1048575"
 *     responses:
 *       200:
 *         description: Full video download
 *         headers:
 *           Content-Length:
 *             schema:
 *               type: integer
 *             description: Total file size in bytes
 *           Content-Type:
 *             schema:
 *               type: string
 *             description: MIME type of the video
 *             example: "video/mp4"
 *           Content-Disposition:
 *             schema:
 *               type: string
 *             description: Header forcing download with video name
 *             example: "attachment; filename=\"My video.mp4\""
 *         content:
 *           video/mp4:
 *             schema:
 *               type: string
 *               format: binary
 *               description: Complete original video file
 *       206:
 *         description: Partial video download (range request)
 *         headers:
 *           Content-Range:
 *             schema:
 *               type: string
 *             description: Range of bytes returned
 *             example: "bytes 0-1048575/52428800"
 *           Accept-Ranges:
 *             schema:
 *               type: string
 *             description: Indicates server supports range requests
 *             example: "bytes"
 *           Content-Length:
 *             schema:
 *               type: integer
 *             description: Size of the chunk returned
 *           Content-Type:
 *             schema:
 *               type: string
 *             example: "video/mp4"
 *           Content-Disposition:
 *             schema:
 *               type: string
 *             example: "attachment; filename=\"My video.mp4\""
 *         content:
 *           video/mp4:
 *             schema:
 *               type: string
 *               format: binary
 *               description: Requested portion of the video file
 *       401:
 *         description: Missing or invalid token
 *       403:
 *         description: Not authorized to download this video
 *       404:
 *         description: Video or file not found
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   enum:
 *                     - "Video not found"
 *                     - "Video file not found"
 *                   example: "Video not found"
 *       500:
 *         description: Error during download
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: "Error during download"
 */
routeVideos.get(
  "/videos/download/:id",
  verifyToken,
  async (req: AuthRequest, res) => {
    const { id } = req.params;
    const userId = req.userId;

    try {
      const video = await File.findById(id);
      
      if (!video || !video.original_video) {
        return res.status(404).json({ error: "Video not found" });
      }

      // Check ownership
      if (video.userId.toString() !== userId) {
        return res.status(403).json({ error: "Not authorized to download this video" });
      }

      const videoPath = path.join(VIDEO_PATH, id, video.original_video);
      
      if (!fs.existsSync(videoPath)) {
        return res.status(404).json({ error: "Video file not found" });
      }

      const stat = fs.statSync(videoPath);
      const fileSize = stat.size;
      const range = req.headers.range;

      // Support range requests for large videos
      if (range) {
        const parts = range.replace(/bytes=/, "").split("-");
        const start = parseInt(parts[0], 10);
        const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
        const chunksize = (end - start) + 1;
        const file = fs.createReadStream(videoPath, { start, end });
        
        res.writeHead(206, {
          "Content-Range": `bytes ${start}-${end}/${fileSize}`,
          "Accept-Ranges": "bytes",
          "Content-Length": chunksize,
          "Content-Type": "video/mp4",
          "Content-Disposition": `attachment; filename="${video.title}${path.extname(video.original_video)}"`
        });
        
        file.pipe(res);
      } else {
        res.writeHead(200, {
          "Content-Length": fileSize,
          "Content-Type": "video/mp4",
          "Content-Disposition": `attachment; filename="${video.title}${path.extname(video.original_video)}"`
        });
        
        fs.createReadStream(videoPath).pipe(res);
      }
    } catch (error) {
      console.error("Download error:", error);
      res.status(500).json({ error: "Error during download" });
    }
  }
);



/**
 * @swagger
 * /videos/{id}:
 *   get:
 *     summary: Retrieve video details
 *     description: Returns all information of a specific video, including metadata, HLS paths, thumbnails, and processing status.
 *     tags: [Videos]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: MongoDB ID of the video
 *         example: "507f1f77bcf86cd799439011"
 *     responses:
 *       200:
 *         description: Video details successfully retrieved
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 _id:
 *                   type: string
 *                   description: Unique video ID
 *                   example: "507f1f77bcf86cd799439011"
 *                 fieldname:
 *                   type: string
 *                   description: Form field name
 *                   example: "videos"
 *                 originalname:
 *                   type: string
 *                   description: Original uploaded file name
 *                   example: "my_video.mp4"
 *                 title:
 *                   type: string
 *                   description: Video title
 *                   example: "Angular Tutorial"
 *                 description:
 *                   type: string
 *                   description: Video description
 *                   example: "Complete guide"
 *                 category:
 *                   type: string
 *                   description: Video category
 *                   example: "Programming"
 *                 tags:
 *                   type: array
 *                   items:
 *                     type: string
 *                   description: Video tags
 *                   example: ["angular", "typescript"]
 *                 duration:
 *                   type: number
 *                   description: Duration in seconds
 *                   example: 120
 *                 encoding:
 *                   type: string
 *                   description: File encoding
 *                   example: "7bit"
 *                 mimetype:
 *                   type: string
 *                   description: MIME type of original file
 *                   example: "video/mp4"
 *                 size:
 *                   type: string
 *                   description: File size
 *                   example: "52428800"
 *                 destination:
 *                   type: string
 *                   description: Destination folder
 *                   example: "./uploads/videos/"
 *                 filename:
 *                   type: string
 *                   description: Processed file name
 *                   example: "507f1f77bcf86cd799439011.mp4"
 *                 userId:
 *                   type: string
 *                   description: ID of the user who uploaded
 *                   example: "507f191e810c19729de860ea"
 *                 path:
 *                   type: string
 *                   description: Full file path
 *                   example: "./uploads/videos/507f1f77bcf86cd799439011.mp4"
 *                 videoStatus:
 *                   type: string
 *                   enum: [processing, uploaded, error]
 *                   description: Video processing status
 *                   example: "uploaded"
 *                 createdAt:
 *                   type: string
 *                   format: date-time
 *                   description: Creation timestamp
 *                   example: "2025-11-17T12:00:00.000Z"
 *                 hls:
 *                   type: string
 *                   description: HLS playlist file path (.m3u8)
 *                   example: "507f1f77bcf86cd799439011.m3u8"
 *                 static_thumbnail:
 *                   type: string
 *                   description: Static thumbnail file name
 *                   example: "507f1f77bcf86cd799439011.webp"
 *                 animated_thumbnail:
 *                   type: string
 *                   description: Animated thumbnail file name
 *                   example: "507f1f77bcf86cd799439011_animated.webp"
 *                 original_video:
 *                   type: string
 *                   description: Original video file name
 *                   example: "507f1f77bcf86cd799439011_original.mp4"
 *                 custom_thumbnail:
 *                   type: string
 *                   description: Custom thumbnail file name (if any)
 *                   example: "507f1f77bcf86cd799439011_custom.webp"
 *       401:
 *         description: Missing or invalid token
 *       403:
 *         description: Not authorized to view this video
 *       404:
 *         description: Video not found
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: "Video not found"
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: "Internal server error"
 */
routeVideos.get(
  "/videos/:id",
  verifyToken,
  async (req: AuthRequest, res) => {
    const { id } = req.params;
    const userId = req.userId;

    try {
      const file = await File.findById(id);

      if (!file) {
        return res.status(404).json({ error: "Video not found" });
      }

      // Check ownership
      if (file.userId.toString() !== userId) {
        return res.status(403).json({ error: "Not authorized to view this video" });
      }

      res.json(file.toObject());
    } catch (err) {
      console.error("Error retrieving video:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  }
);


/**
 * @swagger
 * /videos/status/{id}:
 *   get:
 *     summary: Retrieve video processing status
 *     description: Lightweight endpoint to check only the processing status of a video (processing, uploaded, error). Useful for polling during processing.
 *     tags: [Videos]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: MongoDB ID of the video
 *         example: "507f1f77bcf86cd799439011"
 *     responses:
 *       200:
 *         description: Video status successfully retrieved
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               required:
 *                 - videoStatus
 *               properties:
 *                 videoStatus:
 *                   type: string
 *                   enum: [inProgress, uploaded, error]
 *                   description: Current processing status of the video
 *             examples:
 *               inProgress:
 *                 summary: Video processing in progress
 *                 value:
 *                   videoStatus: "inProgress"
 *               uploaded:
 *                 summary: Video fully processed
 *                 value:
 *                   videoStatus: "uploaded"
 *               error:
 *                 summary: Error during processing
 *                 value:
 *                   videoStatus: "error"
 *       401:
 *         description: Missing or invalid token
 *       403:
 *         description: Not authorized to view this video
 *       404:
 *         description: Video not found
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: "Video not found"
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: "Internal server error"
 */
routeVideos.get(
  "/videos/status/:id",
  verifyToken,
  async (req: AuthRequest, res) => {
    const { id } = req.params;
    const userId = req.userId;

    try {
      const file = await File.findById(id).select('videoStatus userId');
      
      if (!file) {
        return res.status(404).json({ error: "Video not found" });
      }

      // Check ownership
      if (file.userId.toString() !== userId) {
        return res.status(403).json({ error: "Not authorized to view this video" });
      }

      res.json({ videoStatus: file.videoStatus });
    } catch (err) {
      console.error("Error retrieving video status:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  }
);



/**
 * @swagger
 * /videos/duration/{id}:
 *   get:
 *     summary: Retrieve video duration
 *     description: Lightweight endpoint to get only the video duration in seconds. Useful to update the UI without fetching full video metadata.
 *     tags: [Videos]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: MongoDB ID of the video
 *         example: "507f1f77bcf86cd799439011"
 *     responses:
 *       200:
 *         description: Duration of the video in seconds
 *         content:
 *           application/json:
 *             schema:
 *               type: number
 *               format: float
 *               description: Video duration in seconds (may include decimals)
 *               example: 125.5
 *       401:
 *         description: Missing or invalid token
 *       403:
 *         description: Not authorized to view this video
 *       404:
 *         description: Video not found
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: "Video not found"
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: "Internal server error"
 */
routeVideos.get(
  "/videos/duration/:id",
  verifyToken,
  async (req: AuthRequest, res) => {
    const { id } = req.params;
    const userId = req.userId;

    try {
      const file = await File.findById(id).select('duration userId');
      if (!file) {
        return res.status(404).json({ error: "Video not found" });
      }

      // Check ownership
      if (file.userId.toString() !== userId) {
        return res.status(403).json({ error: "Not authorized to view this video" });
      }

      res.json(file.duration);
    } catch (err) {
      console.error("Error retrieving video duration:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  }
);


/**
 * @swagger
 * /videos:
 *   get:
 *     summary: Retrieve all user videos
 *     description: Returns a list of all videos of the logged-in user with essential metadata (title, description, thumbnail, duration, tags, category). Videos are filtered by user and mimetype "video".
 *     tags: [Videos]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Successfully retrieved list of videos
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   _id:
 *                     type: string
 *                     description: Unique video ID
 *                     example: "507f1f77bcf86cd799439011"
 *                   title:
 *                     type: string
 *                     description: Video title (fallback to originalname if unspecified)
 *                     example: "Angular 20 Tutorial"
 *                   description:
 *                     type: string
 *                     description: Video description
 *                     example: "Complete guide to Angular 20"
 *                   thumbnail:
 *                     type: string
 *                     description: URL to retrieve the static thumbnail
 *                     example: "/videos/thumb/static/507f1f77bcf86cd799439011"
 *                   videoUrl:
 *                     type: string
 *                     description: URL for HLS streaming of the video
 *                     example: "/videos/stream/507f1f77bcf86cd799439011"
 *                   duration:
 *                     type: number
 *                     format: float
 *                     description: Video duration in seconds
 *                     example: 125.5
 *                   uploadDate:
 *                     type: string
 *                     format: date-time
 *                     description: Video upload date and time
 *                     example: "2025-11-17T12:00:00.000Z"
 *                   size:
 *                     type: string
 *                     description: File size in bytes (as string)
 *                     example: "52428800"
 *                   category:
 *                     type: string
 *                     description: Video category (default "Uncategorized")
 *                     example: "programming"
 *                   tags:
 *                     type: array
 *                     items:
 *                       type: string
 *                     description: Array of tags associated with the video
 *                     example: ["angular", "typescript", "tutorial"]
 *                   videoStatus:
 *                     type: string
 *                     enum: [processing, uploaded, error]
 *                     description: Video processing status
 *                     example: "uploaded"
 *       401:
 *         description: Missing or invalid token
 *       500:
 *         description: Error fetching videos
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: "Error fetching videos"
 */
routeVideos.get(
  "/videos",
  verifyToken,
  async (req: AuthRequest, res) => {
    const userId = req.userId;

    try {
      const videos = await File.find({ 
        userId: userId,
        mimetype: { $regex: "video" } 
      });

      const result = videos.map((file) => ({
        _id: file._id,
        title: file.title || file.originalname,
        description: file.description || '',
        thumbnail: `/videos/thumb/static/${file._id}`,
        videoUrl: `/videos/stream/${file._id}`,
        duration: file.duration,
        uploadDate: file.createdAt,
        size: file.size || '0',
        category: file.category || 'Uncategorized',
        tags: file.tags || [],
        videoStatus: file.videoStatus
      }));

      res.json(result);
    } catch (e) {
      console.error("Error fetching videos:", e);
      res.status(500).json({ error: "Error fetching videos" });
    }
  }
);



/**
 * @swagger
 * /videos/{id}:
 *   delete:
 *     summary: Delete a video
 *     description: Completely deletes a video from the database and all associated files (original video, HLS, thumbnails). File deletion runs in the background with retry logic to handle files in use.
 *     tags: [Videos]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: MongoDB ID of the video to delete
 *         example: "507f1f77bcf86cd799439011"
 *     responses:
 *       200:
 *         description: Video successfully deleted
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Video and related files deleted successfully"
 *       401:
 *         description: Missing or invalid token
 *       403:
 *         description: Not authorized to delete this video
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: "You do not have permission to delete this video"
 *       404:
 *         description: Video not found
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: "Video not found"
 *       500:
 *         description: Error deleting video
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                 details:
 *                   type: object
 *                   description: Error details
 */
routeVideos.delete(
  "/videos/:id",
  verifyToken,
  async (req: AuthRequest, res) => {
    const { id } = req.params;
    const userId = req.userId;

    try {
      // Check if video exists
      const fileData = await File.findById(id);
      if (!fileData) {
        return res.status(404).json({ error: "Video not found" });
      }

      // Check if user owns video
      if (fileData.userId.toString() !== userId) {
        return res
          .status(403)
          .json({ error: "You do not have permission to delete this video" });
      }

      // Path to the video folder
      const videoFolderPath = path.join(VIDEO_PATH, id);

      // Helper function: deleting folder in the background with delay and max retries
      const deleteFolderUntilGone = (folderPath: string, delayMs = 1000, maxRetries = 10) => {
        let retries = 0;

        const attemptDelete = async () => {
          while (retries < maxRetries) {
            try {
              await fs.promises.rm(folderPath, { recursive: true, force: true });
              if (ENABLE_LOGS) {
                console.log(`Successfully deleted folder: ${folderPath}`);
              }
              return;
            } catch (err: any) {
              if (err.code === "ENOENT") {
                // Folder doesn't exist, that's fine
                return;
              }

              const retriableErrors = ["EBUSY", "ENOTEMPTY"];
              if (retriableErrors.includes(err.code)) {
                retries++;
                console.log(`Retry ${retries}/${maxRetries} deleting folder: ${folderPath}`);
                await new Promise(resolve => setTimeout(resolve, delayMs));
                continue;
              }

              console.error(`Unexpected error deleting folder: ${folderPath}`, err);
              return;
            }
          }

          // If we get here, we've reached the maximum number of retries
          console.error(`Could not delete folder after ${maxRetries} attempts: ${folderPath}`);
        };

        attemptDelete(); // fire and forget
      };

      // Start deleting the folder in the background
      deleteFolderUntilGone(videoFolderPath);

      // Delete from database 
      await File.findByIdAndDelete(id);

      return res
        .status(200)
        .json({ message: "Video and related files deleted successfully" });
    } catch (e) {
      console.error("Error deleting video:", e);
      return res.status(500).json({ error: "Error deleting video", details: e });
    }
  }
);

/**
 * @swagger
 * /videos/{id}/signed-url:
 *   post:
 *     summary: Generate signed URLs for secure video streaming
 *     description: Creates temporary signed URLs (valid for 10 minutes) for HLS video streaming and thumbnail access. The signed URLs use HMAC-SHA256 signatures to prevent unauthorized access and replay attacks. Used by the video player component to securely stream content.
 *     tags: [Videos]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: MongoDB ID of the video
 *         example: "507f1f77bcf86cd799439011"
 *     responses:
 *       200:
 *         description: Signed URLs generated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 streamUrl:
 *                   type: string
 *                   description: Signed URL for HLS video streaming (m3u8 playlist)
 *                   example: "http://localhost:3070/videos/stream/507f1f77bcf86cd799439011/507f1f77bcf86cd799439011.m3u8?expires=1700000000000&signature=a3f5b8c2d1e4f7a9&uid=507f1f77bcf86cd799439011"
 *                 thumbnailUrl:
 *                   type: string
 *                   description: Signed URL for thumbnail access
 *                   example: "http://localhost:3070/videos/thumb/signed/507f1f77bcf86cd799439011?expires=1700000000000&signature=a3f5b8c2d1e4f7a9&uid=507f1f77bcf86cd799439011"
 *                 expiresAt:
 *                   type: number
 *                   description: Unix timestamp (milliseconds) when the signed URLs expire
 *                   example: 1700000600000
 *       401:
 *         description: Missing or invalid JWT token
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: "Missing token"
 *       403:
 *         description: Not authorized to access this video (not the owner)
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: "Not authorized to access this video"
 *       404:
 *         description: Video not found
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: "Video not found"
 *       423:
 *         description: Video processing not completed yet
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: "Video processing not completed yet"
 *       500:
 *         description: Internal server error during signed URL generation
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: "Error generating signed URL"
 */
routeVideos.post(
  "/videos/:id/signed-url",
  verifyToken,
  async (req: AuthRequest, res) => {
    const videoId = req.params.id;
    const userId = req.userId!;

    try {
      const fileData = await File.findById(videoId);

      if (!fileData) {
        return res.status(404).json({ error: "Video not found" });
      }

      // Check ownership
      if (fileData.userId.toString() !== userId) {
        return res.status(403).json({ error: "Not authorized to access this video" });
      }

      if (fileData.videoStatus !== "uploaded") {
        return res.status(423).json({ error: "Video processing not completed yet" });
      }

      // Generate signed URLs
      const signedParams = generateSignedUrl({ videoId, userId, expiresInMinutes: 15 });
      
      const baseUrl = `${req.protocol}://${req.get('host')}`;
      const streamUrl = `${baseUrl}/videos/stream/${videoId}/${fileData.hls}${signedParams}`;
      const thumbnailUrl = `${baseUrl}/videos/thumb/signed/${videoId}${signedParams}`;

      res.json({
        streamUrl,
        thumbnailUrl,
        expiresAt: Date.now() + (10 * 60 * 1000)
      });
    } catch (error) {
      res.status(500).json({ error: "Error generating signed URL" });
    }
  }
);

/**
 * @swagger
 * /videos/{id}/refresh-token:
 *   post:
 *     summary: Refresh signed URL token for secure video streaming
 *     description: Generates a new signed URL token valid for 15 minutes to extend streaming session without interruption. Requires JWT authentication and ownership verification.
 *     tags: [Videos]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: MongoDB ID of the video
 *         example: "507f1f77bcf86cd799439011"
 *     responses:
 *       200:
 *         description: New signed token parameters generated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 expires:
 *                   type: string
 *                   description: Expiration timestamp of the renewed token (milliseconds since epoch)
 *                 signature:
 *                   type: string
 *                   description: HMAC SHA256 signature of the video ID, user ID, and expiry
 *                 uid:
 *                   type: string
 *                   description: User ID associated with the token
 *                 expiresAt:
 *                   type: integer
 *                   description: Expiration timestamp as a number for convenience
 *       403:
 *         description: User is not authorized to access this video
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       404:
 *         description: Video not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       423:
 *         description: Video processing not completed yet
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       500:
 *         description: Internal server error while refreshing token
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
routeVideos.post(
  "/videos/:id/refresh-token",
  verifyToken,
  async (req: AuthRequest, res) => {
    const videoId = req.params.id;
    const userId = req.userId!;

    try {
      const fileData = await File.findById(videoId);

      if (!fileData) {
        return res.status(404).json({ error: "Video not found" });
      }

      // Check ownership
      if (fileData.userId.toString() !== userId) {
        return res.status(403).json({ error: "Not authorized" });
      }

      if (fileData.videoStatus !== "uploaded") {
        return res.status(423).json({ error: "Video not ready" });
      }

      // Generate signed URLs
      const signedParams = generateSignedUrl({ 
        videoId, 
        userId, 
        expiresInMinutes: 15 
      });
      
      // Extract parameters
      const params = new URLSearchParams(signedParams.substring(1)); // Rimuovi il "?"
      
      res.json({
        expires: params.get('expires'),
        signature: params.get('signature'),
        uid: params.get('uid'),
        expiresAt: Number(params.get('expires'))
      });
    } catch (error) {
      console.error('Error refreshing token:', error);
      res.status(500).json({ error: "Error refreshing token" });
    }
  }
);
