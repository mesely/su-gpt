import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { RagModule } from './rag/rag.module';

@Module({
  imports: [
    MongooseModule.forRoot(
      process.env.MONGODB_URI ?? 'mongodb://localhost:27017/su-advisor',
    ),
    RagModule,
  ],
})
export class AppModule {}
