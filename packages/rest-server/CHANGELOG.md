# @node-i3x/rest-server

## 0.8.5 (2026-06-17)

- feat: enforce Bearer token authentication by default

## 0.8.4 (2026-06-17)

- Version bump

## 0.8.3 (2026-06-17)

- Version bump

## 0.8.2 (2026-06-16)

- Version bump

## 0.8.1 (2026-06-16)

- Version bump

## 0.8.0 (2026-06-16)

- chore: fix Biome lint and formatting issues across workspace
- ci: consolidate GitLab CI pipeline into a single sequential job

## 0.7.2 (2026-06-16)

- ci: retrigger v0.7.1

## 0.7.1 (2026-06-16)

- Version bump

## 0.7.0 (2026-06-16)

- feat: boost coverage to 88%, add Coveralls CI + badges
- fix(rest-server): move PUT /objects/history out of experimental flag to support UPD-05
- feat(auth): fix 401 response compression and support auth in benchmark
- fix: map all unregistered type definitions to UnknownType for EXP-13 compliance
- feat: gate convenience routes behind --experimental CLI and config flag
- refactor: remove acknowledgeSequence, standardize on lastSequenceNumber
- Phase 5: Type safety and refactoring
- Phase 4: Test coverage and metrics
- Phase 3: REST layer hardening
- Phase 2: DRY violations and shared code extraction
- Phase 1: i3X V1.0 spec conformance
- docs: replace ASCII hexagonal diagram with SVG
- chore: remove scratch files from tracking
- docs: add Architecture Decision Records (ADRs) for node-i3x

## 0.6.0 (2026-06-15)

- refactor: align config keys with env vars, switch intervals to ms
- feat(opcua-connector): add SecurityPolicy auto-discovery, dedicated PKI, and self-signed certificates
- chore: remove empty Development section from .env.example

## 0.5.4 (2026-06-13)

- feat: expose OPC UA traffic stats via /health

## 0.5.3 (2026-06-13)

- feat(rest-server): add Bearer token authentication (CORE-06)

## 0.5.2 (2026-06-13)

- Version bump

## 0.5.1 (2026-06-13)

- Version bump

## 0.5.0 (2026-06-13)

- Version bump

## 0.4.0 (2026-06-13)

- feat(app,rest-server): add read-only mode command line option and env var

## 0.3.3 (2026-06-13)

- fix(core): Bad quality value MUST be null per i3X spec

## 0.3.2 (2026-06-13)

- feat: add TypeService to prewarm object types
- fix: resolve UPD-01/UPD-03 conformance failures
- fix: improve error handling in PUT /objects/value
- fix(UPD-01/03): support { updates: [...] } format
- fix(EXP-13): assign typeElementId to all nodes
- test: simplify QRY-03 schema assertion, add typeDefinition to mock
- fix: include property nodes in GET /objects (QRY-03)
- feat: generate JSON Schema for ObjectType responses (QRY-03)
- fix(SUB-14): close existing SSE stream when second opens
- fix(CORE-04): always gzip responses when Accept-Encoding: gzip
- fix(CORE-03): update specVersion from beta to 1.0
- fix(EXP-14): unique type elementIds via full browse-path hierarchy
- fix(QRY-02): composite assets with null value use quality GoodNoData
- fix(QRY-05): treat maxDepth=0 as infinite depth for component reads
- fix(SUB-08): report failure when unregistering unknown elementId
- fix: resolve i3X conformance failures EXP-14, SUB-09, SUB-14
- fix(SUB-11): add responseDetail (RFC 9457) to HTTP error responses
- fix(QRY-04/QRY-09): add responseDetail to failed bulk items in value and history endpoints
- fix: enforce clientId validation and ownership on subscription endpoints
- fix: implement bulk value and history PUT endpoints
- fix: implement GET and POST query endpoints for relationship types
- fix: implement POST /objecttypes/query bulk lookup endpoint
- fix: standardize bulk errors responseDetail and enforce top-level success behavior
- fix: support maxDepth=1 semantics on value queries and map null quality to GoodNoData
- fix: filter objects endpoint to return only assets
- fix: resolve object typeElementId using mapped types list and fallback to UnknownType
- chore: add response compression plugin @fastify/compress

## 0.3.1 (2026-06-10)

- feat: gate debug logs behind DEBUG env var, widen VHS demo, rename repo refs to node-i3x

## 0.3.0 (2026-06-10)

- chore: rename repo  to node-i3x

## 0.2.4 (2026-06-10)

- chore: upgrade all dependencies (TS6, vitest 4, node-opcua 2.173)
- fix: monorepo hygiene - licenses, publishConfig, tsconfig, gitignore

## 0.2.3 (2026-06-10)

- Version bump

## 0.2.2 (2026-06-10)

- fix: release workflow OIDC permissions and GitHub release idempotency

## 0.2.1 (2026-06-10)

- Version bump

