import fs from 'fs';

export function cleanupMulterFiles(req: any) {
  try {
    if (req.file && req.file.path) {
      fs.unlink(req.file.path, () => {});
    }

    if (req.files) {
      const fileGroups = Array.isArray(req.files)
        ? { files: req.files }
        : req.files;

      Object.values(fileGroups).forEach((group: any) => {
        const arr = Array.isArray(group) ? group : [group];
        arr.forEach((f) => {
          if (f && f.path) fs.unlink(f.path, () => {});
        });
      });
    }
  } catch {
  }
}