# Plot Square

Before making something from a real neighbourhood (an isometric town, a miniature, a walkable street), place a square frame on the map that does not cut a well-known building in half.

中文：[README_CN.md](README_CN.md)

## What it does

1. Cuts the area around your point out of the local Guangdong OSM extract (`/Volumes/ColdData/data/osm/guangdong-latest.osm.pbf`); no online service is used.
2. Turns the square to follow the main streets nearby, so they run straight across it; north-up when there is no clear grid.
3. Slides it within a limit (40% of the side by default) and picks a placement in this order: everything you named fully inside, then the fewest landmarks cut, then close to your point, landmarks clear of the edge by 4% of the side, aligned with the streets, few ordinary buildings cut.
4. Writes `plot.json` (centre, rotation, corner coordinates, landmarks inside and cut), `plot-preview.svg` and `osm-area.geojsonseq` (the area's features, ready for modelling).

A landmark is recognised from OSM tags: wikidata or wikipedia, heritage, historic, places of worship, museums, attractions. A landmark mapped only as a point marks the building it stands in. Landmarks larger than half the square (a whole district or campus) are listed separately, not counted as cut.

## Usage

```bash
cd tools/plot-square
python3 plot_square.py --find "<part of a name>"  # look a name up: ids and coordinates; several things often share a name
python3 plot_square.py --center-osm w542890833 --size 200 --out-dir work
python3 plot_square.py --lat 23.1173 --lon 113.2339 --size 230 --keep "<name>;<another name>" --out-dir work
python3 plot_square.py --lat .. --lon .. --keep-at 23.11760,113.23300 --out-dir work   # a building with no name on the map
python3 plot_square.py --lat .. --lon .. --rotate north --fixed --out-dir work         # no moving or turning: check this placement
```

Exit code: 0 = no landmark cut and everything named is inside; 2 = something is still cut or missing (see the output); 1 = error. Needs Python 3.9+ and `osmium` (`brew install osmium-tool`), nothing else.

`--keep` looks for an exact name first, then landmarks whose name contains the text, so keeping a museum does not land on a nearer building named after the museum's office block.

## Tests

```bash
cd tools/plot-square && python3 test_plot_square.py -v
```

The synthetic tests run anywhere. The real-data test (Sacred Heart Cathedral on the west edge: reported as cut, then freed by the search) runs only where the local extract and osmium exist and is skipped elsewhere. The two fixed faults (named buildings ranked above avoiding cuts; exact names first) each have a test, confirmed to fail with the old code put back.

## Known simplifications

- Courtyards (holes in polygons) are ignored; a building with a courtyard counts as solid.
- The placement weights are set by hand (marked `simplified` in the code); if a placement looks wrong, read the preview first, then tune them.
- OSM tagging in Guangzhou is patchy: many old buildings carry no tags and count as ordinary. Name the ones that matter with `--keep` or `--keep-at`.

## Origin

The idea comes from April Zhu's Pocket City skill (read on 2026-11-23, non-commercial licence). None of its code is used here: this is written from scratch on the idea of turning to the streets and sliding off landmarks, with the local extract as the data source.

## Who opens this, AI material

For anyone making work from a real neighbourhood. The code was written in collaboration with AI; map data © OpenStreetMap contributors (ODbL).
