import * as dotenv from 'dotenv';
dotenv.config();

import { PrismaClient, OutboxStatus } from '@prisma/client';

const prisma = new PrismaClient();
const POLL_INTERVAL_MS = parseInt(process.env.OUTBOX_POLL_INTERVAL_MS || '3000', 10);
const BATCH_SIZE = parseInt(process.env.OUTBOX_BATCH_SIZE || '50', 10);

class OutboxProcessor {
  private isRunning = false;
  private timer: NodeJS.Timeout | null = null;

  async start() {
    this.isRunning = true;
    console.log('[Worker] Outbox Processor started. Polling interval:', POLL_INTERVAL_MS, 'ms');
    this.scheduleNextRun();
  }

  private scheduleNextRun() {
    if (!this.isRunning) return;
    this.timer = setTimeout(async () => {
      try {
        await this.processPendingEvents();
      } catch (err) {
        console.error('[Worker] Error processing outbox events:', err);
      } finally {
        this.scheduleNextRun();
      }
    }, POLL_INTERVAL_MS);
  }

  async processPendingEvents() {
    const pendingEvents = await prisma.outboxEvent.findMany({
      where: {
        status: OutboxStatus.PENDING,
        scheduledAt: { lte: new Date() },
      },
      take: BATCH_SIZE,
      orderBy: { scheduledAt: 'asc' },
    });

    if (pendingEvents.length === 0) {
      return;
    }

    console.log(`[Worker] Found ${pendingEvents.length} pending outbox events.`);

    for (const event of pendingEvents) {
      try {
        await prisma.outboxEvent.update({
          where: { id: event.id },
          data: { status: OutboxStatus.PROCESSING },
        });

        // Event Dispatching Logic based on eventType
        console.log(`[Worker] Dispatching event ${event.id}: [${event.eventType}] for ${event.aggregateType}#${event.aggregateId}`);

        // Mark event completed
        await prisma.outboxEvent.update({
          where: { id: event.id },
          data: {
            status: OutboxStatus.COMPLETED,
            processedAt: new Date(),
          },
        });
      } catch (err: any) {
        const nextRetry = event.retryCount + 1;
        const isDeadLetter = nextRetry >= event.maxRetries;

        console.error(`[Worker] Failed event ${event.id} (attempt ${nextRetry}/${event.maxRetries}):`, err.message);

        await prisma.outboxEvent.update({
          where: { id: event.id },
          data: {
            status: isDeadLetter ? OutboxStatus.DEAD_LETTER : OutboxStatus.PENDING,
            retryCount: nextRetry,
            errorMessage: err.message || 'Unknown processing error',
            scheduledAt: new Date(Date.now() + Math.pow(2, nextRetry) * 1000), // Exponential backoff
          },
        });
      }
    }
  }

  stop() {
    this.isRunning = false;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    console.log('[Worker] Outbox Processor stopped.');
  }
}

async function bootstrap() {
  const processor = new OutboxProcessor();
  await processor.start();

  const shutdown = async () => {
    console.log('[Worker] Graceful shutdown initiated...');
    processor.stop();
    await prisma.$disconnect();
    process.exit(0);
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

bootstrap().catch((err) => {
  console.error('[Worker] Fatal error during bootstrap:', err);
  process.exit(1);
});
