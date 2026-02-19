import { Schema, Document } from 'mongoose';

export type Semester = 'fall' | 'spring' | 'summer';
export type ExamType = 'midterm' | 'final' | 'quiz';

export interface ExamDoc extends Document {
  courseCode: string;
  year: number;
  semester: Semester;
  type: ExamType;
  fileName: string;
  minioKey: string;
  uploadedBy: string;
  createdAt: Date;
}

export const ExamSchema = new Schema<ExamDoc>(
  {
    courseCode: { type: String, required: true, index: true },
    year:       { type: Number, required: true },
    semester:   { type: String, enum: ['fall', 'spring', 'summer'], required: true },
    type:       { type: String, enum: ['midterm', 'final', 'quiz'], required: true },
    fileName:   { type: String, required: true },
    minioKey:   { type: String, required: true, unique: true },
    uploadedBy: { type: String, required: true },
  },
  { collection: 'exams', timestamps: true },
);
