# Third-party notices

## Code, fonts and images

None bundled. The page is plain HTML, CSS and JavaScript written for this folder: no library, no web font, no image, no icon file, and no request to any other site. Text is set in the visitor's own system fonts (PingFang SC, Noto Sans or Serif CJK, Microsoft YaHei and similar, with generic fallbacks), so there is no font licence to carry. There is no `vendor/` folder; if one is ever added, every file in it must be listed here with its licence (`tests/docs.test.cjs` checks that).

## Sources the explanation draws on

The page cites these by name and link and retells them in its own words; nothing is copied.

- Anthropic, "How the agent loop works" (Agent SDK documentation): https://code.claude.com/docs/en/agent-sdk/agent-loop. The definition of a turn and of when the loop stops.
- Nader Dabit, "You Could've Invented Claude Code" (2026-01-09): https://nader.substack.com/p/you-couldve-invented-claude-code. The step-by-step build from a shell suggestion to a small agent loop.
- itshen, engineering methodology of an agent product (MIT licence): https://github.com/itshen/Alice_methodology. The failure list on the "99%" scene and the self-reported facts about that product come from here; the page says so and says they were not checked against that product's source.
- A Xiaohongshu post of 2026-10-14 (570 likes) that compares the agent loops of six engines. The six one-line summaries on the "99%" scene are its summary, marked on the page as an outside self-report that was not checked against each engine's source.

## Mini engine in `src/core.js`

The loop, permission gate, eight rescues and world-state gate are teaching-size implementations written for this page, driven by a scripted fake model. They are not copies of, and not claimed to match, the code of Claude Code or of any other product the page mentions.
