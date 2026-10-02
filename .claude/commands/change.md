---
description: Make a change to the hub the safe way (edit src, build, test, preview)
---
Make this change to the GPD Portfolio Hub: $ARGUMENTS

Follow CLAUDE.md. Specifically:
1. If the current branch is `main`, first create a change branch (as in /start-change). Never commit change work directly on main.
2. Find the right module under src/ (or config/). Never edit dist/ or src/vendor/.
3. Make the smallest change that does the job and keep the house rules in CLAUDE.md.
4. Run `node build/build.mjs --env all` and `npm test`. Fix anything that fails.
5. If it is a new requirement, add or extend a test in tests/ that proves it.
6. Tell the user how to look at it: `npm run preview` then open http://localhost:5173 (or the VS Code task "Preview (dev, fixture data)").
7. Finish with: what changed (plain words, then files), test result, and "When you're happy, run /share-change, then /deploy-dev to put it on Dev for testing." Do not commit or deploy yourself.
