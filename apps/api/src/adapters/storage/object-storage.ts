/**
 * Object storage for media and lesson packs (S3-compatible: AWS S3 in an Indian region, or the
 * State Data Centre's store; RustFS in dev). Implementations live in this folder only (ADR-010).
 */
export interface ObjectStorage {
  put(key: string, body: Buffer, contentType: string): Promise<void>;
  get(key: string): Promise<Buffer>;
  exists(key: string): Promise<boolean>;
}

export const OBJECT_STORAGE = Symbol('OBJECT_STORAGE');
