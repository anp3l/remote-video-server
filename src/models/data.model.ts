import mongoose, { Schema, Model, Document } from "mongoose";

export interface IFile extends Document {
  fieldname: string;
  originalname: string;
  title?: string;
  description?: string;
  category?: string;
  tags?: string[];
  duration: number;
  encoding?: string;
  mimetype?: string;
  size?: string;
  destination?: string;
  filename: string;
  userId: mongoose.Types.ObjectId;
  path?: string;
  createdAt: Date;
  videoStatus?: string; 
  static_thumbnail?: string; 
  custom_thumbnail?: string;
  animated_thumbnail?: string; 
  hls?: string; 
  original_video?: string; 
}

export var fileSchema: any = new Schema({
  fieldname: {
    type: String,
  },
  originalname: {
    type: String,
  },
  title: { 
    type: String, 
    default: "" 
  },
  description: { 
    type: String, 
    default: "" 
  },
  category: { 
    type: String, 
    default: "" 
  },
  tags: { 
    type: [String], 
    default: [] 
  },
  duration: {
    type: Number,
  },
  encoding: {
    type: String,
  },
  mimetype: {
    type: String,
  },
  size: {
    type: String,
  },
  destination: {
    type: String,
  },
  filename: {
    type: String,
  },
  userId: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  path: {
    type: String,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
  videoStatus: {
    type: String,
  },
  static_thumbnail: {
    type: String,
  },
  custom_thumbnail: {
    type: String,
  },
  animated_thumbnail: {
    type: String,
  },
  hls: {
    type: String,
  },
  original_video: {
    type: String,
  },
});

export const File: Model<IFile> = mongoose.model<IFile>("File", fileSchema);
