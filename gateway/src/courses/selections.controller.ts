import { Body, Controller, Get, Put, Req, UseGuards } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { JwtPayload } from '../auth/jwt.strategy';

type Difficulty = 'easy' | 'balanced' | 'hard' | null;

interface SelectionState {
  selectedCourses: string[];
  isComplete: boolean;
  inProgressCourses: string[];
  lastPlanMajor: string | null;
  lastPlanDifficulty: Difficulty;
}

@Controller('api/v1/selections')
@UseGuards(JwtAuthGuard)
export class SelectionsController {
  private readonly filePath = path.join('/data', 'selections.json');

  @Get('me')
  getMine(@Req() req: { user: JwtPayload }) {
    const studentId = req.user.sub;
    const db = this.readDb();
    const item = db[studentId] ?? this.emptyState();
    return item;
  }

  @Put('me')
  saveMine(
    @Req() req: { user: JwtPayload },
    @Body() body: Partial<SelectionState>,
  ) {
    const studentId = req.user.sub;
    const db = this.readDb();
    const prev = db[studentId] ?? this.emptyState();
    db[studentId] = {
      selectedCourses: Array.isArray(body.selectedCourses) ? body.selectedCourses : prev.selectedCourses,
      isComplete: typeof body.isComplete === 'boolean' ? body.isComplete : prev.isComplete,
      inProgressCourses: Array.isArray(body.inProgressCourses) ? body.inProgressCourses : prev.inProgressCourses,
      lastPlanMajor: typeof body.lastPlanMajor === 'string' || body.lastPlanMajor === null ? body.lastPlanMajor : prev.lastPlanMajor,
      lastPlanDifficulty:
        body.lastPlanDifficulty === 'easy' || body.lastPlanDifficulty === 'balanced' || body.lastPlanDifficulty === 'hard' || body.lastPlanDifficulty === null
          ? body.lastPlanDifficulty
          : prev.lastPlanDifficulty,
    };
    this.writeDb(db);
    return { ok: true };
  }

  private emptyState(): SelectionState {
    return {
      selectedCourses: [],
      isComplete: false,
      inProgressCourses: [],
      lastPlanMajor: null,
      lastPlanDifficulty: null,
    };
  }

  private readDb(): Record<string, SelectionState> {
    try {
      if (!fs.existsSync(this.filePath)) return {};
      const parsed = JSON.parse(fs.readFileSync(this.filePath, 'utf-8')) as Record<string, SelectionState>;
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
      return {};
    }
  }

  private writeDb(data: Record<string, SelectionState>) {
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    fs.writeFileSync(this.filePath, JSON.stringify(data), 'utf-8');
  }
}
