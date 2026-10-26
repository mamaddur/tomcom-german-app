/**
 * The language model behind the AI tutor (ADR-010). Implementations live in this folder only.
 * They receive the prompt the tutor module built (first name, level and lesson context, nothing
 * else: NFR-15) and must never log prompts or replies.
 */
export interface LlmMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface LlmRequest {
  system: string;
  messages: LlmMessage[];
  /** The language the learner reads explanations in. */
  replyLanguage: 'te' | 'en';
  maxTokens: number;
}

export interface LlmReply {
  text: string;
  inputTokens: number;
  outputTokens: number;
}

export interface LlmProvider {
  /** True for the built-in stand-in; the app then labels answers as a demo. */
  readonly demo: boolean;
  reply(request: LlmRequest): Promise<LlmReply>;
}

export const LLM_PROVIDER = Symbol('LLM_PROVIDER');
