import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type CourseDocument = Course & Document;

@Schema({ _id: true })
export class CategoryInfo {
  @Prop({ default: 0 }) engineering: number;
  @Prop({ default: 0 }) basicScience: number;
  @Prop({ default: false }) isCore: boolean;
  @Prop({ default: false }) isArea: boolean;
  @Prop({ default: false }) isBasicScience: boolean;
}

@Schema({ collection: 'courses', timestamps: true })
export class Course {
  @Prop({ required: true }) major: string;
  @Prop({ required: true }) code: string;
  @Prop({ required: true, unique: true }) fullCode: string;
  @Prop({ required: true }) name: string;
  @Prop({ default: 0 }) ects: number;
  @Prop({ default: 0 }) suCredit: number;
  @Prop({ default: '' }) faculty: string;
  @Prop({ default: 'university' }) elType: string;
  @Prop({ type: CategoryInfo, default: () => ({}) }) categories: CategoryInfo;
  @Prop({ type: [String], default: [] }) prerequisites: string[];
  @Prop({ type: [String], default: [] }) instructors: string[];
  @Prop({ default: '' }) description: string;
}

export const CourseSchema = SchemaFactory.createForClass(Course);
CourseSchema.index({ fullCode: 1 }, { unique: true });
CourseSchema.index({ major: 1 });
CourseSchema.index({ faculty: 1 });
CourseSchema.index({ elType: 1 });
CourseSchema.index({ name: 'text', description: 'text' });
