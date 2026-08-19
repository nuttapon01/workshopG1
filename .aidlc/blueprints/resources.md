# External Resources

## Design Resources
- **Design tool**: none
- **Design system docs**: none
- **Wireframes/mockups**: none (CS UI design is open — "a single page your API serves is a completely respectable answer")

## API Resources
- **OpenAPI/Swagger spec**: none (API defined by route implementations in `pointhub/src/routes/`)
- **GraphQL schema**: none
- **Existing API docs**: Inline JSDoc in route files

## Knowledge Resources
- **Documentation**: `vision-document.md`, `technical-environment.md`, `stakeholder-notes.md`
- **Internal wiki**: none
- **Reference implementations**: `pointhub/src/` (existing working backend)

## Data Resources
- **Sample data**: `sample-data/transactions.csv` (40 sales + 3 refunds, 81 line items)
- **Expected output**: `sample-data/expected-points.csv` (ground truth for earn API)
- **Verification tool**: `sample-data/check-points.mjs` (diff tool)
- **Members stub**: `sample-data/members.csv` (8 members with tier + join date)

## Available Tools
- [ ] Design tool MCP server
- [x] Web search
- [ ] Other MCP servers

## Notes
- The project is self-contained with Docker Compose for PostgreSQL
- All validation data is local — no external services needed
- The CS UI must work offline (no CDN, no external fonts/icons at runtime)
