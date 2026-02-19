import { Schema, Document } from 'mongoose';

export interface ParsedReviewItem {
  instructorName: string;
  courseCode: string;
  anonymizedText: string;
  sentiment: 'positive' | 'negative' | 'neutral';
}

export interface PendingBatchDoc extends Document {
  batchId: string;
  uploadedBy: string;
  filename: string;
  reviews: ParsedReviewItem[];
  totalMessages: number;
  createdAt: Date;
}

export const PendingBatchSchema = new Schema<PendingBatchDoc>(
  {
    batchId:       { type: String, required: true, unique: true },
    uploadedBy:    { type: String, required: true },
    filename:      { type: String, default: '' },
    totalMessages: { type: Number, default: 0 },
    reviews: [
      {
        instructorName: String,
        courseCode:     String,
        anonymizedText: String,
        sentiment:      { type: String, enum: ['positive', 'negative', 'neutral'] },
      },
    ],
  },
  { collection: 'pendingBatches', timestamps: true },
);
