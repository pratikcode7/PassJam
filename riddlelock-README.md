# Riddlelock

> Your password must contain a riddle. Twelve of them, actually.

A browser game where **every password rule is a riddle**. Solve the riddle to learn the rule, then satisfy it, while Tumbler, the grumpy vault keeper, comments on your progress.

⚠️ **Don't use a real password.** It's a game; type nonsense.

## How to play

1. **Phase 1: Build it.** Rules show up one at a time as sticky notes. Each one is cryptic ("I have keys but open no locks"), and the notes turn green or red live as you type. The rules affect each other: the answers add letters, and rule 11 needs your digits to add up to your letter count, while rule 12 bans repeated digits. Stuck? "Decode hint" gives you the plain rule for −75 points.
2. **Phase 2: The Forgetting.** This is the twist. Once all 12 pass, the vault hides your password. You get **one 20-character sticky note** to help yourself, then you retype it blind. Numbered chips still show which rules pass, but the riddles are hidden. You get 3 tries, and pasting is blocked.
3. **Locked out?** Answer your "security question" (any answer works, just like real life) for a 4-second peek.
4. **Win:** open the vault and get a score, a rank (Vault Whisperer → Post-it Person), time, hints used and a joke entropy estimate.

## Run

No build step. Open `index.html`, or serve the folder:

```
python -m http.server 5173
```

## Files

- `rules.js`: the 12 riddle rules (pure functions, can be tested in Node)
- `game.js`: game flow, live feedback, phases, scoring and confetti
- `styles.css` / `index.html`: sticky-note-on-graph-paper UI
