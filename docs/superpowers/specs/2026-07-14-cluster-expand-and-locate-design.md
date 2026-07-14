# Cluster Expansion and Single-Footprint Location

## Goal

Make a cluster's "在地图中展开" command visibly reveal the individual locations, and let users locate a specific footprint directly from the cluster sheet.

## Root Cause

The earlier `fitBounds` followed by a forced zoom to 17 can push a geographically broad cluster's children outside the viewport. The command changes the map, but does not reliably reveal the cluster's individual markers.

## Design

`ClusterMarkers` will keep the Leaflet cluster layer associated with the current sheet selection. The sheet will expand a multi-place selection by calling that layer's built-in `spiderfy()` method. This places every child marker around the cluster in the current viewport, including when the cluster's geographic bounds are too broad to fit and show at an individual-marker zoom simultaneously.

Each footprint row in `ClusterFootprintSheet` will become a row container with two independent commands:

- The primary card command opens that footprint's detail, preserving current behavior.
- A labeled map-pin icon command focuses that footprint on the map, closes the sheet, and invokes the existing selection callback so the selected marker state follows the map.

The location command will use the footprint's own coordinates and a focused zoom of 17. Footprints without valid coordinates will not expose the command.

## Data Flow

The cluster click payload retains an ephemeral `expandOnMap` callback that calls the clicked Leaflet cluster layer's `spiderfy()` method. The sheet invokes it before closing. The sheet also receives the visible footprint list and has access to Leaflet's map instance; for an individual card it calls `map.flyTo`, calls `onSelect(id)`, then closes. No backend or persisted-state contract changes are needed.

## Error Handling

Invalid or missing coordinates do not produce a map command. The ephemeral expansion callback safely ignores errors from a stale Leaflet cluster layer.

## Tests

- The expansion command calls the clicked cluster layer's `spiderfy()` callback and closes the sheet.
- The cluster click payload includes the expansion callback, while the existing first-click sheet behavior remains unchanged.
- A valid card exposes a location command; clicking it flies to that footprint, selects it, and closes the sheet in that order.
- Cards without valid coordinates omit the location command.
