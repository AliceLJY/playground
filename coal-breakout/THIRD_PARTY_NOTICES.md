# References and verification material

No third-party code, image, font or audio is shipped in `index.html` or `src/`.

The independently generated QR matrix in `tests/fixtures/qr-v4-l-mask0.json` comes from Project Nayuki's QR Code generator, using explicit byte mode, version 4, ECC L, mask 0, and disabled ECC boosting. Its source URL and the exact reference script's SHA-256 are recorded in the fixture. The reference script itself is retained only in ignored local verification output; it is neither a runtime dependency nor a CI dependency.

Reference: https://www.nayuki.io/page/qr-code-generator-library

Copyright (c) Project Nayuki. (MIT License)

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
