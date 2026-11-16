import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';
import {
  CreatePosTerminalDto,
  UpdatePosTerminalDto,
  ListPosTerminalsQueryDto,
} from '../dto/terminal.dto';
import { CashSessionStatus, Prisma } from '@prisma/client';

@Injectable()
export class PosTerminalService {
  constructor(private db: DatabaseService) {}

  async listTerminals(merchantId: string, query: ListPosTerminalsQueryDto) {
    const { branchId, isActive, search, page = 1, limit = 20 } = query;
    const skip = (page - 1) * limit;

    const where: Prisma.PosTerminalWhereInput = {
      merchantId,
      ...(branchId && { branchId }),
      ...(isActive !== undefined && { isActive }),
      ...(search && {
        OR: [
          { code: { contains: search, mode: 'insensitive' } },
          { name: { contains: search, mode: 'insensitive' } },
          { hardwareIdentifier: { contains: search, mode: 'insensitive' } },
        ],
      }),
    };

    const [total, items] = await Promise.all([
      this.db.posTerminal.count({ where }),
      this.db.posTerminal.findMany({
        where,
        skip,
        take: limit,
        include: {
          branch: { select: { id: true, code: true, name: true } },
          cashSessions: {
            where: { status: CashSessionStatus.OPEN },
            take: 1,
            select: { id: true, openedById: true, openedAt: true, openingFloat: true },
          },
        },
        orderBy: [{ branch: { name: 'asc' } }, { code: 'asc' }],
      }),
    ]);

    // Attach activeSession flag for convenience
    const formatted = items.map((terminal) => {
      const activeSession = terminal.cashSessions[0] || null;
      return {
        ...terminal,
        hasActiveSession: !!activeSession,
        activeSession,
      };
    });

    return {
      items: formatted,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async getTerminalById(merchantId: string, id: string) {
    const terminal = await this.db.posTerminal.findFirst({
      where: { id, merchantId },
      include: {
        branch: { select: { id: true, code: true, name: true, address: true } },
        cashSessions: {
          where: { status: CashSessionStatus.OPEN },
          take: 1,
          include: {
            openedBy: { select: { id: true, firstName: true, lastName: true, email: true } },
          },
        },
      },
    });

    if (!terminal) {
      throw new NotFoundException(`POS Terminal ${id} not found.`);
    }

    const activeSession = terminal.cashSessions[0] || null;
    return {
      ...terminal,
      hasActiveSession: !!activeSession,
      activeSession,
    };
  }

  async createTerminal(merchantId: string, dto: CreatePosTerminalDto) {
    // 1. Validate Branch
    const branch = await this.db.branch.findFirst({
      where: { id: dto.branchId, merchantId, isActive: true },
    });
    if (!branch) {
      throw new NotFoundException(`Active branch ${dto.branchId} not found.`);
    }

    // 2. Validate uniqueness of (merchantId, branchId, code)
    const code = dto.code.trim().toUpperCase();
    const existing = await this.db.posTerminal.findUnique({
      where: {
        merchantId_branchId_code: {
          merchantId,
          branchId: dto.branchId,
          code,
        },
      },
    });

    if (existing) {
      throw new ConflictException(
        `POS Terminal with code "${code}" already exists in branch "${branch.name}".`,
      );
    }

    return this.db.posTerminal.create({
      data: {
        merchantId,
        branchId: dto.branchId,
        code,
        name: dto.name.trim(),
        hardwareIdentifier: dto.hardwareIdentifier?.trim(),
        isActive: true,
      },
      include: {
        branch: { select: { id: true, code: true, name: true } },
      },
    });
  }

  async updateTerminal(merchantId: string, id: string, dto: UpdatePosTerminalDto) {
    const existing = await this.db.posTerminal.findFirst({
      where: { id, merchantId },
    });

    if (!existing) {
      throw new NotFoundException(`POS Terminal ${id} not found.`);
    }

    return this.db.posTerminal.update({
      where: { id },
      data: {
        ...(dto.name && { name: dto.name.trim() }),
        ...(dto.hardwareIdentifier !== undefined && {
          hardwareIdentifier: dto.hardwareIdentifier?.trim(),
        }),
        ...(dto.isActive !== undefined && { isActive: dto.isActive }),
      },
      include: {
        branch: { select: { id: true, code: true, name: true } },
      },
    });
  }
}
