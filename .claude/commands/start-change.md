---
description: Start a new change (creates your own branch so you don't disturb anyone)
---
Start a new change called: $ARGUMENTS

1. Run the /get-latest steps first (stop if there are uncommitted changes).
2. Make a branch name `change/<short-kebab-name>` from the description (e.g. change/greeting-wording) and run `git switch -c <name>` from an up-to-date main.
3. Tell the user, in one or two sentences: the branch name, that their edits now stay separate from everyone else's until they share them, and that the next step is to describe the change to you (or use /change).
