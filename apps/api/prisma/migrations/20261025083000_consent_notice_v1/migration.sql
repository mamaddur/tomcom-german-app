-- Consent notice v1 (FR-104, NFR-13).
-- DRAFT: needs review by TOMCOM legal/DPO and the Telugu language reviewer before launch.
-- The grievance officer is a TOMCOM decision (docs/open-questions.md, D).
-- A changed notice is a NEW version in a new migration; published versions are never edited.
INSERT INTO "consent_notices" ("version", "body", "required_purposes", "optional_purposes", "published_at")
VALUES (
  1,
  jsonb_build_object(
    'en', jsonb_build_object(
      'title', 'How we use your information',
      'text', 'TOMCOM (Telangana Overseas Manpower Company Ltd) uses your mobile number, name, district, trade and learning progress to teach you German, follow your progress and prepare you for jobs abroad. Your data is stored in India and is never sold. Your trainer and TOMCOM can see your progress. At any time you can download your data, correct it or ask us to delete it from the app. Grievance officer: to be named by TOMCOM.',
      'purposes', jsonb_build_object(
        'learning', 'Teach me German and save my progress',
        'progress_sharing', 'Share my progress with my trainer and TOMCOM',
        'analytics', 'Use anonymous app usage data to improve the app (optional)'
      )
    ),
    'te', jsonb_build_object(
      'title', 'మీ సమాచారాన్ని మేము ఎలా ఉపయోగిస్తాము',
      'text', 'TOMCOM (తెలంగాణ ఓవర్సీస్ మ్యాన్‌పవర్ కంపెనీ లిమిటెడ్) మీకు జర్మన్ నేర్పడానికి, మీ పురోగతిని గమనించడానికి మరియు విదేశాల్లో ఉద్యోగాలకు మిమ్మల్ని సిద్ధం చేయడానికి మీ మొబైల్ నంబర్, పేరు, జిల్లా, వృత్తి మరియు అభ్యాస పురోగతిని ఉపయోగిస్తుంది. మీ డేటా భారతదేశంలోనే నిల్వ చేయబడుతుంది, దానిని ఎప్పుడూ అమ్మము. మీ శిక్షకుడు మరియు TOMCOM మీ పురోగతిని చూడగలరు. మీరు ఎప్పుడైనా యాప్‌లో మీ డేటాను డౌన్‌లోడ్ చేసుకోవచ్చు, సరిచేయవచ్చు లేదా తొలగించమని కోరవచ్చు. ఫిర్యాదుల అధికారి: TOMCOM నియమిస్తుంది.',
      'purposes', jsonb_build_object(
        'learning', 'నాకు జర్మన్ నేర్పండి మరియు నా పురోగతిని సేవ్ చేయండి',
        'progress_sharing', 'నా పురోగతిని నా శిక్షకుడు మరియు TOMCOM తో పంచుకోండి',
        'analytics', 'యాప్‌ను మెరుగుపరచడానికి అనామక వినియోగ డేటాను ఉపయోగించండి (ఐచ్ఛికం)'
      )
    )
  ),
  ARRAY['learning', 'progress_sharing'],
  ARRAY['analytics'],
  '2026-10-25T00:00:00Z'
);
