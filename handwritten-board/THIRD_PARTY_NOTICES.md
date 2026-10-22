# Third-party notices

This folder ships two third-party files, both under `vendor/`. Nothing else in the published page comes from outside.

## GSAP 3.13.0, `vendor/gsap.min.js`

- Copyright 2025 GreenSock, a Webflow product. The file is the unmodified `gsap.min.js` of GSAP 3.13.0 as distributed on npm; its copyright and licence header is kept exactly as shipped (the first lines of the file).
- Licence: the Standard "No Charge" GSAP License (effective April 30, 2025), which is **not** MIT. In short it lets anyone use GSAP on a website, web app or digital interface, and forbids using it inside a no-code visual animation builder that competes with Webflow, reverse engineering it to make such a product, or removing its notices. This page is a hand-coded animation, not an animation builder.
- The licence text is copied to `vendor/GSAP-LICENSE.txt`. The official page, https://gsap.com/standard-license, was showing a maintenance notice on 2026-10-23, so the copy comes from the ScanCode LicenseDB mirror and is dated in its header. Where the two differ, the official page governs.
- Origin of this copy: the same bytes the author's earlier single-file version had inlined, identical (SHA-256 `96c01b81f44a3290e2b4532f55e2c9534b2adc43273a19f3756b2cb41f0fd0b6`) to `gsap@3.13.0/dist/gsap.min.js` on jsDelivr. GSAP's package declares its licence as "Standard 'no charge' license: https://gsap.com/standard-license".

## Long Cang, `vendor/LongCang-Regular.subset.woff2`

- Copyright 2018 The Long Cang Project Authors (https://github.com/googlefonts/longcang). Licence: SIL Open Font License 1.1, full text in `vendor/OFL-LongCang.txt`. No Reserved Font Name is declared.
- Modification, as the OFL allows: the font was cut down to the characters this page draws (the board's words, ASCII, common Chinese punctuation, no-break space; the list is in `vendor/LongCang-subset-chars.txt`) with `pyftsubset` from fonttools (MIT) and written as WOFF2. Glyph outlines are untouched; hinting was dropped. The font's own copyright and licence records are kept in the file. Regenerate with `node tools/subset-font.cjs <LongCang-Regular.ttf>`.
- The full font comes from https://github.com/google/fonts/tree/main/ofl/longcang and is not kept here.
- The other choices in the page's font menu (Hannotate SC, Xingkai SC, HanziPen SC, STKaiti) are fonts that ship with Apple systems. They are named in CSS, never bundled or downloaded; the font menu greys out any of them the visitor's device does not have.

## Idea, no code taken

The board's mechanism (handwritten font, per-character reveal, a hand following the pen, hand-drawn circling, page and scroll modes) follows the "InkFlow" handwriting-board player shown in a public post by Berryxia.AI. That player is closed source; only a screenshot of its toolbar was looked at, and no code or assets from it are used. The code here is the author's own, written with AI assistance.
