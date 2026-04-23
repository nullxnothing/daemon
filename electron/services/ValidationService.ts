import path from 'path';
import { LogService } from './LogService';

/**
 * ValidationService: Input validation at IPC boundaries
 * Prevents injection attacks, path traversal, and invalid state
 * NOTE: For production, consider replacing with Zod for more robust validation
 */

export interface ValidationResult<T> {
  success: boolean;
  data?: T;
  errors?: string[];
}

interface ValidationRule {
  type: 'string' | 'number' | 'object' | 'array' | 'boolean';
  required?: boolean;
  minLength?: number;
  maxLength?: number;
  min?: number;
  max?: number;
  pattern?: RegExp;
  custom?: (value: any) => boolean;
}

class ValidationServiceImpl {
  private pathWhitelist: Set<string> = new Set();
  private rateLimitStore: Map<string, number[]> = new Map();
  private static readonly EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  /**
   * Validate string input
   */
  validateString(
    value: unknown,
    minLength: number = 1,
    maxLength: number = 10000,
    pattern?: RegExp,
  ): ValidationResult<string> {
    if (typeof value !== 'string') {
      return { success: false, errors: ['Expected string'] };
    }

    if (value.length < minLength) {
      return {
        success: false,
        errors: [`String too short (min ${minLength})`],
      };
    }

    if (value.length > maxLength) {
      return {
        success: false,
        errors: [`String too long (max ${maxLength})`],
      };
    }

    if (pattern && !pattern.test(value)) {
      return {
        success: false,
        errors: ['String does not match required pattern'],
      };
    }

    return { success: true, data: value };
  }

  /**
   * Validate number input
   */
  validateNumber(
    value: unknown,
    min?: number,
    max?: number,
    isInteger?: boolean,
  ): ValidationResult<number> {
    if (typeof value !== 'number') {
      return { success: false, errors: ['Expected number'] };
    }

    if (isInteger && !Number.isInteger(value)) {
      return {
        success: false,
        errors: ['Expected integer'],
      };
    }

    if (min !== undefined && value < min) {
      return {
        success: false,
        errors: [`Number below minimum (${min})`],
      };
    }

    if (max !== undefined && value > max) {
      return {
        success: false,
        errors: [`Number above maximum (${max})`],
      };
    }

    return { success: true, data: value };
  }

  /**
   * Validate object input
   */
  validateObject(
    value: unknown,
    schema: Record<string, ValidationRule>,
  ): ValidationResult<Record<string, any>> {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      return { success: false, errors: ['Expected object'] };
    }

    const obj = value as Record<string, any>;
    const errors: string[] = [];

    for (const [key, rule] of Object.entries(schema)) {
      const fieldValue = obj[key];

      if (rule.required && (fieldValue === undefined || fieldValue === null)) {
        errors.push(`${key}: Required field missing`);
        continue;
      }

      if (fieldValue === undefined || fieldValue === null) {
        continue;
      }

      // Type check
      if (typeof fieldValue !== rule.type) {
        errors.push(
          `${key}: Expected type ${rule.type}, got ${typeof fieldValue}`,
        );
        continue;
      }

      // String validations
      if (rule.type === 'string' && typeof fieldValue === 'string') {
        if (
          rule.minLength &&
          fieldValue.length < rule.minLength
        ) {
          errors.push(`${key}: String too short`);
        }
        if (
          rule.maxLength &&
          fieldValue.length > rule.maxLength
        ) {
          errors.push(`${key}: String too long`);
        }
        if (rule.pattern && !rule.pattern.test(fieldValue)) {
          errors.push(`${key}: String does not match pattern`);
        }
      }

      // Number validations
      if (rule.type === 'number' && typeof fieldValue === 'number') {
        if (rule.min !== undefined && fieldValue < rule.min) {
          errors.push(`${key}: Number below minimum`);
        }
        if (rule.max !== undefined && fieldValue > rule.max) {
          errors.push(`${key}: Number above maximum`);
        }
      }

      // Custom validation
      if (rule.custom && !rule.custom(fieldValue)) {
        errors.push(`${key}: Custom validation failed`);
      }
    }

    if (errors.length > 0) {
      return { success: false, errors };
    }

    return { success: true, data: obj };
  }

  validateEmailAddress(value: unknown): ValidationResult<string> {
    const trimmedValue = typeof value === 'string' ? value.trim() : value;
    const result = this.validateString(
      trimmedValue,
      3,
      320,
      ValidationServiceImpl.EMAIL_PATTERN,
    );
    if (!result.success) {
      return { success: false, errors: ['Invalid email address'] };
    }
    return result;
  }

  validateEmailList(value: unknown): ValidationResult<string | undefined> {
    if (value === undefined || value === null || value === '') {
      return { success: true, data: undefined };
    }

    const raw = this.validateString(value, 3, 4000);
    if (!raw.success || !raw.data) {
      return { success: false, errors: ['Invalid email list'] };
    }

    const emails = raw.data
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);

    if (emails.length === 0) {
      return { success: true, data: undefined };
    }

    for (const email of emails) {
      if (!ValidationServiceImpl.EMAIL_PATTERN.test(email)) {
        return { success: false, errors: [`Invalid email address: ${email}`] };
      }
    }

    return { success: true, data: emails.join(', ') };
  }

  /**
   * Validate file path for traversal attacks
   */
  validateFilePath(
    filePath: string,
    baseDir: string,
  ): ValidationResult<string> {
    // Normalize paths
    const normalized = path.normalize(filePath);
    const normalizedBase = path.normalize(baseDir);

    // Check for traversal
    if (normalized.includes('..')) {
      return {
        success: false,
        errors: ['Path traversal detected'],
      };
    }

    // Check if resolved path is within base directory
    const resolved = path.resolve(normalizedBase, normalized);
    const resolvedBase = path.resolve(normalizedBase);

    if (
      !resolved.startsWith(resolvedBase) &&
      resolved !== resolvedBase
    ) {
      return {
        success: false,
        errors: ['Path escapes base directory'],
      };
    }

    return { success: true, data: resolved };
  }

  /**
   * Sanitize user input for display
   */
  sanitizeForDisplay(input: string): string {
    return input
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#x27;')
      .replace(/\//g, '&#x2F;');
  }

  /**
   * Validate rate limit
   */
  checkRateLimit(
    identifier: string,
    maxRequests: number,
    windowMs: number,
  ): boolean {
    const key = `rl:${identifier}`;
    const now = Date.now();
    const windowStart = now - Math.max(windowMs, 0);
    const existing = this.rateLimitStore.get(key) ?? [];
    const recent = existing.filter((timestamp) => timestamp > windowStart);

    if (recent.length >= maxRequests) {
      this.rateLimitStore.set(key, recent);
      return false;
    }

    recent.push(now);
    this.rateLimitStore.set(key, recent);
    return true;
  }

  /**
   * Validate required environment variables
   */
  validateEnvVars(required: string[]): ValidationResult<void> {
    const missing = required.filter(
      (key) => !process.env[key],
    );

    if (missing.length > 0) {
      return {
        success: false,
        errors: [
          `Missing environment variables: ${missing.join(', ')}`,
        ],
      };
    }

    return { success: true };
  }

  /**
   * Add trusted path (whitelisting)
   */
  whitelistPath(dirPath: string): void {
    this.pathWhitelist.add(
      path.normalize(dirPath),
    );
  }

  /**
   * Check if path is whitelisted
   */
  isPathWhitelisted(filePath: string): boolean {
    const normalized = path.normalize(filePath);

    for (const whitelistedPath of this.pathWhitelist) {
      if (
        normalized === whitelistedPath ||
        normalized.startsWith(whitelistedPath + path.sep)
      ) {
        return true;
      }
    }

    return false;
  }

  /**
   * Get common validation schemas for IPC inputs
   * Returns objects with common validation rules
   */
  getCommonSchemas() {
    return {
      agentName: {
        type: 'string' as const,
        minLength: 1,
        maxLength: 100,
        pattern: /^[a-zA-Z0-9\s\-_]+$/,
      },
      projectPath: {
        type: 'string' as const,
        minLength: 1,
        maxLength: 500,
      },
      filePath: {
        type: 'string' as const,
        minLength: 1,
        maxLength: 1000,
        custom: (p: string) => !p.includes('..'),
      },
      shellCommand: {
        type: 'string' as const,
        minLength: 1,
        maxLength: 2000,
        custom: (c: string) =>
          !c.includes('`') &&
          !c.includes('$(') &&
          !c.includes('{') &&
          !c.includes('}'),
      },
      httpUrl: {
        type: 'string' as const,
        custom: (u: string) =>
          (u.startsWith('http://') || u.startsWith('https://')) &&
          u.length < 2000,
      },
      port: {
        type: 'number' as const,
        min: 1024,
        max: 65535,
      },
      walletAddress: {
        type: 'string' as const,
        minLength: 32,
        maxLength: 100,
        pattern: /^[a-zA-Z0-9]+$/,
      },
    };
  }
}

export const ValidationService = new ValidationServiceImpl();
