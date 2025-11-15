import fs from "fs";
import path from "path";
import sharp from "sharp";
import config from "config";
import { File } from "./models/data.model";
import { VIDEO_PATH } from "./server.settings";

const ffmpeg = require("fluent-ffmpeg");

/**
 * @description check each file video if is allowed or not to be uploaded
 * @param req
 * @param file
 * @param cb
 * @returns
 */
export const videoFileFilter = function (req, file, cb) {
  // Obtain the allowed file types
  const extensions: string = config.get("allowedVideoTypes");

  // Convert the string of extensions into an array
  const allowedExtensions = extensions.split("|");

  // Extract the file extension (without the part of the name before the dot)
  const fileExtension = file.originalname.split(".").pop()?.toLowerCase();

  // Check if the file extension is among the allowed ones
  if (!allowedExtensions.includes(fileExtension || "")) {
    return cb(
      new Error(`File type not allowed. Allowed types are: ${extensions}`),
      false
    );
  }
  // If the file is valid, pass to success
  cb(null, true);
};

export const thumbFileFilter = function (req, file, cb) {
  // Obtain the allowed file types
  const extensions: string = config.get("allowedThumbTypes");

  // Convert the string of extensions into an array
  const allowedExtensions = extensions.split("|");

  // Extract the file extension (without the part of the name before the dot)
  const fileExtension = file.originalname.split(".").pop()?.toLowerCase();

  // // Check if the file extension is among the allowed ones
  if (!allowedExtensions.includes(fileExtension || "")) {
    return cb(
      new Error(`File type not allowed. Allowed types are: ${extensions}`),
      false
    );
  }

  // If the file is valid, pass to success
  cb(null, true);
};

export const createVideo = async (fileObj, customThumbnailPath?: string) => {
  const id = fileObj._id.toString();
  const inputPath = path.join(VIDEO_PATH, fileObj.filename);
  const videoFolderPath = path.join(VIDEO_PATH, id);

  const originalVideoPath = path.join(videoFolderPath, `${id}_original${path.extname(fileObj.filename)}`);

  // Folder controll helper 
  const folderExistsOrExit = () => {
    if (!fs.existsSync(videoFolderPath)) {
      console.warn(`[createVideo] Folder ${videoFolderPath} was removed during processing. Aborting.`);
      return false;
    }
    return true;
  };

  try {
    // 1. Check if the video exists in the DB
    const stillExists = await File.exists({ _id: id });
    if (!stillExists) {
      console.warn(`[createVideo] Video ${id} no longer exists in DB`);
      return;
    }

    const duration = await getVideoDuration(inputPath);

    // 2. Ensure folder exists
    if (!fs.existsSync(videoFolderPath)) {
      fs.mkdirSync(videoFolderPath, { recursive: true });
    }

    // 3. Definition of paths
    const hlsPath = path.join(videoFolderPath, `${id}.m3u8`);
    const staticThumbPath = path.join(videoFolderPath, `${id}.webp`);
    const animatedThumbPath = path.join(videoFolderPath, `${id}_animated.webp`);
    const jpegFramePath = path.join(videoFolderPath, `thumb.jpg`);
    const customThumbPath = path.join(videoFolderPath, `${id}_custom.webp`);

    // === STATIC THUMBNAIL ===
    if (customThumbnailPath && fs.existsSync(customThumbnailPath)) {
      await sharp(customThumbnailPath).webp().toFile(customThumbPath);
      fs.unlinkSync(customThumbnailPath); // Rimuovi il file temporaneo
    }

    if (!customThumbnailPath) {
      if (!folderExistsOrExit()) return;
      // Generate static thumbnail (JPEG → WebP)
      await new Promise<void>((resolve, reject) => {
        ffmpeg(inputPath)
          .outputOptions(["-frames:v 1"])
          .seekInput(4) // <- Seek to the X second
          .output(jpegFramePath)
          .on("end", resolve)
          .on("error", reject)
          .run();
      });
      if (!folderExistsOrExit()) return;
      const jpegBuffer = await fs.promises.readFile(jpegFramePath);
      await sharp(jpegBuffer).webp().toFile(staticThumbPath);
      await fs.promises.unlink(jpegFramePath);
    }

    // === HLS CONVERSION ===
    // Convert to HLS (only if not already exists)
    if (!folderExistsOrExit()) return;
    if (!fs.existsSync(hlsPath)) {
      await new Promise<void>((resolve, reject) => {
        ffmpeg(inputPath)
          .outputOptions([
            "-preset veryfast",
            "-g 60",
            "-sc_threshold 0",
            "-c:v libx264",
            "-crf 23",
            "-maxrate 1000k",
            "-bufsize 2000k",
            "-c:a aac",
            "-b:a 96k",
            "-f hls",
            "-hls_time 6",
            "-hls_playlist_type vod",
            "-hls_flags independent_segments",
            "-hls_segment_type mpegts",
            "-hls_segment_filename", path.join(videoFolderPath, `${id}_%03d.ts`)
          ])
          .output(hlsPath)
          .on("end", resolve)
          .on("error", reject)
          .run();
      });
    }
    // === ANIMATED THUMBNAIL ===
    // Generate animated thumbnail
    if (!folderExistsOrExit()) return;
    if (!fs.existsSync(animatedThumbPath)) {
      await new Promise<void>((resolve, reject) => {
        ffmpeg(inputPath)
          .inputOptions(["-ss 00:00:01"])
          .outputOptions(["-vf fps=10,scale=320:-1:flags=lanczos", "-t 3"])
          .output(animatedThumbPath)
          .on("end", resolve)
          .on("error", reject)
          .run();
      });
    }

    // Update the database if the video still exists
    if (await File.exists({ _id: id })) {
      const updateData: any = {
        hls: `${id}.m3u8`,
        static_thumbnail: `${id}.webp`,
        animated_thumbnail: `${id}_animated.webp`,
         original_video: `${id}_original${path.extname(fileObj.filename)}`,
        duration: duration,
        videoStatus: "uploaded",
      };
      
      // Aggiungi custom_thumbnail se presente
      if (customThumbnailPath) {
        updateData.custom_thumbnail = `${id}_custom.webp`;
      }
      
      await File.findByIdAndUpdate(id, updateData);
    }

  } catch (err) {
    console.error(`[createVideo] Error processing video ${id}:`, err);
    await File.findByIdAndUpdate(id, { videoStatus: "error" });
  } finally {
    // Move the original file to the video folder
    if (fs.existsSync(inputPath)) {
      await fs.promises.rename(inputPath, originalVideoPath).catch(() => {});
    }
  }
};

export const createCustomThumbnail = async (
  thumbnailPath: string,
  id: string
) => {
  try {
    const videoFolderPath = path.join(VIDEO_PATH, id);
    const customThumbPath = path.join(videoFolderPath, `${id}_custom.webp`);

    // Create custom thumbnail with sharp
    await sharp(thumbnailPath).webp().toFile(customThumbPath);

    // Remove the temporary thumbnail file after creating the custom thumbnail
    fs.unlinkSync(thumbnailPath);

    // Update the custom thumbnail path in the database
    await File.findByIdAndUpdate(id, {
      custom_thumbnail: `${id}_custom.webp`,
    });

  } catch (err) {
    console.error("Error creating custom thumbnail:", err);
    throw err; 
  }
};

const getVideoDuration = (filePath: string): Promise<number> => {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(filePath, (error, metadata) => {
      if (error) {
        reject(error);
      } else {
        resolve(metadata.format.duration || 0);
      }
    });
  });
};
