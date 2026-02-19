import {
  Body,
  Controller,
  Delete,
  Inject,
  OnModuleInit,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ClientGrpc } from '@nestjs/microservices';
import { Observable, firstValueFrom } from 'rxjs';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AdminGuard } from '../auth/admin.guard';
import { INSTRUCTOR_CLIENT } from '../proxy/grpc-clients.module';
import { JwtPayload } from '../auth/jwt.strategy';

interface InstructorUploadClient {
  uploadWhatsappBatch(data: {
    batch_id: string;
    content: Buffer;
    uploaded_by: string;
    filename: string;
  }): Observable<unknown>;
  confirmUpload(data: {
    batch_id: string;
    approved: boolean;
    approved_by: string;
  }): Observable<unknown>;
  deleteBatch(data: { batch_id: string }): Observable<unknown>;
}

@Controller('api/v1/admin/whatsapp')
@UseGuards(JwtAuthGuard, AdminGuard)
export class AdminWhatsappController implements OnModuleInit {
  private svc!: InstructorUploadClient;

  constructor(@Inject(INSTRUCTOR_CLIENT) private readonly client: ClientGrpc) {}

  onModuleInit() {
    this.svc = this.client.getService<InstructorUploadClient>('InstructorService');
  }

  /** WhatsApp .txt parse et, admin onayına sun (preview ilk 10 yorum) */
  @Post()
  uploadBatch(
    @Body() body: { rawText: string; uploadedBy?: string; filename?: string },
    @Req() req: { user: JwtPayload },
  ) {
    return firstValueFrom(
      this.svc.uploadWhatsappBatch({
        batch_id:    crypto.randomUUID(),
        content:     Buffer.from(body.rawText, 'utf-8'),
        uploaded_by: body.uploadedBy ?? req.user.sub,
        filename:    body.filename ?? 'upload.txt',
      }),
    );
  }

  /** Batch'i onayla veya reddet */
  @Post(':batchId/confirm')
  confirmBatch(
    @Param('batchId') batchId: string,
    @Body() body: { approved: boolean },
    @Req() req: { user: JwtPayload },
  ) {
    return firstValueFrom(
      this.svc.confirmUpload({
        batch_id:    batchId,
        approved:    body.approved,
        approved_by: req.user.sub,
      }),
    );
  }

  /** Batch'i tamamen sil */
  @Delete(':batchId')
  deleteBatch(@Param('batchId') batchId: string) {
    return firstValueFrom(this.svc.deleteBatch({ batch_id: batchId }));
  }
}
