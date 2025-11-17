/**
 * Unit Tests for MemoryCache
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { MemoryCache } from './cache';

describe('MemoryCache', () => {
  let cache: MemoryCache;

  beforeEach(() => {
    cache = new MemoryCache();
  });

  describe('get()', () => {
    it('should return null on cache miss', () => {
      expect(cache.get('nonexistent')).toBeNull();
    });

    it('should return cached data on hit', () => {
      cache.set('key1', { value: 'test' }, 60);
      expect(cache.get('key1')).toEqual({ value: 'test' });
    });

    it('should return null for expired entries', async () => {
      // Set with 1 second TTL
      cache.set('expiring', { value: 'temp' }, 1);

      // Wait 1.1 seconds for expiration
      await new Promise((resolve) => setTimeout(resolve, 1100));

      expect(cache.get('expiring')).toBeNull();
    });

    it('should handle different data types', () => {
      cache.set('string', 'hello', 60);
      cache.set('number', 42, 60);
      cache.set('array', [1, 2, 3], 60);
      cache.set('object', { nested: { deep: true } }, 60);

      expect(cache.get('string')).toBe('hello');
      expect(cache.get('number')).toBe(42);
      expect(cache.get('array')).toEqual([1, 2, 3]);
      expect(cache.get('object')).toEqual({ nested: { deep: true } });
    });
  });

  describe('set()', () => {
    it('should store data with TTL', () => {
      cache.set('key1', 'value1', 60);
      expect(cache.get('key1')).toBe('value1');
    });

    it('should overwrite existing keys', () => {
      cache.set('key1', 'original', 60);
      cache.set('key1', 'updated', 60);
      expect(cache.get('key1')).toBe('updated');
    });
  });

  describe('delete()', () => {
    it('should remove entry from cache', () => {
      cache.set('key1', 'value1', 60);
      expect(cache.get('key1')).toBe('value1');

      cache.delete('key1');
      expect(cache.get('key1')).toBeNull();
    });

    it('should handle deleting non-existent keys', () => {
      expect(() => cache.delete('nonexistent')).not.toThrow();
    });
  });

  describe('clear()', () => {
    it('should remove all entries', () => {
      cache.set('key1', 'value1', 60);
      cache.set('key2', 'value2', 60);
      cache.set('key3', 'value3', 60);

      expect(cache.size()).toBe(3);

      cache.clear();

      expect(cache.size()).toBe(0);
      expect(cache.get('key1')).toBeNull();
      expect(cache.get('key2')).toBeNull();
      expect(cache.get('key3')).toBeNull();
    });
  });

  describe('size()', () => {
    it('should return 0 for empty cache', () => {
      expect(cache.size()).toBe(0);
    });

    it('should return correct count', () => {
      cache.set('key1', 'value1', 60);
      expect(cache.size()).toBe(1);

      cache.set('key2', 'value2', 60);
      expect(cache.size()).toBe(2);

      cache.set('key3', 'value3', 60);
      expect(cache.size()).toBe(3);
    });

    it('should not count expired entries', async () => {
      cache.set('key1', 'value1', 1);
      expect(cache.size()).toBe(1);

      // Wait for expiration
      await new Promise((resolve) => setTimeout(resolve, 1100));

      // Access to trigger cleanup
      cache.get('key1');

      expect(cache.size()).toBe(0);
    });
  });
});
