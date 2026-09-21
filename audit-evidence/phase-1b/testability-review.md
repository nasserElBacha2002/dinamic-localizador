# Testability review

- Many integration tests with SQL + mocked Twilio — good for contracts.
- Heavy services hard to unit-test without module mocks (`env` direct reads).
- Gaps: multi-replica rate limit, multi-replica materialization, POST /attendance client VALID (security regression), company margin vs bot margin.
- Scanner/unit tests for rate-limit exist; do not prove cluster behavior.
