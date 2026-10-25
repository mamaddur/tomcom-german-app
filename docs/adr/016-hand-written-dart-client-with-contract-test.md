# ADR-016: Hand-written Dart API client with a contract test

- Status: Accepted (build step 2d)
- Pack reference: NFR-02 (install size), NFR-20 (documented APIs)

## Context
The plan (ADR-002) listed `packages/api-client-dart`, generated from the OpenAPI spec. Generated Dart clients (openapi-generator) bring a large dependency set and code volume, which works against the 40 MB install target on 2 GB phones. The app uses a small set of endpoints.

## Decision
The learner app has a small hand-written client (`apps/mobile/lib/src/api/`) on `package:http`. `apps/mobile/test/api_contract_test.dart` reads `apps/api/openapi.json` and fails if any endpoint or response field the app relies on is missing or renamed. CI already fails if `openapi.json` is stale, so an API change that breaks the app fails CI.

`test/live_api_test.dart` runs the whole of story 1 against a real dev API when `LIVE_API_URL` is set.

## Consequences
No `packages/api-client-dart`. When the app starts using a new endpoint or field, add it to the contract test. Revisit if the endpoint count grows past what is comfortable by hand (likely by step 7).
