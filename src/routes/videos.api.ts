import  express from "express";
import  fs from "fs";
import  path from "path";
import { File } from "../models/data.model";
import type { File as MulterFile } from 'multer';
import {
  VIDEO_PATH,
  makeMulterUploadMiddleware,
  uploadThumb,
  uploadVideo,
  uploadVideoWithThumb
} from "../server.settings";
/*import { isUserAuthenticated } from "../middleware/authentications";*/
import * as videoUtils from "../videoUtils";

export const routeVideos = express.Router();

// POST /video - Upload video(s)
routeVideos.post(
  "/videos",
  [
    //isUserAuthenticated,
    makeMulterUploadMiddleware(
      uploadVideoWithThumb.fields([
        { name: 'videos', maxCount: 1 },
        { name: 'thumbnail', maxCount: 1 }
      ])
    ),
  ],
  async (req, res,next) => {

    const userId = res.locals.member_id;

    const files = req.files as { [key: string]: MulterFile[] } | undefined;
    
    if (!files) {
      return res.status(400).json({ error: "No files received" });
    }

    const videos = files.videos || [];
    const thumbnailFile = files.thumbnail?.[0];

    if (thumbnailFile && thumbnailFile.size > 5 * 1024 * 1024) {
      fs.unlinkSync(thumbnailFile.path);
      return res.status(413).json({ 
        error: "Thumbnail troppo grande",
        message: "La thumbnail deve essere massimo 5 MB" 
      });
    }

    if (videos.length === 0)
      return res.status(400).json({ error: "No file uploaded" });

    const { title, description, tags, category } = req.body;
    const parsedTags = tags ? (Array.isArray(tags) ? tags : JSON.parse(tags)) : [];
    
    // Build initial fileObj with videoStatus set to "inProgress"
    let data = videos.map((file) => ({
      ...file,
      userId: userId,
      videoStatus: "inProgress",
      title: title || "",
      description: description || "",
      tags: parsedTags,
      category: category || "",
    }));

    try {
      const docs = await File.insertMany(data);
      // Fire-and-forget async processing
      docs.forEach((doc) => {
        videoUtils.createVideo(doc, thumbnailFile?.path).catch((err) => {
          console.error("Video processing failed:", err);
        });
      });

      const ops = docs.map((x) => ({
        ...x._doc,
        permalink: `https://${req.headers.host}/videos/${x._id}`,
      }));

      res.json({
        result: { ok: docs.length },
        ops,
        insertedCount: docs.length,
      });
    } catch (e) {
      console.error('MongoDB insert error:', e);
      res.status(400).json({ error: "Insert failed", details: e });
    }
  }
);

// PATCH /videos/:id/thumbnail - Upload custom thumbnail
routeVideos.patch(
  "/videos/thumb/custom/:id",
  [
    //isUserAuthenticated,
    makeMulterUploadMiddleware(uploadThumb.single("thumbnail")),
  ],
  async (req, res) => {
    const { id } = req.params;
    const file = req.file;

    // Check if the video exists
    const video = await File.findById(id);
    if (!video) {
      return res.status(404).json({ error: "Video not found" });
    }

    // Check file exists
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
// PATCH /videos/:id - Update video metadata
routeVideos.patch(
  "/videos/:id",
  async (req, res) => {
    const { id } = req.params;
    const { title, description, tags, category } = req.body;

    try {
      const updates: any = {};
      if (title !== undefined) updates.title = title;
      if (description !== undefined) updates.description = description;
      if (category !== undefined) updates.category = category;
      if (tags !== undefined) updates.tags = tags;

      const updatedVideo = await File.findByIdAndUpdate(
        id,
        { $set: updates },
        { new: true, runValidators: true }
      );

      if (!updatedVideo) {
        return res.status(404).json({ error: "Video non trovato" });
      }

      res.json(updatedVideo);
    } catch (error) {
      console.error("Errore aggiornamento video:", error);
      res.status(500).json({ error: "Errore durante l'aggiornamento" });
    }
  }
);

// GET /video/stream/:id/:file? - Stream HLS video segments or m3u8
routeVideos.get("/videos/stream/:id/:file?", async (req, res) => {
  const { id, file } = req.params;
  try {
    const fileData = await File.findById(id);
    if (!fileData || !fileData.hls) {
      return res.status(404).json({ error: "Video not available" });
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

    const MIME_TYPES = {
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
});

// GET /videos/thumb/static/:id - Serves static thumbnail
routeVideos.get("/videos/thumb/static/:id", async (req, res) => {
  const id = req.params.id;
  const file = await File.findById(id);

  if (!file || file.videoStatus !== "uploaded") {
    return res.status(404).json({ error: "Thumbnail not available" });
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
});

// GET /videos/thumb/animated/:id - Serves animated thumbnail
routeVideos.get("/videos/thumb/animated/:id", async (req, res) => {
  const id = req.params.id;

  const file = await File.findById(id);
  if (!file || file.videoStatus !== "uploaded") {
    return res
      .status(404)
      .json({ error: "Animated thumbnail not available yet" });
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
});

// GET /videos/download/:id - Download 
routeVideos.get("/videos/download/:id", async (req, res) => {
  const { id } = req.params;

  try {
    const video = await File.findById(id);
    if (!video || !video.original_video) {
      return res.status(404).json({ error: "Video non trovato" });
    }

    const videoPath = path.join(VIDEO_PATH, id, video.original_video);
    
    if (!fs.existsSync(videoPath)) {
      return res.status(404).json({ error: "File video non trovato" });
    }

    const stat = fs.statSync(videoPath);
    const fileSize = stat.size;
    const range = req.headers.range;

    // Support range requests per video grandi
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
    console.error("Errore download:", error);
    res.status(500).json({ error: "Errore durante il download" });
  }
});

// GET /video/:id - Get video details
routeVideos.get("/videos/:id", async (req, res) => {
  const { id } = req.params;

  try {
    const file = await File.findById(id);

    if (!file) {
      return res.status(404).json({ error: "Video not found" });
    }

    res.json({
      _id: file._id,
      fieldname: file.fieldname,
      originalname: file.originalname,
      encoding: file.encoding,
      mimetype: file.mimetype,
      size: file.size,
      destination: file.destination,
      filename: `${file._id}.mp4`,
      userId: file.userId,
      path: file.path,
      videoStatus: file.videoStatus,
      createdAt: file.createdAt,
      __v: file.__v,
      hls_path: file.hls,
      static_thumbnail: file.static_thumbnail,
      animated_thumbnail: file.animated_thumbnail,
      original_video: file.original_video,
      custom_thumbnail: file.custom_thumbnail,
    });
  } catch (err) {
    console.error("Error retrieving video:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Get /video/status/:id - Get video status
routeVideos.get("/videos/status/:id", async (req, res) => {
  const { id } = req.params;

  try {
    const file = await File.findById(id).select('videoStatus');
    if (!file) {
      
      return res.status(404).json({ error: "Video not found" });
    }

    res.json({ videoStatus: file.videoStatus });
  } catch (err) {
    console.error("Error retrieving video status:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /videos/duration/:id - Get video duration
routeVideos.get("/videos/duration/:id", async (req, res) => {
  const { id } = req.params;

  try {
    // Prendi solo il campo duration dal documento
    const file = await File.findById(id).select('duration');
    if (!file) {
      return res.status(404).json({ error: "Video not found" });
    }

    // Rispondi con la durata (es. in secondi)
    res.json(file.duration);
  } catch (err) {
    console.error("Error retrieving video duration:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});


// GET /videos/user - List all videos for current user
routeVideos.get("/videos/user", /*isUserAuthenticated,*/ async (req, res) => {
  const userId = res.locals.member_id;
  try {
    const videos = await File.find({ userId, mimetype: { $regex: "videos" } });

    const result = videos.map((file) => ({
      _id: file._id,
      filename: `${file._id}.mp4`,
      originalname: file.originalname,
      size: file.size,
      videoStatus: file.videoStatus,
      static_thumbnail: `/videos/thumb/static/${file._id}`,
      animated_thumbnail: `/videos/thumb/animated/${file._id}`,
      hls_stream: `/videos/stream/${file._id}`,
      createdAt: file.createdAt,
    }));

    res.json(result);
  } catch (e) {
    res.status(500).json({ error: "Error fetching user videos" });
  }
});

// GET /videos - List all videos
routeVideos.get("/videos", async (req, res) => {
  try {
    const videos = await File.find({ mimetype: { $regex: "video" } });

    const result = videos.map((file) => ({
      _id: file._id,
      title: file.title || file.originalname,
      description: file.description || '',
      thumbnail:`/videos/thumb/static/${file._id}`,
      videoUrl: `/videos/stream/${file._id}`,
      duration: file.duration,
      uploadDate: file.createdAt,
      size: file.size || '0',
      category: file.category || 'Uncategorized',
      tags: file.tags || []
    }));

    res.json(result);
  } catch (e) {
    res.status(500).json({ error: "Error fetching videos" });
  }
});

// DELETE /videos/:id
routeVideos.delete("/videos/:id", /*isUserAuthenticated,*/ async (req, res) => {
  const { id } = req.params;
  const userId = res.locals.member_id;

  try {
    // Check if video exists
    const fileData = await File.findById(id);
    if (!fileData) {
      return res.status(404).json({ error: "Video not found" });
    }

    // Check if user owns video
    if (fileData.userId !== userId) {
      return res
        .status(403)
        .json({ error: "You do not have permission to delete this video" });
    }

    // Path to the video folder
    const videoFolderPath = path.join(VIDEO_PATH, id);

    // Helper functions: deleting folder in the background with delay and max retries
    const deleteFolderUntilGone = (folderPath: string, delayMs = 1000, maxRetries = 10) => {
      let retries = 0;

      const attemptDelete = async () => {
        while (retries < maxRetries) {
          try {
            await fs.promises.rm(folderPath, { recursive: true, force: true });
            return;
          } catch (err: any) {
            if (err.code === "ENOENT") {
              return;
            }

            const retriableErrors = ["EBUSY", "ENOTEMPTY"];
            if (retriableErrors.includes(err.code)) {
              retries++;
              await new Promise(res => setTimeout(res, delayMs));
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
    return res.status(500).json({ error: "Error deleting video", details: e });
  }
});