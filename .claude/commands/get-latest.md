---
description: Get the team's latest version (start of every working session)
---
Bring this working copy up to date with the team's shared copy. Explain each step in plain words, the user is new to git.

0. If `git remote` shows no `origin`, the user is working alone (no shared copy yet). Say so, skip the fetch/pull steps, and just run step 6.
1. Run `git status`. If there are uncommitted changes, STOP and ask whether to save them first (/share-change) or set them aside (`git stash`). Never discard them.
2. Remember the current branch. `git fetch origin --prune --tags`.
3. `git switch main` then `git pull origin main`.
4. If the user was on a change branch, switch back to it and run `git merge main` so it has the latest work. If there is a merge conflict, explain it simply, resolve it keeping both people's intent, and show the result before committing.
5. If package.json changed, run `npm install`.
6. Run `npm test` and report: which version / latest change is now here (`git log --oneline -5`), and whether the tests pass.
