import fs from "fs";
import path from "path";
import sharp from "sharp";
import config from "config";
import { File } from "../models/data.model";
import { VIDEO_PATH } from "../server.settings";

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

const getVideoMetadata = (filePath: string): Promise<any> => {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(filePath, (error, metadata) => {
      if (error) {
        reject(error);
      } else {
        resolve(metadata);
      }
    });
  });
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

    const metadata = await getVideoMetadata(inputPath);
    const duration = metadata.format.duration || 0;
    const hasAudio = metadata.streams.some(
      (stream: any) => stream.codec_type === 'audio'
    );

    // 2. Ensure folder exists
    if (!fs.existsSync(videoFolderPath)) {
      fs.mkdirSync(videoFolderPath, { recursive: true });
    }

    // 3. Definition of paths
    const masterPlaylistPath = path.join(videoFolderPath, `${id}_master.m3u8`);
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

    // === HLS CONVERSION  with ABR ===

    if (!folderExistsOrExit()) return;
        if (!fs.existsSync(masterPlaylistPath)) {
          await new Promise<void>((resolve, reject) => {
            const command = ffmpeg(inputPath);
            
            // Video Options (4 streams)
            const videoOptions = [
              '-filter_complex',
              '[0:v]split=4[v1][v2][v3][v4];' +
              '[v1]copy[v1out];' +
              '[v2]scale=w=1280:h=720[v2out];' +
              '[v3]scale=w=854:h=480[v3out];' +
              '[v4]scale=w=640:h=360[v4out]',
              
              '-map', '[v1out]', '-c:v:0', 'libx264', '-b:v:0', '5000k', '-maxrate:v:0', '5350k', '-bufsize:v:0', '10000k',
              '-map', '[v2out]', '-c:v:1', 'libx264', '-b:v:1', '2800k', '-maxrate:v:1', '2996k', '-bufsize:v:1', '5600k',
              '-map', '[v3out]', '-c:v:2', 'libx264', '-b:v:2', '1400k', '-maxrate:v:2', '1498k', '-bufsize:v:2', '2800k',
              '-map', '[v4out]', '-c:v:3', 'libx264', '-b:v:3', '800k', '-maxrate:v:3', '856k', '-bufsize:v:3', '1600k',
            ];
            
            // Audio Options (only if has audio)
            const audioOptions = hasAudio ? [
              '-map', '0:a', '-map', '0:a', '-map', '0:a', '-map', '0:a',
              '-c:a', 'aac', '-b:a', '128k',
              '-var_stream_map', 'v:0,a:0 v:1,a:1 v:2,a:2 v:3,a:3'
            ] : [
              '-var_stream_map', 'v:0 v:1 v:2 v:3'
            ];
            
            // Common Options
            const commonOptions = [
              '-preset', 'medium',
              '-g', '48',
              '-keyint_min', '48',
              '-sc_threshold', '0',
              '-f', 'hls',
              '-hls_time', '4',
              '-hls_playlist_type', 'vod',
              '-hls_flags', 'independent_segments',
              '-master_pl_name', `${id}_master.m3u8`,
              '-hls_segment_filename', path.join(videoFolderPath, `${id}_v%v_%03d.ts`)
            ];
            
            command
              .outputOptions([...videoOptions, ...audioOptions, ...commonOptions])
              .output(path.join(videoFolderPath, `${id}_stream_%v.m3u8`))
              .on("end", () => {
                console.log(`[createVideo] HLS conversion completed for ${id}`);
                resolve();
              })
              .on("error", (err) => {
                console.error(`[createVideo] FFmpeg error for ${id}:`, err.message);
                reject(err);
              })
              .on("progress", (progress) => {
                if (progress.percent) {
                  console.log(`[createVideo] ${id} - Processing: ${Math.round(progress.percent)}%`);
                }
              })
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
        hls: `${id}_master.m3u8`,
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