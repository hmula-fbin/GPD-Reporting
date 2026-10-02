---
description: Make a change to the hub the safe way (edit src, build, test, summarise)
---
Make this change to the GPD Portfolio Hub: $ARGUMENTS

Follow CLAUDE.md. Specifically:
1. Find the right module under src/ (or config/). Never edit dist/ or src/vendor/.
2. Make the smallest change that does the job; keep the house rules (no data-source names on screen,
   one KPI colour, assistant reads the full data, no Excel buttons on "Portfolio at a glance").
3. Run `node build/build.mjs --env all` and `npm test`. Fix anything that fails.
4. If the change is a new requirement, add or extend a test in tests/ that proves it.
5. Finish with: what changed (files), test result, and a suggested commit message. Do not commit or deploy.
