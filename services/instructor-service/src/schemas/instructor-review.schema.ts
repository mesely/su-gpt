import { Schema, Document, model } from 'mongoose';

export type Sentiment = 'positive' | 'negative' | 'neutral';

export interface InstructorReviewDoc extends Document {
  instructorName: string;
  courseCode: string;
  sentiment: Sentiment;
  anonymizedText: string;
  source: 'whatsapp';
  uploadBatch: string;
  createdAt: Date;
}

export const InstructorReviewSchema = new Schema<InstructorReviewDoc>(
  {
    instructorName: { type: String, required: true, index: true },
    courseCode:     { type: String, required: true, index: true },
    sentiment:      { type: String, enum: ['positive', 'negative', 'neutral'], required: true },
    anonymizedText: { type: String, required: true },
    source:         { type: String, enum: ['whatsapp'], default: 'whatsapp' },
    uploadBatch:    { type: String, required: true, index: true },
  },
  { collection: 'instructorReviews', timestamps: true },
);
