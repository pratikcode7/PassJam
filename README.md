# PassJam: The Jamali Job

> Four legendary safes. One crew. No real passwords.

A heist-themed browser game for the **Puzzle Passwords** challenge, built by team **Jamil Jamali**. The password is the puzzle: every rule is a tumbler in a vault door, and you have to set them all before Interpol arrives.

⚠️ **Don't use a real password.** It's a game, so make one up.

## The story

Jamil is the safecracker and Jamali is the mastermind on the earpiece. A master locksmith built four impossible safes:

| Safe | City | Theme |
|---|---|---|
| I. The Gold | Paris | Warm-up |
| II. The Storm | Prague | Music and riddles |
| III. The Dragon | St. Moritz | Lasers, ciphers, a badge scanner |
| IV. The Twilight | Unknown | The final door |

## How to play

1. Type one password. Each safe has 3 rules, and every rule shows live whether it passes or fails.
2. When every rule of a safe passes, the safe cracks and the next 3 rules unlock.
3. The rules fight each other. Adding a riddle answer changes your length, digits and letters.
4. **The twist:** once all 12 tumblers are set, the safe fights back. It jams one character with `#`, and a 13th rule appears.
5. Fix the jam and the vault door swings open. If the 7-minute Interpol timer runs out, you're busted.

## Features

- 12 riddle, cipher and logic rules, plus a sabotage rule
- Live pass/fail feedback on the rule cards and on 13 tumbler pins on the vault door
- A combination dial that turns as you type, with a stethoscope rule and a musical-notes rule
- Interpol countdown with a heartbeat in the last minute and sirens when time runs out
- Vault-opening animation, falling coins and end-of-heist stats
- Sound made in the browser with the Web Audio API (no audio files)

## Run

There's no build step. Open `index.html` in Chrome, or serve the folder:

```
python -m http.server 5173
```

Then visit `http://localhost:5173`.

## Tech

One self-contained `index.html` file using plain HTML, CSS and JavaScript, an SVG vault door and the Web Audio API.

## Team

**Jamil Jamali** · Puzzle Passwords challenge, 2026
