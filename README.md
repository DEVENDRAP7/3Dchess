# Chessforge — 3D Character Chess

### ▶ [**Play it here — devendrap7.github.io/3Dchess**](https://devendrap7.github.io/3Dchess/)

Open it on your phone. Nothing to install.

---

A 3D chess game for phones, built to run straight from GitHub Pages. Every
piece is a character: a full armoured figure with its own costume, helm or
crown, personality, idle behaviour, and a signature way of moving and killing.

Play the computer, pass a phone back and forth, or send a friend a five-letter
room code and play them over the internet.

**No build step, no server, no dependencies to install.** It's static files.

---

## Playing it

| | |
|---|---|
| **Select a piece** | Tap it. Legal moves appear as markers — green dots for quiet moves, red rings for captures, violet for castling. |
| **Move** | Tap the marked square. |
| **Read a character** | Tap an opposing piece, or tap your selected piece a second time, to open its codex card. |
| **Look around** | Drag one finger to orbit, pinch to zoom. |
| **Rotate the view** | The ⟳ button swings the camera to the other side. |

Undo, a hint, the move list (with PGN/FEN export), sound, board themes,
graphics quality and animation speed all live in the HUD and the settings
panel. Five board themes ship: **Classic** and **Marble** are daylit with a
black-and-white board, **Solstice**, **Obsidian** and **Verdant** play at
night. The interface follows the board — a bright theme switches the whole UI
to a light palette, and the effects system swaps from additive to normal
blending so sparks stay visible against pale colours. Games against the computer and pass-and-play games save themselves, so
closing the tab doesn't lose your position.

### Playing a friend online

One player taps **Create a room** and gets a code like `K7QMP`. The other taps
**Join** and types it, or just opens the invite link — which is simply the site
URL with the code on the end:

```
https://devendrap7.github.io/3Dchess/?room=K7QMP
```

After that the two browsers talk to each other directly over WebRTC — moves
never pass through a server, because there isn't one.

Both sides run the full rules engine and validate everything they receive, so a
modified client can't force an illegal move onto your board.

A public broker (PeerJS) is used only to introduce the two peers, plus STUN and
a best-effort TURN relay for phones behind strict NAT. If your network blocks
peer-to-peer traffic entirely, the room will fail to connect and say so; local
and computer games are unaffected.

---

## Hosting it

This repo is already published at
**<https://devendrap7.github.io/3Dchess/>** — `.github/workflows/pages.yml`
redeploys it on every push to `main`.

To host your own copy, the repository *is* the site; nothing needs compiling.
**One manual step is required, and only once:** in **Settings → Pages**, set
**Source** to **GitHub Actions**. The workflow token is not permitted to turn
Pages on by itself, so the first run fails until you do. After that it
publishes on every push, at `https://<user>.github.io/<repo>/`.

To run it locally, serve the folder over HTTP — ES modules and the AI worker
won't load from `file://`:

```bash
python3 -m http.server 8000
# then open http://localhost:8000
```

---

## The cast

Two armies, six characters each, described in full in the in-game Codex.

**The Dawn Legion** of Solaria — ivory plate, gold trim, dawn-blue cloth.
A nervous Sunspear Conscript who taps his shield before every advance; Ser
Aurelian the Gale Rider, who believes any problem can be leapt over; Lumen,
Keeper of First Light, whose feet have not touched the board in eleven years;
Bastion Ironhold, who has said four words this century, all of them "no";
Queen Solivere the Radiant; and old King Aldric, who remembers the name of
every pawn he has lost.

**The Umbral Court** of Nocturne — blackened steel, violet witchlight, crimson
silk. A fatalistic Duskblade Conscript; Ser Ravenmane, who arrives before you
hear the hooves; Vesper, who speaks only in things that have not happened yet;
the Grimhold Warden; Queen Morrigane the Eclipse, who enjoys the work; and
King Malakar, secretly terrified of the endgame.

Each has its own travel style. Pawns hop and kick up dust. Knights rear and
vault the full arc, landing in a shockwave. Bishops never touch the ground and
glide on a trail of light. Rooks grind forward in a straight line. Royalty
floats. Kills land on the beat: a flash, a shockwave, a vertical slash through
the victim, and a body that comes apart into its own colours and rises off the
board.

---

## How it's built

```
index.html            markup and every panel
styles.css            phone-first UI, safe-area aware
manifest.webmanifest  installable to a home screen

src/
  main.js             game orchestration — state, input, turns, save/resume
  chess/
    engine.js         the rules: movement, castling, en passant, promotion,
                      check/checkmate/stalemate, fifty-move, threefold,
                      insufficient material, SAN and FEN
    ai.js             negamax + alpha-beta, iterative deepening, quiescence,
                      MVV-LVA ordering, killer moves, piece-square tables
    ai.worker.js      runs the search off the main thread
  render/
    rig.js            modelling toolkit; merges each character to ~4 draw calls
    anatomy.js        the human figure: limbs, plate, helms, capes, crowns
    pieces.js         the twelve characters and their idle behaviour
    board.js          squares, frame, lettering, move markers
    animations.js     move choreography, kills, promotions
    effects.js        pooled particles, shockwaves, flashes, camera shake
    scene.js          renderer, lighting, adaptive quality, touch camera
    palette.js        army colours and board themes
  audio/sfx.js        every sound synthesised at runtime — no audio files
  net/online.js       WebRTC peer-to-peer play
  game/lore.js        who these people are
  ui/hud.js           panels, move list, codex, trays

vendor/               three.js and peerjs, vendored so the site has no CDN
```

### Notes on the approach

**Correctness first.** The rules engine is validated with `perft` against the
five standard test positions to depth 4–5 (4.8M nodes from the start position,
4.1M from Kiwipete), which is what catches the classic bugs: castling through
check, en-passant discovered checks, promotion under pin.

**Draw calls, not polygons, are the mobile budget.** Each character is authored
as forty-odd primitives, then merged by animation group and surface finish into
about four meshes with the colours baked into vertex attributes. Thirty-two
characters plus the board come to roughly 300 draw calls.

**Quality adapts.** The renderer picks a tier from the device, then measures
frame time and steps resolution and shadows down if it can't hold pace. You can
also pin it in settings.

**Nothing to download at runtime.** Three.js and PeerJS are vendored; sound is
synthesised with the Web Audio API; the board lettering is drawn to a canvas at
startup. The multiplayer library is fetched only when you open a room.

---

## Licence

The game code is yours to do as you like with. Vendored libraries keep their own
licences: `vendor/THREE_LICENSE` (three.js, MIT) and `vendor/PEERJS_LICENSE`
(PeerJS, MIT).
