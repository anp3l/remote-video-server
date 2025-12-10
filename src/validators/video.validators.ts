import { body, param } from 'express-validator';

export const uploadVideoValidator = [
  body('title')
    .optional({ values: 'falsy' })
    .trim()
    .isLength({ min: 1, max: 150 }).withMessage('Title must be 1-150 chars'),
  body('description')
    .optional({ values: 'falsy' })
    .trim()
    .isLength({ max: 2000 }).withMessage('Description too long'),
  body('category')
    .optional({ values: 'falsy' })
    .trim()
    .isLength({ max: 50 }),
  body('tags')
    .optional()
    .customSanitizer((value) => {
      if (Array.isArray(value)) return value;
      if (typeof value === 'string') {
        try {
          const parsed = JSON.parse(value);
          if (Array.isArray(parsed)) return parsed;
        } catch {}
        return value.split(',').map(t => t.trim()).filter(Boolean);
      }
      return [];
    })
    .custom((tags: string[]) => tags.length <= 50)
];

export const videoIdParamValidator = [
  param('id')
    .isMongoId()
    .withMessage('Invalid video id')
];

export const updateVideoValidator = [
  ...videoIdParamValidator,
  body('title')
    .optional()
    .trim()
    .isLength({ min: 1, max: 150 }),
  body('description')
    .optional()
    .trim()
    .isLength({ max: 2000 }),
  body('category')
    .optional()
    .trim()
    .isLength({ max: 50 }),
  body('tags')
    .optional()
    .isArray().withMessage('Tags must be an array')
    .bail()
    .custom((tags: unknown[]) => tags.every(t => typeof t === 'string' && t.length <= 50))
];
