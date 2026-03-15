/**
 * Type declarations for packages without @types
 */

declare module 'xlsx' {
  export const utils: any;
  export function read(data: any, options?: any): any;
  export function write(workbook: any, options?: any): any;
}

declare module 'csv-parse/sync' {
  export function parse(input: string, options?: any): any[];
}

declare module 'redis' {
  export interface RedisClientType {
    isOpen: boolean;
    connect(): Promise<void>;
    setEx(key: string, ttl: number, value: string): Promise<void>;
    get(key: string): Promise<string | null>;
    del(key: string): Promise<void>;
    quit(): Promise<void>;
    on(event: string, listener: (error: Error) => void): void;
  }

  export function createClient(options?: { url?: string }): RedisClientType;
}

declare module 'multer' {
  import { Request } from 'express';

  export interface File {
    fieldname: string;
    originalname: string;
    encoding: string;
    mimetype: string;
    size: number;
    buffer: Buffer;
  }

  export type FileFilterCallback = (error: Error | null, acceptFile: boolean) => void;

  export interface Options {
    storage?: any;
    limits?: {
      fileSize?: number;
    };
    fileFilter?: (req: any, file: File, callback: FileFilterCallback) => void;
  }

  namespace multer {
    export function memoryStorage(): any;
  }

  function multer(options?: Options): {
    single(fieldName: string): any;
  };

  export default multer;
}
