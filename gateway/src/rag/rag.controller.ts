import {
  Body,
  Controller,
  Get,
  Inject,
  OnModuleInit,
  Post,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ClientGrpc } from '@nestjs/microservices';
import { Observable, firstValueFrom } from 'rxjs';
import { Response } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RAG_CLIENT } from '../proxy/grpc-clients.module';

interface RagServiceClient {
  ask(data: {
    question: string;
    student_id: string;
    major: string;
    completed_courses: string[];
    current_semester: number;
  }): Observable<{ chunk: string; done: boolean }>;
  getSimilarChunks(data: {
    text: string;
    collection: string;
    top_k: number;
  }): Observable<unknown>;
}

@Controller('api/v1/rag')
@UseGuards(JwtAuthGuard)
export class RagController implements OnModuleInit {
  private svc!: RagServiceClient;

  constructor(@Inject(RAG_CLIENT) private readonly client: ClientGrpc) {}

  onModuleInit() {
    this.svc = this.client.getService<RagServiceClient>('RagService');
  }

  /** SSE streaming endpoint */
  @Post('ask')
  async ask(
    @Body()
    body: {
      question: string;
      studentId: string;
      major: string;
      completedCourses?: string[];
      currentSemester?: number;
    },
    @Res() res: Response,
  ) {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    const stream$ = this.svc.ask({
      question: body.question,
      student_id: body.studentId,
      major: body.major,
      completed_courses: body.completedCourses ?? [],
      current_semester: body.currentSemester ?? 1,
    });

    stream$.subscribe({
      next: (chunk) => {
        res.write(`data: ${JSON.stringify(chunk)}\n\n`);
        if (chunk.done) res.end();
      },
      error: (err: Error) => {
        res.write(`data: ${JSON.stringify({ error: err.message })}\n\n`);
        res.end();
      },
      complete: () => res.end(),
    });
  }

  @Get('similar')
  getSimilarChunks(
    @Query('text') text: string,
    @Query('collection') collection = 'su_reviews',
    @Query('topK') topK = '8',
  ) {
    return firstValueFrom(
      this.svc.getSimilarChunks({
        text,
        collection,
        top_k: parseInt(topK, 10),
      }),
    );
  }
}
