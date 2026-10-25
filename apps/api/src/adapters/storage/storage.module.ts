import { Global, Module } from '@nestjs/common';
import { ENV, type Env } from '../../config/env.js';
import { OBJECT_STORAGE } from './object-storage.js';
import { S3ObjectStorage } from './s3-object-storage.js';

@Global()
@Module({
  providers: [
    {
      provide: OBJECT_STORAGE,
      inject: [ENV],
      useFactory: async (env: Env) => {
        const storage = new S3ObjectStorage(env);
        // Only a local emulator (explicit endpoint) in dev/test gets its bucket created here.
        const local =
          env.S3_ENDPOINT !== undefined && (env.APP_ENV === 'dev' || env.APP_ENV === 'test');
        if (local) await storage.ensureBucket();
        return storage;
      },
    },
  ],
  exports: [OBJECT_STORAGE],
})
export class StorageModule {}
