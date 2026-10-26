import type { LlmProvider, LlmReply, LlmRequest } from './llm.provider.js';

/**
 * Stand-in for local development and demos while no vendor is chosen. It is not a language
 * model: it recognises a few greetings and otherwise suggests a first phrase. Never used in
 * production (see env.ts).
 */
export class DevLlmProvider implements LlmProvider {
  readonly demo = true;

  async reply(request: LlmRequest): Promise<LlmReply> {
    const last = request.messages.at(-1)?.content.toLowerCase() ?? '';
    const te = request.replyLanguage === 'te';
    let text: string;
    if (/\b(hallo|hello|namaste)\b/.test(last) || last.includes('నమస్కారం')) {
      text = te
        ? 'నమస్కారం! జర్మన్‌లో ఇలా అంటారు: <de>Hallo! Wie geht es Ihnen?</de> అంటే "హలో! మీరు ఎలా ఉన్నారు?"'
        : 'Hello! In German you say: <de>Hallo! Wie geht es Ihnen?</de> It means "Hello! How are you?"';
    } else if (/\b(danke|thanks?|thank you)\b/.test(last) || last.includes('ధన్యవాదాలు')) {
      text = te
        ? 'అద్భుతం! "ధన్యవాదాలు" అంటే <de>Danke</de>. దానికి సమాధానం: <de>Bitte</de>.'
        : 'Great! "Thank you" is <de>Danke</de>. The answer is <de>Bitte</de> (you are welcome).';
    } else {
      text = te
        ? 'బాగుంది! ముందుగా ఉదయం పలకరింపు నేర్చుకుందాం: <de>Guten Morgen!</de> అంటే "శుభోదయం". మీరూ చెప్పి చూడండి.'
        : 'Good! Let us start with a morning greeting: <de>Guten Morgen!</de> It means "good morning". Try saying it yourself.';
    }
    const inputTokens = Math.ceil(
      (request.system.length + request.messages.reduce((n, m) => n + m.content.length, 0)) / 4,
    );
    return { text, inputTokens, outputTokens: Math.ceil(text.length / 4) };
  }
}
