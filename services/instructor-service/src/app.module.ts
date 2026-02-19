import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ReviewsController } from './reviews/reviews.controller';
import { ReviewsService } from './reviews/reviews.service';
import { SentimentService } from './reviews/sentiment.service';
import { InstructorReviewSchema } from './schemas/instructor-review.schema';
import { PendingBatchSchema } from './schemas/pending-batch.schema';

@Module({
  imports: [
    MongooseModule.forRoot(
      process.env.MONGODB_URI ?? 'mongodb://localhost:27017/su-advisor',
    ),
    MongooseModule.forFeature([
      { name: 'InstructorReview', schema: InstructorReviewSchema },
      { name: 'PendingBatch',     schema: PendingBatchSchema },
    ]),
  ],
  controllers: [ReviewsController],
  providers:   [ReviewsService, SentimentService],
})
export class AppModule {}
