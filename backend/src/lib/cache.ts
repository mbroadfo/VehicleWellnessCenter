/**
 * Memory-only cache for Lambda container optimization
 * Survives across invocations within same container (~15-45 min)
 */

interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}

export class MemoryCache {
  private cache = new Map<string, CacheEntry<unknown>>();

  get<T>(key: string): T | null {
    const entry = this.cache.get(key) as CacheEntry<T> | undefined;

    if (!entry) {
      console.log(`[Memory Cache MISS] ${key}`);
      return null;
    }

    if (entry.expiresAt < Date.now()) {
      console.log(`[Memory Cache EXPIRED] ${key}`);
      this.cache.delete(key);
      return null;
    }

    console.log(`[Memory Cache HIT] ${key}`);
    return entry.data;
  }

  set<T>(key: string, data: T, ttlSeconds: number): void {
    this.cache.set(key, {
      data,
      expiresAt: Date.now() + ttlSeconds * 1000,
    });
    console.log(`[Memory Cache SET] ${key} (TTL: ${ttlSeconds}s)`);
  }

  delete(key: string): void {
    this.cache.delete(key);
    console.log(`[Memory Cache DELETE] ${key}`);
  }

  clear(): void {
    this.cache.clear();
    console.log('[Memory Cache CLEARED]');
  }

  size(): number {
    return this.cache.size;
  }
}

// Singleton instance (survives across Lambda invocations)
export const memoryCache = new MemoryCache();
