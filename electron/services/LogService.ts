import path from 'path';
import fs from 'fs';
import { app } from 'electron';

/**
 * LogService: Structured logging with rotation, correlation IDs, and optional remote logging
 */

export enum LogLevel {
  DEBUG = 'DEBUG',
  INFO = 'INFO',
  WARN = 'WARN',
  ERROR = 'ERROR',
}

export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  module: string;
  message: string;
  correlationId?: string;
  processId?: number;
  context?: Record<string, any>;
  stackTrace?: string;
}

class LogServiceImpl {
  private logDir: string;
  private correlationStack: string[] = [];
  private currentLogFile: string | null = null;
  private fileHandle: fs.WriteStream | null = null;
  private minLogLevel: LogLevel = LogLevel.DEBUG;
  private maxLogSizeBytes: number = 10 * 1024 * 1024; // 10MB
  private maxLogFiles: number = 5;
  private remoteLogger?: (entry: LogEntry) => Promise<void>;

  constructor() {
    this.logDir = path.join(
      app?.getPath?.('userData') || process.cwd(),
      'logs',
    );

    // Create log directory if it doesn't exist
    if (!fs.existsSync(this.logDir)) {
      fs.mkdirSync(this.logDir, { recursive: true });
    }

    this.setupLogFile();
  }

  /**
   * Setup new log file with rotation
   */
  private setupLogFile(): void {
    const timestamp = new Date().toISOString().split('T')[0];
    const baseFilename = `daemon-${timestamp}.log`;
    const filePath = path.join(this.logDir, baseFilename);

    this.currentLogFile = filePath;

    // If file exists and is large, rotate it
    if (fs.existsSync(filePath)) {
      const stats = fs.statSync(filePath);
      if (stats.size > this.maxLogSizeBytes) {
        this.rotateLogFiles();
        return;
      }
    }

    this.fileHandle = fs.createWriteStream(filePath, { flags: 'a' });
  }

  /**
   * Rotate log files when size exceeded
   */
  private rotateLogFiles(): void {
    const timestamp = new Date()
      .toISOString()
      .replace(/[:.]/g, '-');
    const oldName = this.currentLogFile!;
    const newName = oldName.replace(
      /\.log$/,
      `-${timestamp}.log`,
    );

    if (this.fileHandle) {
      this.fileHandle.destroy();
      this.fileHandle = null;
    }

    fs.renameSync(oldName, newName);

    // Clean up old files
    const files = fs
      .readdirSync(this.logDir)
      .filter((f) => f.startsWith('daemon-'))
      .sort()
      .reverse();

    for (let i = this.maxLogFiles; i < files.length; i++) {
      fs.unlinkSync(path.join(this.logDir, files[i]));
    }

    this.setupLogFile();
  }

  /**
   * Start a correlation context (for tracing related logs)
   */
  startCorrelation(correlationId: string): void {
    this.correlationStack.push(correlationId);
  }

  /**
   * End current correlation context
   */
  endCorrelation(): void {
    this.correlationStack.pop();
  }

  /**
   * Get current correlation ID
   */
  getCurrentCorrelationId(): string | undefined {
    return this.correlationStack[this.correlationStack.length - 1];
  }

  /**
   * Core logging method
   */
  log(
    level: LogLevel,
    module: string,
    message: string,
    context?: Record<string, any>,
    stackTrace?: string,
  ): void {
    // Check log level
    const levels = [
      LogLevel.DEBUG,
      LogLevel.INFO,
      LogLevel.WARN,
      LogLevel.ERROR,
    ];
    if (levels.indexOf(level) < levels.indexOf(this.minLogLevel)) {
      return;
    }

    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      module,
      message,
      correlationId: this.getCurrentCorrelationId(),
      processId: process.pid,
      context,
      stackTrace,
    };

    this.writeLogEntry(entry);

    // Send to remote logger if configured
    if (this.remoteLogger && level !== LogLevel.DEBUG) {
      this.remoteLogger(entry).catch((err) => {
        console.error('Remote logging failed:', err);
      });
    }
  }

  /**
   * Write log entry to file and console
   */
  private writeLogEntry(entry: LogEntry): void {
    const formatted = this.formatLogEntry(entry);

    // Write to file
    if (this.fileHandle && !this.fileHandle.destroyed) {
      this.fileHandle.write(formatted + '\n', (err) => {
        if (err) {
          console.error('Failed to write log:', err);
        }
      });

      // Check file size
      if (
        this.currentLogFile &&
        fs.existsSync(this.currentLogFile)
      ) {
        const stats = fs.statSync(this.currentLogFile);
        if (stats.size > this.maxLogSizeBytes) {
          this.rotateLogFiles();
        }
      }
    }

    // Console output
    const consoleColor =
      entry.level === LogLevel.ERROR
        ? '\x1b[31m'
        : entry.level === LogLevel.WARN
          ? '\x1b[33m'
          : entry.level === LogLevel.DEBUG
            ? '\x1b[36m'
            : '\x1b[0m';

    const resetColor = '\x1b[0m';
    console.log(
      `${consoleColor}${formatted}${resetColor}`,
    );
  }

  /**
   * Format log entry as string
   */
  private formatLogEntry(entry: LogEntry): string {
    let line = `[${entry.timestamp}] [${entry.level}] [${entry.module}]`;

    if (entry.correlationId) {
      line += ` [${entry.correlationId}]`;
    }

    line += ` ${entry.message}`;

    if (entry.context && Object.keys(entry.context).length > 0) {
      line += ` ${JSON.stringify(entry.context)}`;
    }

    if (entry.stackTrace) {
      line += `\n${entry.stackTrace}`;
    }

    return line;
  }

  /**
   * Convenience methods
   */
  debug(
    module: string,
    message: string,
    context?: Record<string, any>,
  ): void {
    this.log(LogLevel.DEBUG, module, message, context);
  }

  info(
    module: string,
    message: string,
    context?: Record<string, any>,
  ): void {
    this.log(LogLevel.INFO, module, message, context);
  }

  warn(
    module: string,
    message: string,
    context?: Record<string, any>,
  ): void {
    this.log(LogLevel.WARN, module, message, context);
  }

  error(
    module: string,
    message: string,
    error?: Error,
    context?: Record<string, any>,
  ): void {
    this.log(
      LogLevel.ERROR,
      module,
      message,
      context,
      error?.stack,
    );
  }

  /**
   * Set minimum log level
   */
  setMinLevel(level: LogLevel): void {
    this.minLogLevel = level;
  }

  /**
   * Configure remote logger
   */
  setRemoteLogger(
    fn: (entry: LogEntry) => Promise<void>,
  ): void {
    this.remoteLogger = fn;
  }

  /**
   * Get log file directory
   */
  getLogDir(): string {
    return this.logDir;
  }

  /**
   * Graceful shutdown
   */
  shutdown(): void {
    if (this.fileHandle && !this.fileHandle.destroyed) {
      this.fileHandle.end();
    }
  }
}

export const LogService = new LogServiceImpl();
