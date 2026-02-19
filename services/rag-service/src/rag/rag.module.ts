import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { RagController } from './rag.controller';
import { RagService } from './rag.service';
import { VectorService, EmbeddingCacheMongooseSchema } from './vector.service';
import { PromptBuilder } from './prompt-builder';
import { ChainOfThought } from './chain-of-thought';
import { WhatsappParser } from '../ingestion/whatsapp.parser';
import { ExamIngestor } from '../ingestion/exam.ingestor';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: 'EmbeddingCache', schema: EmbeddingCacheMongooseSchema },
    ]),
  ],
  controllers: [RagController],
  providers: [
    RagService,
    VectorService,
    PromptBuilder,
    ChainOfThought,
    WhatsappParser,
    ExamIngestor,
  ],
})
export class RagModule {}
