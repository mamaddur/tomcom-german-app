import { Global, Module } from '@nestjs/common';
import { ENV, type Env } from '../../config/env.js';
import { DevLlmProvider } from './dev-llm.provider.js';
import { DisabledLlmProvider } from './disabled-llm.provider.js';
import { LLM_PROVIDER, type LlmProvider } from './llm.provider.js';

@Global()
@Module({
  providers: [
    {
      provide: LLM_PROVIDER,
      inject: [ENV],
      useFactory: (env: Env): LlmProvider => {
        switch (env.LLM_PROVIDER) {
          case 'dev':
            return new DevLlmProvider();
          case 'none':
            return new DisabledLlmProvider();
        }
      },
    },
  ],
  exports: [LLM_PROVIDER],
})
export class LlmModule {}
