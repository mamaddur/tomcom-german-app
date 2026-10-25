/** UI and content locales at launch (BR-02). Adding a language: add it here + its translations (NFR-16). */
export const SUPPORTED_LOCALES = ['te', 'en'] as const;
export type Locale = (typeof SUPPORTED_LOCALES)[number];
