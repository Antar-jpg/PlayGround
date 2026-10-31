# PlayGround

<!-- omgithub:readme:start -->
## 🚀 Build, play, and remix with OMGithub

**Created using [OMGithub.com](https://omgithub.com).**

[![OMGithub](https://img.shields.io/badge/OMGithub-Open%20project-orange?style=for-the-badge)](https://omgithub.com/Antar-jpg/PlayGround)
[![GitHub](https://img.shields.io/badge/GitHub-Source-181717?logo=github&style=for-the-badge)](https://github.com/Antar-jpg/PlayGround)

- 🎮 [Open the project](https://omgithub.com/Antar-jpg/PlayGround).
- ✨ [Remix this project](https://omgithub.com/?remix=Antar-jpg%2FPlayGround).
- 💻 [Explore the source](https://github.com/Antar-jpg/PlayGround).
- 🛠️ [Check build runs](https://github.com/Antar-jpg/PlayGround/actions).
- 🐛 [Report an issue](https://github.com/Antar-jpg/PlayGround/issues).
- 👤 [Explore the creator's projects](https://omgithub.com/Antar-jpg).
- 🌍 [Create with OMGithub](https://omgithub.com).
<!-- omgithub:readme:end -->

## VOLT RALLY — Superpowered Racket Duel

A neon 3D racket duel against the arena champion, **VEXA**. Rally a plasma ball, bank perfect returns to charge your core, and unleash dash, time-warp and super-smash powers. First to **7 points** wins.

Built as a static, dependency-free browser game: Three.js and the display fonts are vendored, audio is synthesised with the Web Audio API, and there is no build step.

### Play

```bash
python3 -m http.server 3002
# then open http://localhost:3002
```

On an OMGithub workspace you can also run `./start.sh`, which uses the platform's static server.

### Controls

| Action | Desktop | Touch |
| --- | --- | --- |
| Move | `WASD` / arrow keys / mouse | Left virtual stick |
| Swing | Left click / `Space` | `SWING` button |
| Dash | `Q` | `DASH` |
| Time Warp | `E` (35% core) | `WARP` |
| Super Smash | `R` at 100% core | `SMASH` |
| Pause | `Esc` / `P` | Pause button |
| Mute | `M` / speaker button | Speaker button |

Move **across** the court as you swing to aim your return. Crossing the ball's path sends it to the opposite corner and pulls VEXA out of position. A perfectly timed swing in the centre of the racket charges the core faster — and a charged smash is unreturnable.

### Tech

- Three.js r184, vendored under `vendor/three/`
- Orbitron and Rajdhani, vendored under `vendor/fonts/`
- Custom shaders, post-processing (bloom + vignette), procedural textures and audio
- Responsive desktop, tablet, portrait and landscape touch layouts with safe-area support
- Debug surface at `window.__VOLT_RALLY__` for verification

### Credits

Three.js is © Three.js Authors, MIT licensed. Orbitron and Rajdhani are distributed under the SIL Open Font License 1.1.

