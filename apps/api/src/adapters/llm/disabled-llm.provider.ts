import { ApiError } from '../../common/api-error.js';
import type { LlmProvider } from './llm.provider.js';

/** Used when no LLM vendor is configured: the tutor answers 503 and the app hides the chat. */
export class DisabledLlmProvider implements LlmProvider {
  readonly demo = false;
  async reply(): Promise<never> {
    throw new ApiError(503, 'tutor_unavailable');
  }
}
