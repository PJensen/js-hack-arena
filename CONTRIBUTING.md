# Contributing

## Commit messages

Use Conventional Commits for every commit. Start the subject with a lowercase type and an optional scope, then a colon, a space, and a short imperative summary. Use `type: summary` or `type(scope): summary`.

| Type | Use for |
| --- | --- |
| `feat` | A new feature or player-facing capability |
| `fix` | A bug fix or regression fix |
| `docs` | Documentation or contributor guidance |
| `refactor` | Code restructuring that preserves behavior |
| `perf` | A performance improvement |
| `test` | Test additions or changes |
| `build` | Build tooling or dependency changes |
| `ci` | Continuous integration changes |
| `style` | Code formatting only |
| `chore` | Routine maintenance that has no more specific type |

Examples

```text
feat(input): add comma shortcut for gear pickup
fix(ui): keep ground tooltip taps from moving the joystick
docs: define commit and push workflow
chore: remove unused local tooling files
```

Add a body after a blank line when the reason for the change or its trade-offs need context. Mark a breaking change with `!` before the colon or a `BREAKING CHANGE:` footer.
