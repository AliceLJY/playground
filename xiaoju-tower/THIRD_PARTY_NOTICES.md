# Third-party notices

- **three.js r160** — MIT License, © 2010–2023 three.js authors. Full text in `vendor/THREE-LICENSE.txt`.
- **City buildings and water** (`data/city.js`) — derived from OpenStreetMap data, © OpenStreetMap contributors, available under the Open Database License 1.0 (https://www.openstreetmap.org/copyright). Extract: openstreetmap.fr `asia/china/guangdong-latest.osm.pbf`, cut with osmium-tool by `tools/build-city.py`. Heights missing in OSM are estimated from footprint size; those estimates are not OSM data.
- **Chapter 2 street grid** (`data/town.js`) — derived from the same OpenStreetMap extract by `tools/build-town.py`: roads, paths, bridges, parks and water rasterised to a 1 m grid. The 18 infill blocks on empty plots and the 57 shared-bike docks are placed by the game, not OSM data (this area has no `amenity=bicycle_rental` in OSM).
- **Character art** (`assets/cat-*.webp`) — AI-generated for this project (web ChatGPT image generation from the author's own model sheet), green screen keyed by `tools/key-sprites.py`.
