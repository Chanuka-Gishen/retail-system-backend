import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';
import {
  OpenCashSessionDto,
  CloseCashSessionDto,
  CreateCashTransactionDto,
  ReconcileCashSessionDto,
  ListCashSessionsQueryDto,
} from '../dto/cash-session.dto';
import { CashSessionStatus, TenderType, Prisma } from '@prisma/client';

@Injectable()
export class CashSessionService {
  constructor(private db: DatabaseService) {}

  async getActiveSession(
    merchantId: string,
    posTerminalId?: string,
    cashierId?: string,
  ) {
    const where: Prisma.CashSessionWhereInput = {
      merchantId,
      status: CashSessionStatus.OPEN,
      ...(posTerminalId && { posTerminalId }),
      ...(cashierId && { openedById: cashierId }),
    };

    const session = await this.db.cashSession.findFirst({
      where,
      include: {
        posTerminal: { select: { id: true, code: true, name: true } },
        branch: { select: { id: true, code: true, name: true } },
        openedBy: { select: { id: true, firstName: true, lastName: true, email: true } },
        operations: { orderBy: { createdAt: 'desc' } },
        sales: {
          where: { status: 'COMPLETED' },
          select: {
            id: true,
            invoiceNumber: true,
            totalAmount: true,
            payments: {
              where: { tenderType: TenderType.CASH },
              select: { amount: true },
            },
          },
        },
      },
    });

    if (!session) {
      return null;
    }

    // Compute live expected cash breakdown
    const openingFloat = Number(session.openingFloat);
    let cashIn = 0;
    let cashOut = 0;
    for (const op of session.operations) {
      if (op.type === 'CASH_IN') cashIn += Number(op.amount);
      if (op.type === 'CASH_OUT') cashOut += Number(op.amount);
    }

    let cashSales = 0;
    for (const s of session.sales) {
      for (const p of s.payments) {
        cashSales += Number(p.amount);
      }
    }

    const currentExpectedCash = openingFloat + cashIn - cashOut + cashSales;

    return {
      ...session,
      summary: {
        openingFloat,
        totalCashIn: cashIn,
        totalCashOut: cashOut,
        totalCashSales: cashSales,
        currentExpectedCash,
      },
    };
  }

  async openSession(
    merchantId: string,
    dto: OpenCashSessionDto,
    cashierId: string,
  ) {
    // 1. Validate Terminal
    const terminal = await this.db.posTerminal.findFirst({
      where: { id: dto.posTerminalId, merchantId, isActive: true },
      include: { branch: true },
    });

    if (!terminal) {
      throw new NotFoundException(`Active POS Terminal ${dto.posTerminalId} not found.`);
    }

    // 2. Invariant: Terminal cannot have multiple concurrent OPEN sessions
    const existingTerminalSession = await this.db.cashSession.findFirst({
      where: {
        posTerminalId: dto.posTerminalId,
        status: CashSessionStatus.OPEN,
      },
    });

    if (existingTerminalSession) {
      throw new ConflictException(
        `POS Terminal "${terminal.code}" already has an active open cash drawer session (ID: ${existingTerminalSession.id}). Please close it first.`,
      );
    }

    // 3. Invariant: Cashier cannot be logged into multiple active registers simultaneously
    const existingCashierSession = await this.db.cashSession.findFirst({
      where: {
        merchantId,
        openedById: cashierId,
        status: CashSessionStatus.OPEN,
      },
      include: { posTerminal: { select: { code: true } } },
    });

    if (existingCashierSession) {
      throw new ConflictException(
        `Cashier already has an active open session on terminal "${existingCashierSession.posTerminal.code}". Close previous session before opening a new register.`,
      );
    }

    // 4. Open Cash Drawer Session
    return this.db.cashSession.create({
      data: {
        merchantId,
        branchId: terminal.branchId,
        posTerminalId: dto.posTerminalId,
        openedById: cashierId,
        status: CashSessionStatus.OPEN,
        openingFloat: dto.openingFloat,
        notes: dto.notes?.trim(),
      },
      include: {
        posTerminal: { select: { id: true, code: true, name: true } },
        branch: { select: { id: true, code: true, name: true } },
        openedBy: { select: { id: true, firstName: true, lastName: true, email: true } },
      },
    });
  }

  async addTransaction(
    merchantId: string,
    sessionId: string,
    dto: CreateCashTransactionDto,
    cashierId: string,
  ) {
    const session = await this.db.cashSession.findFirst({
      where: { id: sessionId, merchantId },
      include: {
        operations: true,
        sales: {
          where: { status: 'COMPLETED' },
          select: {
            payments: {
              where: { tenderType: TenderType.CASH },
              select: { amount: true },
            },
          },
        },
      },
    });

    if (!session) {
      throw new NotFoundException(`Cash drawer session ${sessionId} not found.`);
    }

    if (session.status !== CashSessionStatus.OPEN) {
      throw new BadRequestException(
        `Cannot perform cash transaction on session with status "${session.status}". Drawer session must be OPEN.`,
      );
    }

    // Safeguard: Prevent negative cash in drawer on CASH_OUT operations
    if (dto.type === 'CASH_OUT') {
      const openingFloat = Number(session.openingFloat);
      let cashIn = 0;
      let cashOut = 0;
      for (const op of session.operations) {
        if (op.type === 'CASH_IN') cashIn += Number(op.amount);
        if (op.type === 'CASH_OUT') cashOut += Number(op.amount);
      }
      let cashSales = 0;
      for (const s of session.sales) {
        for (const p of s.payments) {
          cashSales += Number(p.amount);
        }
      }

      const availableInDrawer = openingFloat + cashIn - cashOut + cashSales;
      if (dto.amount > availableInDrawer) {
        throw new BadRequestException(
          `CASH_OUT denied: Requested withdrawal (${dto.amount}) exceeds current available cash in drawer (${availableInDrawer.toFixed(2)}).`,
        );
      }
    }

    return this.db.cashTransaction.create({
      data: {
        merchantId,
        sessionId,
        type: dto.type,
        amount: dto.amount,
        reason: dto.reason.trim(),
        performedById: cashierId,
      },
      include: {
        performedBy: { select: { id: true, firstName: true, lastName: true, email: true } },
      },
    });
  }

  async closeSession(
    merchantId: string,
    sessionId: string,
    dto: CloseCashSessionDto,
    cashierId: string,
  ) {
    const session = await this.db.cashSession.findFirst({
      where: { id: sessionId, merchantId },
      include: {
        operations: true,
        sales: {
          where: { status: 'COMPLETED' },
          select: {
            id: true,
            payments: {
              where: { tenderType: TenderType.CASH },
              select: { amount: true },
            },
          },
        },
      },
    });

    if (!session) {
      throw new NotFoundException(`Cash drawer session ${sessionId} not found.`);
    }

    if (session.status !== CashSessionStatus.OPEN) {
      throw new BadRequestException(
        `Cannot close cash session with status "${session.status}". Session is already closed or reconciled.`,
      );
    }

    // Calculate closing cash expected: openingFloat + cashIn - cashOut + cashSales
    const openingFloat = Number(session.openingFloat);
    let cashIn = 0;
    let cashOut = 0;
    for (const op of session.operations) {
      if (op.type === 'CASH_IN') cashIn += Number(op.amount);
      if (op.type === 'CASH_OUT') cashOut += Number(op.amount);
    }

    let cashSales = 0;
    for (const s of session.sales) {
      for (const p of s.payments) {
        cashSales += Number(p.amount);
      }
    }

    const closingCashExpected = openingFloat + cashIn - cashOut + cashSales;
    const closingCashActual = Number(dto.closingCashActual);
    const difference = closingCashActual - closingCashExpected;

    const mergedNotes = [session.notes, dto.notes ? `Closing Note: ${dto.notes.trim()}` : null]
      .filter(Boolean)
      .join(' | ');

    return this.db.cashSession.update({
      where: { id: sessionId },
      data: {
        status: CashSessionStatus.CLOSED,
        closedById: cashierId,
        closedAt: new Date(),
        closingCashActual,
        closingCashExpected,
        difference,
        notes: mergedNotes || null,
      },
      include: {
        posTerminal: { select: { id: true, code: true, name: true } },
        branch: { select: { id: true, code: true, name: true } },
        openedBy: { select: { id: true, firstName: true, lastName: true, email: true } },
        closedBy: { select: { id: true, firstName: true, lastName: true, email: true } },
        operations: true,
      },
    });
  }

  async reconcileSession(
    merchantId: string,
    sessionId: string,
    dto: ReconcileCashSessionDto,
    _managerId: string,
  ) {
    const session = await this.db.cashSession.findFirst({
      where: { id: sessionId, merchantId },
    });

    if (!session) {
      throw new NotFoundException(`Cash drawer session ${sessionId} not found.`);
    }

    if (session.status !== CashSessionStatus.CLOSED) {
      throw new BadRequestException(
        `Cannot reconcile cash session with status "${session.status}". Session must be in CLOSED status to be reconciled.`,
      );
    }

    const mergedNotes = [
      session.notes,
      dto.notes ? `Manager Reconciliation: ${dto.notes.trim()}` : null,
    ]
      .filter(Boolean)
      .join(' | ');

    return this.db.cashSession.update({
      where: { id: sessionId },
      data: {
        status: CashSessionStatus.RECONCILED,
        notes: mergedNotes || null,
      },
      include: {
        posTerminal: { select: { id: true, code: true, name: true } },
        branch: { select: { id: true, code: true, name: true } },
        openedBy: { select: { id: true, firstName: true, lastName: true, email: true } },
        closedBy: { select: { id: true, firstName: true, lastName: true, email: true } },
      },
    });
  }

  async listSessions(merchantId: string, query: ListCashSessionsQueryDto) {
    const {
      branchId,
      posTerminalId,
      openedById,
      status,
      startDate,
      endDate,
      page = 1,
      limit = 20,
    } = query;
    const skip = (page - 1) * limit;

    const where: Prisma.CashSessionWhereInput = {
      merchantId,
      ...(branchId && { branchId }),
      ...(posTerminalId && { posTerminalId }),
      ...(openedById && { openedById }),
      ...(status && { status }),
      ...((startDate || endDate) && {
        openedAt: {
          ...(startDate && { gte: new Date(startDate) }),
          ...(endDate && { lte: new Date(endDate) }),
        },
      }),
    };

    const [total, items] = await Promise.all([
      this.db.cashSession.count({ where }),
      this.db.cashSession.findMany({
        where,
        skip,
        take: limit,
        include: {
          posTerminal: { select: { id: true, code: true, name: true } },
          branch: { select: { id: true, code: true, name: true } },
          openedBy: { select: { id: true, firstName: true, lastName: true, email: true } },
          closedBy: { select: { id: true, firstName: true, lastName: true, email: true } },
          _count: { select: { operations: true, sales: true } },
        },
        orderBy: { openedAt: 'desc' },
      }),
    ]);

    return {
      items,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async getSessionById(merchantId: string, id: string) {
    const session = await this.db.cashSession.findFirst({
      where: { id, merchantId },
      include: {
        posTerminal: true,
        branch: true,
        openedBy: { select: { id: true, firstName: true, lastName: true, email: true } },
        closedBy: { select: { id: true, firstName: true, lastName: true, email: true } },
        operations: {
          include: {
            performedBy: { select: { id: true, firstName: true, lastName: true } },
          },
          orderBy: { createdAt: 'asc' },
        },
        sales: {
          select: {
            id: true,
            invoiceNumber: true,
            totalAmount: true,
            paidAmount: true,
            status: true,
            createdAt: true,
            payments: true,
          },
        },
      },
    });

    if (!session) {
      throw new NotFoundException(`Cash drawer session ${id} not found.`);
    }

    return session;
  }
}
