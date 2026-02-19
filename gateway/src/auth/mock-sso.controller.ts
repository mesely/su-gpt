/**
 * Mock SU SSO — geliştirme ortamı için JWT üretir.
 * Gerçek SSO entegrasyonu sonraki fazda yapılacak.
 */
import { Body, Controller, Post } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';

interface LoginDto {
  studentId: string;
  major: string;
  isAdmin?: boolean;
}

@Controller('api/v1/auth')
export class MockSsoController {
  constructor(private readonly jwt: JwtService) {}

  @Post('login')
  login(@Body() dto: LoginDto) {
    const payload = {
      sub: dto.studentId,
      major: dto.major ?? 'CS',
      isAdmin: dto.isAdmin ?? false,
    };
    const token = this.jwt.sign(payload, { expiresIn: '7d' });
    return { accessToken: token };
  }
}
