import {
  Body,
  Controller,
  Inject,
  OnModuleInit,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ClientGrpc } from '@nestjs/microservices';
import { Observable, firstValueFrom } from 'rxjs';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AdminGuard } from '../auth/admin.guard';
import { INSTRUCTOR_CLIENT } from '../proxy/grpc-clients.module';

interface InstructorUploadClient {
  uploadWhatsappBatch(data: {
    raw_text: string;
    uploaded_by: string;
  }): Observable<unknown>;
}

@Controller('api/v1/admin/whatsapp')
@UseGuards(JwtAuthGuard, AdminGuard)
export class AdminWhatsappController implements OnModuleInit {
  private svc!: InstructorUploadClient;

  constructor(@Inject(INSTRUCTOR_CLIENT) private readonly client: ClientGrpc) {}

  onModuleInit() {
    this.svc = this.client.getService<InstructorUploadClient>('InstructorService');
  }

  @Post()
  uploadBatch(
    @Body() body: { rawText: string; uploadedBy: string },
  ) {
    return firstValueFrom(
      this.svc.uploadWhatsappBatch({
        raw_text: body.rawText,
        uploaded_by: body.uploadedBy,
      }),
    );
  }
}
