import * as videoUtils from './utils/videoUtils';
import multer from 'multer';


export const VIDEO_PATH = "uploads/videos";

export const uploadVideo = multer({
  dest: `${VIDEO_PATH}/`,
  fileFilter: videoUtils.videoFileFilter,
  limits: { fileSize: 500 * 1024 * 1024 }, // limit up to 100 mb
});

export const uploadThumb = multer({
  dest: `${VIDEO_PATH}/`,
  fileFilter: videoUtils.thumbFileFilter,
  limits: { fileSize: 500 * 1024 * 1024 }, // limit up to 5 mb
})

export const uploadVideoWithThumb = multer({
  dest: `${VIDEO_PATH}/`,
  fileFilter: (req, file, cb) => {    
    if (file.fieldname === 'videos') {
      return videoUtils.videoFileFilter(req, file, cb);
    } else if (file.fieldname === 'thumbnail') {
      return videoUtils.thumbFileFilter(req, file, cb);
    } else {
      cb(new Error('Unexpected field name: ' + file.fieldname));
    }
  },
  limits: { fileSize: 500 * 1024 * 1024 },
});

export function makeMulterUploadMiddleware(multerUploadFunction) {
  return (req: any, res: any, next) => {
    
    multerUploadFunction(req, res, (err) => {
      // handle Multer error
      if (err && err.name && err.name === "MulterError") {
        console.error('MulterError detected:', err.message);
        return res.status(413).send({
          error: err.name,
          message: `File upload error: ${err.message}`,
        });
      }

      // handle other errors
      if (err) {
        console.error('Upload error (not MulterError):', err);
        return res.status(500).send({
          error: "FILE UPLOAD ERROR",
          message: err.message || 'Something wrong occurred when trying to upload the file',
        });
      }
      
      next();
    });
  };
}

