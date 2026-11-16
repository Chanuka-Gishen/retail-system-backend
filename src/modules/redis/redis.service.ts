import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private client?: Redis;
  private isRedisEnabled = false;

  // In-memory fallback session store when Redis is not enabled
  private inMemorySessions = new Map<
    string,
    { data: { refreshTokenHash: string; userAgent?: string; ip?: string }; expiresAt: number }
  >();
  private inMemoryUserSessionSets = new Map<string, Set<string>>();

  constructor(private configService: ConfigService) {}

  onModuleInit() {
    const useRedis = this.configService.get<string>('USE_REDIS') === 'true';

    if (!useRedis) {
      this.logger.log('Redis is disabled (USE_REDIS=false). Using in-memory session manager.');
      this.isRedisEnabled = false;
      return;
    }

    const host = this.configService.get<string>('REDIS_HOST', 'localhost');
    const port = this.configService.get<number>('REDIS_PORT', 6379);
    const password = this.configService.get<string>('REDIS_PASSWORD') || undefined;

    try {
      this.client = new Redis({
        host,
        port,
        password,
        lazyConnect: true,
        retryStrategy(times) {
          return Math.min(times * 100, 3000);
        },
      });

      this.client.on('connect', () => {
        this.logger.log(`Connected to Redis instance on ${host}:${port}`);
        this.isRedisEnabled = true;
      });

      this.client.on('error', (err) => {
        this.logger.warn(`Redis connection error: ${err.message}. Falling back to in-memory store.`);
        this.isRedisEnabled = false;
      });

      this.client.connect().catch((err) => {
        this.logger.warn(`Could not connect to Redis: ${err.message}. Operating in in-memory mode.`);
        this.isRedisEnabled = false;
      });
    } catch (err: any) {
      this.logger.warn(`Redis initialization failed: ${err.message}. Operating in in-memory mode.`);
      this.isRedisEnabled = false;
    }
  }

  async onModuleDestroy() {
    if (this.client) {
      await this.client.quit();
    }
  }

  getClient(): Redis | undefined {
    return this.client;
  }

  // Session & Refresh Token Management
  // Key format: auth:session:<userId>:<sessionId> -> { refreshTokenHash, userAgent, ip, createdAt }
  async saveSession(
    userId: string,
    sessionId: string,
    sessionData: { refreshTokenHash: string; userAgent?: string; ip?: string },
    ttlSeconds = 7 * 24 * 3600, // 7 days
  ): Promise<void> {
    if (this.isRedisEnabled && this.client) {
      const key = `auth:session:${userId}:${sessionId}`;
      await this.client.set(key, JSON.stringify(sessionData), 'EX', ttlSeconds);
      await this.client.sadd(`auth:user_sessions:${userId}`, sessionId);
      return;
    }

    // In-Memory store
    const sessionKey = `${userId}:${sessionId}`;
    const expiresAt = Date.now() + ttlSeconds * 1000;
    this.inMemorySessions.set(sessionKey, { data: sessionData, expiresAt });

    if (!this.inMemoryUserSessionSets.has(userId)) {
      this.inMemoryUserSessionSets.set(userId, new Set());
    }
    this.inMemoryUserSessionSets.get(userId)!.add(sessionId);
  }

  async getSession(
    userId: string,
    sessionId: string,
  ): Promise<{ refreshTokenHash: string; userAgent?: string; ip?: string } | null> {
    if (this.isRedisEnabled && this.client) {
      const key = `auth:session:${userId}:${sessionId}`;
      const data = await this.client.get(key);
      return data ? JSON.parse(data) : null;
    }

    // In-Memory store
    const sessionKey = `${userId}:${sessionId}`;
    const entry = this.inMemorySessions.get(sessionKey);
    if (!entry) return null;

    if (Date.now() > entry.expiresAt) {
      this.inMemorySessions.delete(sessionKey);
      this.inMemoryUserSessionSets.get(userId)?.delete(sessionId);
      return null;
    }

    return entry.data;
  }

  async deleteSession(userId: string, sessionId: string): Promise<void> {
    if (this.isRedisEnabled && this.client) {
      const key = `auth:session:${userId}:${sessionId}`;
      await this.client.del(key);
      await this.client.srem(`auth:user_sessions:${userId}`, sessionId);
      return;
    }

    // In-Memory store
    const sessionKey = `${userId}:${sessionId}`;
    this.inMemorySessions.delete(sessionKey);
    this.inMemoryUserSessionSets.get(userId)?.delete(sessionId);
  }

  // Revoke all sessions (e.g. when token reuse is detected or password reset or suspension)
  async revokeAllUserSessions(userId: string): Promise<void> {
    if (this.isRedisEnabled && this.client) {
      const sessionIds = await this.client.smembers(`auth:user_sessions:${userId}`);
      if (sessionIds && sessionIds.length > 0) {
        const keys = sessionIds.map((sid) => `auth:session:${userId}:${sid}`);
        await this.client.del(...keys);
        await this.client.del(`auth:user_sessions:${userId}`);
      }
      return;
    }

    // In-Memory store
    const sessionIds = this.inMemoryUserSessionSets.get(userId);
    if (sessionIds) {
      for (const sid of sessionIds) {
        this.inMemorySessions.delete(`${userId}:${sid}`);
      }
      this.inMemoryUserSessionSets.delete(userId);
    }
  }
}
