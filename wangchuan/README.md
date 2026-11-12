# Wangchuan, Lying Down · Deer Park

[中文](README_CN.md) · [Open](https://aliceljy.github.io/playground/wangchuan/)

Wang Wei's four-line poem "Deer Park" (Lu Zhai, 8th century): four lines, four paintings, one after another, deeper into the hills. Empty mountains from afar. The edge of the wood, where voices carry but nobody is seen. The deep wood, with late sun slanting in from the right. Then the ground at your feet: returning light on moss, tree shadows creeping. At the end, on plain paper, the poem appears column by column.

Two seconds is enough to get something. You never have to finish it.

## Spec

- One line: look at a landscape the way old viewers "travelled lying down" (woyou): the painting first, the poem later. Main aesthetics are sensation and immersion. It is an arc you pass through once, not a loop you replay.
- Setting: a stranger opens it on a phone, portrait, probably muted, and stays anywhere from two seconds to a bit over a minute. So the first frame has to stand by itself, and sound is a bonus.
- Same period throughout: Wang Wei lived in the High Tang, so the paintings follow the Tang way of fine outline and flat colour, and the writing follows the regular script of Ouyang Xun (early Tang). Graded washes did not exist yet in the Tang, so the paintings have none; the first version used a washed blue-and-green and was repainted after someone who knows painting pointed this out. The poem is not written on the painting; it sits on the paper at the tail of the scroll.
- No explanatory text over the painting. The only words on screen are one credit line at the tail, one hint, a sound toggle and the sources button; the scholarly background sits on a page you open yourself.
- Colours: the painting is what it is; mount strip around sRGB `#3C3428`, tail paper around sRGB `#E2CB9F`, ink `#261E16`.
- Budget: 60 fps on a phone browser; one full-screen shader, one draw call, two textures bound at a time (the current scene's painting at 3172×1268 and its depth at 992×397), scenes loading in the background; device pixel ratio capped at 2.

## Step by step, scene by scene

| Scene | Line | The painting | What happens |
|---|---|---|---|
| 1 | Empty mountains, no one in sight | Layered peaks in fine outline seen from afar, clouds across the slopes, dense woods, no sign of people | It opens here, nothing in the way |
| 2 | Only the sound of someone talking | The foot of the hill; a path follows a stream and bends into the wood, with nobody on it | The distant call and answer is nearest here |
| 3 | Returning light enters the deep wood | The deep wood at sundown | Light comes in from the right and settles on the moss |
| 4 | And shines again on the green moss | Looking down: old roots, stones, thick moss | The light rests on the moss; leaf shadows and long trunk shadows creep; then the light leaves and the wood dims |
| Tail | — | Plain paper | The poem appears right to left |

Within each scene the view unrolls leftward and pushes a little way into the painting, then changes to the next scene inside drifting mist. It is evening, the sun is low on the right, and lower with every scene. Left alone it unrolls slowly by itself, about a minute in all. Press and hold to walk forward, three times faster, with footsteps and a slight bob; swipe left or right to look back and forth; it resumes three seconds after you let go. Leaves and moss stir in gusts of wind.

The "溯源" (sources) button at the bottom left opens at any time: the poem, the two strands of Wang Wei's painting, the basis for the Tang manner, which works were followed, what is modern addition, and how it was made. You do not have to reach the end to read it.

## How it was made

- Paintings: all four are AI-generated (Codex) in the Tang manner: line first, colour second; rocks are outlines only, with no texture strokes, no graded washes and no light and shade inside the lines; colour is sparse, pale and flat, and most of the surface is bare silk; moss and foliage are small scalloped clusters outlined in fine line and then filled with pale green. The main reference is the mountain passage of the Tang copy of *Admonitions of the Court Instructress*, for manner only, not composition. No light or shadow is painted. They are new images, not old paintings.
- Writing: AI-generated, with a Song rubbing of Ouyang Xun's *Jiucheng Palace Sweet Spring Inscription* (National Palace Museum, Taipei, via Wikimedia Commons) as reference, written as ink on paper. All 24 characters were checked one by one, then the ink was lifted onto a transparent image.
- Motion: the paintings are not cut into layers or repainted. Depth-Anything-V2 estimates a depth map for each, and a shader moves near things slightly more than far things, and grows them slightly faster as the view pushes in. The paintings are flat; the warm returning light, the tree shadows on the moss, the far mist and the mist between scenes are all laid on by that one shader. Trunk shadows are cast from where each painting's trees stand, and stretch as the sun sinks.
- Sound: wind and footsteps are synthesised live with Web Audio; the distant voices are system speech synthesis with reverb and filtering, brought nearer or farther scene by scene. On Apple devices sound is released on finger-up, and a silent loop keeps it audible with the mute switch on.
- No build step, no runtime dependencies.

## Checks

`node --test tests/*.test.cjs` runs twelve, each across six screen ratios: the scenes follow the poem's four lines; the opening is neither in mist nor outside the painting; the view never leaves the painting anywhere in any scene; every scene unrolls leftward and pushes in; in scene 3 the spot where the light lands is on screen when it lands; in scene 4 the light stays on screen while it lasts and there is a trunk to its right to cast a shadow; the voices are nearest in scene 2; each scene is warmer than the last; scene changes are fully inside mist and clear in the middle; the narrowest phone fits the whole poem; all assets exist; the page carries no extra text.

Twelve points along the walk were also screenshotted and looked at, at 390×844 and 1440×810, with no console errors.

These show it behaves as specified. Whether it is beautiful, whether the four paintings read as one mountain, and whether it calls the poem to mind, is for people to judge.

## Licence

Code is MIT with the rest of this repository. The reference works are in the public domain; none of their images are included in the page.
