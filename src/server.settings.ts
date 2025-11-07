import * as videoUtils from "./videoUtils";
import multer from 'multer';
import config from 'config';


export const VIDEO_PATH = "uploads/videos";

export const uploadVideo = multer({
  dest: `${VIDEO_PATH}/`,
  fileFilter: videoUtils.videoFileFilter,
  limits: { fileSize: 100 * 1024 * 1024 }, // limit up to 100 mb
});

export const uploadThumb = multer({
  dest: `${VIDEO_PATH}/`,
  fileFilter: videoUtils.thumbFileFilter,
  limits: { fileSize: 5 * 1024 * 1024 }, // limit up to 5 mb
})

export function makeMulterUploadMiddleware(multerUploadFunction) {
  return (req: any, res: any, next) => 
    multerUploadFunction(req, res, (err) => {
      // handle Multer error
      if (err && err.name && err.name === "MulterError") {
        return res.status(413).send({
          error: err.name,
          message: `File upload error: ${err.message}`,
        });
      }

      // handle other errors
      if (err) {
        if (err === config.get("alloweFileTypes")) {
          return res.status(415).send({
            error: "Unsupported Media Type",
            message: `Only these file extensions are allowed: ${config.get(
              "alloweFileTypes"
            )}`,
          });
        }
        return res.status(500).send({
          error: "FILE UPLOAD ERROR",
          message: `Something wrong occurred when trying to upload the file`,
        });
      }
      next();
    });
  };
