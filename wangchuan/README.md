# Wangchuan, Lying Down · Deer Park

[中文](README_CN.md) · [Open](https://aliceljy.github.io/playground/wangchuan/)

Wang Wei's four-line poem "Deer Park" (Lu Zhai, 8th century) as a handscroll you can drift through. It opens on a deep wood painted in the blue-and-green manner of the High Tang, with late sunlight resting on a patch of moss. Stay, and the painting breathes a little: the light wavers and creeps, mist moves far off, someone calls across the hills, and the scroll unrolls leftward by itself. At the end, on plain paper, the poem appears column by column.

Two seconds is enough to get something. You never have to finish it.

## Spec

- One line: look at a landscape the way old viewers "travelled lying down" (woyou): the painting first, the poem later. Main aesthetics are sensation and immersion. It is an arc you pass through once, not a loop you replay.
- Setting: a stranger opens it on a phone, portrait, probably muted, and stays anywhere from two seconds to a bit over a minute. So the first frame has to stand by itself, and sound is a bonus.
- Same period throughout: Wang Wei lived in the High Tang, so the painting follows High Tang blue-and-green landscape and the writing follows High Tang small regular script. The poem is not written on the painting; it sits on the paper at the tail of the scroll.
- No explanatory text. The only words on screen are one credit line at the tail, a sound hint, and a sound toggle.
- Colours: the painting is what it is; mount strip around sRGB `#3C3428`, tail paper around sRGB `#E2CB9F`, ink `#261E16`.
- Budget: 60 fps on a phone browser; one full-screen shader, one draw call, two textures (painting 3966×1586, depth 992×397); device pixel ratio capped at 2.

## What each stretch of time gives you

| Stay | What you get |
|---|---|
| 2 s | A complete picture: deep wood, returning light on moss |
| ~10 s | The picture breathes, the light flickers, mist drifts far off; if you have touched the screen, wind and a distant call and answer |
| after 7 s | The scroll unrolls leftward by itself; drag and it follows you, and resumes 5 s after you let go |
| about a minute | The mount strip, then plain paper; the poem appears right to left |
| after 90 s | The light moves off and the wood dims slightly |

## How it was made

- Painting: AI-generated (Codex), with two early blue-and-green landscapes as references (*Emperor Minghuang's Journey to Shu*, attributed to a Tang hand, and *Spring Excursion*, attributed to Zhan Ziqian, both from Wikimedia Commons), for colour texture and brushwork only, not composition. It is a new image, not an old painting.
- Writing: AI-generated, with the High Tang small-regular-script manuscript *Lingfei jing* (attributed to Zhong Shaojing, Metropolitan Museum, via Wikimedia Commons) as reference. All 24 characters were checked one by one, then the ink was lifted onto a transparent image.
- Motion: the painting is not cut into layers or repainted. Depth-Anything-V2 estimates a depth map, and a shader moves near things slightly more than far things. Mist and the wavering, travelling light are added in the same shader.
- Sound: wind is synthesised live with Web Audio; the distant voices are system speech synthesis with reverb and filtering.
- No build step, no runtime dependencies.

## Checks

`node --test tests/*.test.cjs` runs seven: the light is visible in the first frame at six screen ratios, the opening shows nothing outside the painting, the poem is centred and fully on screen at the end, the narrowest phone fits the whole poem, the poem never overlaps the painting, the poem image matches the layout numbers, and the page carries no extra text. The first one was tried against a broken version (opening at the far right of the painting) and fails as it should.

It was also run live at 390×844: a screenshot at 2 s, waiting for the scroll to move by itself, dragging to the tail and waiting for the poem, with no console errors at 60 fps.

These show it behaves as specified. Whether it is beautiful, and whether it calls the poem to mind, is for people to judge.

## Licence

Code is MIT with the rest of this repository. The three reference works are in the public domain; none of their images are included in the page.
