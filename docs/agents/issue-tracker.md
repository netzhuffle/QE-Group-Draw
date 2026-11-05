# Issue tracker: GitHub

Issues and specs live in netzhuffle/QE-Group-Draw on GitHub.
Use the gh CLI from this repository.

## Issues

- Read: `gh issue view <number> --json number,title,body,labels,comments`
- List: `gh issue list --state open`
- Create: `gh issue create --title "..." --body-file <file>`
- Comment: `gh issue comment <number> --body-file <file>`
- Label: `gh issue edit <number> --add-label "..." --remove-label "..."`
- Close: post the explanation as a comment, then `gh issue close <number>`.

Use a temporary file with actual newlines for multiline bodies.
Before creating the first issue in a session, verify the target with
`gh repo view --json nameWithOwner`.

## Relationships

Use native GitHub sub-issues and blocking dependencies when available.
Otherwise, record `Part of #<parent>` and `Blocked by: #<number>` at the
top of the child issue, and link children in the parent's task list.
A ticket is unblocked when every blocker is closed.

## Pull requests as a triage surface

PRs as a request surface: yes.

Apply the same triage labels and states to issues and pull requests.

- Read: `gh pr view <number>`, `gh pr view <number> --comments`,
  and `gh pr diff <number>`.
- List: `gh pr list --state open`.
- Comment: `gh pr comment <number> --body-file <file>`.
- Label: `gh pr edit <number> --add-label "..." --remove-label "..."`.
- Close: post the explanation, then `gh pr close <number>`.

Issues and PRs share a number space. Resolve a bare number with
`gh pr view <number>`, falling back to `gh issue view <number>`.

## Skill conventions

"Publish to the issue tracker" means create a GitHub issue.
"Fetch the relevant ticket" means read the corresponding issue or PR.
