# Huacheng Landlord

A rent-collecting board game around a loop of Guangzhou neighbourhoods: Shangxiajiu, Beijing Road, Shamian, Dongshankou, Zhujiang New Town, Canton Tower, Baiyun Mountain, Chimelong… Each turn you choose to roll two dice or one, decide whether to buy the empty lot you land on, pay rent on other people's lots, and add a floor when you come back to your own. After fifteen rounds the richest player wins; anyone who cannot pay rent is out. Built for a phone held upright, playable on a desktop too, about ten minutes a game.

**Live: https://aliceljy.github.io/playground/guangzhou-rich/**

## Opponents

- **Rule bot**: the default for all three seats, no key needed.
- **DeepSeek / Qwen**: switch a seat on the setup screen and paste your own key. The same provider can take several seats, and each seat can change its endpoint (for example your own relay) and model name.
- The model only picks one of the legal options the code offers (one die or two, buy or not, build or not, pay to leave the traffic jam or wait a turn) and adds one line of banter; dice, money, ownership and bankruptcy are all decided in code. If the model replies with nonsense, takes longer than 8 seconds, errors, or is blocked by the browser, the rule bot plays that turn and the game carries on.

## Key safety

- Your key stays in your browser and goes straight to DeepSeek / Qwen; this site has no server and never sees it.
- By default it lives only in page memory and is gone when you close the page. It is saved to localStorage only if you tick "remember on this device"; note that all of `aliceljy.github.io` is one origin, so other pages on this site can read it. Use "forget saved keys" when you are done.
- The page loads no third-party scripts, fonts or images and is locked down with a Content Security Policy; to allow a relay endpoint of your choice, network access is open to any https address (never plain http).
- A relay endpoint must allow direct calls from web pages (CORS). If it does not, the seat shows "this address does not allow direct calls from a web page" and the rule bot takes over.

## Run locally

```bash
cd guangzhou-rich && python3 -m http.server 8811
node --test tests/*.test.cjs
NODE_PATH="$(npm root -g)" node tools/browser-check.cjs http://127.0.0.1:8811/ shots
```

Fixed views: `?view=setup`, `?view=play&seed=7`, `?view=over&seed=7`; `?fast=1` removes animation delays. The spec and acceptance list are in [SPEC.md](SPEC.md) (Chinese), measured results in [VERIFICATION.md](VERIFICATION.md) (Chinese).

## Who might open this, and AI assets

For whoever wants a ten-minute game of collecting rent on a phone, or is curious what their own DeepSeek or Qwen says across a board game.

No image, model or sound assets: the board and pieces are drawn in CSS; the rules and chance-card text are original; the code was written in collaboration with AI.

Credit: WeChat official account 我的AI小木屋 / GitHub @AliceLJY.
