---
description: Save your change and send it to the team's shared copy
---
Save the current work and share it. The user is new to git - explain briefly what each step does.

1. `git status`. If on `main`, STOP: create a change branch first (as in /start-change) and move the work there.
2. Run `npm test`. If it fails, fix it (or ask the user) before sharing.
3. Show a short plain-English summary of the changes (`git diff --stat` plus what they do). Propose a commit message: short first line, then 1-3 lines of detail. Ask the user to confirm or edit it.
4. `git add -A` and `git commit` with that message.
5. Remind the user: check the OneDrive icon in the taskbar shows "up to date" before sharing. Then `git fetch origin`, `git merge origin/main` if main has moved (resolve conflicts with the user), and `git push -u origin <branch>`.
6. Tell them it is shared, and the next step: /deploy-dev to put it on the Dev site for the requester to test.
