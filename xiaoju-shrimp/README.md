# Xiaoju Steals the Shrimp (grey box)

[中文](README_CN.md)

A small stealth game. You are Xiaoju, a greedy and fearless orange cat. Each level has one "patrol" to slip past; in the last one you jump onto the dinner table and drag the shrimp away. Underneath it is hide-and-seek plus red-light-green-light.

This is a grey-box build: all three levels: slip past Sanhua in the living room, slip past the child in the hallway, and steal the shrimp off the dinner table, with blocks standing in for the cats and furniture, to check whether it is fun before any art; it is published and changed as we play. The spec (in Chinese) is [SPEC.md](SPEC.md).

## How to play (level 1)

Tap a cell and Xiaoju walks there by the shortest way; tap Xiaoju and it stops after the cell it is on. On a computer, arrow keys or WASD step one cell, Space stops, Esc pauses. Sanhua walks a loop round the fish tank and the coffee table; the yellow floor is what she can see, and stepping into it gets you hissed back to your bed. At each corner she first looks back the way she came, then turns. You can hide under the coffee table, where she cannot see you. The cat treat sits on the bottom-right corner of her loop, off every short way to the door.

## How to play (level 2)

The child sits by the hallway wall playing with a toy. She does not look, she listens. Wooden floor goes "tap" under the cat, rugs are silent; the blue floor is the wood she can hear. While the toy plays she hears nothing, and the bar over her head shows how long it has left. If she hears you she says "huh?" and walks over to look; if she gets next to you she picks you up and puts you back at the start. The start card has a level picker; add `?level=2` to the address to go straight to level 2.

## How to play (level 3)

Xiaoju jumps onto the dinner table, picks up the shrimp from the plate in front of the owner, and drags it to the left edge to jump down. Walk while she eats with her head down; when her chopsticks stop she is about to look, so stop; while she looks at the table, anything moving is seen. Seen without the shrimp, you are shooed back to the window sill; seen with it, she shouts "stop!" and you have one second to reach the edge, which still counts as a win.

## Run and test

Serve the repository root, for example `python3 -m http.server 8811`, and open `http://127.0.0.1:8811/xiaoju-shrimp/`. Fixed views: `?view=start`, `?view=hiss`, `?view=table`, `?view=clear`. Tests: `node --test tests/*.test.cjs` in this folder.

## Who opens this, AI material

- Who opens this: people whose cat has stolen food off their plate; anyone after a two-minute phone game about reading a pattern and finding the gap.
- AI material: no AI-generated images, models, motion or sound; the grey box is blocks drawn in code. The code was written through human–AI collaboration.
