# Cluster Expansion and Single-Footprint Location

## Goal

Make a cluster's "在地图中展开" command visibly reveal the individual locations, and let users locate a specific footprint directly from the cluster sheet.

## Root Cause

The sheet currently limits `fitBounds` to the current zoom plus two levels. Nearby places therefore remain within MarkerCluster's radius and render as the same cluster after the command completes. The command changes the map, but does not meet the user's visible outcome.

## Design

`ClusterMarkers` will stop clustering at zoom level 17. The sheet will expand a multi-place selection with `fitBounds` capped at that same level, without limiting it relative to the current zoom. As a result, any valid multi-place cluster enters the non-clustered map state when expanded.

Each footprint row in `ClusterFootprintSheet` will become a row container with two independent commands:

- The primary card command opens that footprint's detail, preserving current behavior.
- A labeled map-pin icon command focuses that footprint on the map, closes the sheet, and invokes the existing selection callback so the selected marker state follows the map.

The location command will use the footprint's own coordinates and a focused zoom of 17. Footprints without valid coordinates will not expose the command.

## Data Flow

The cluster sheet already receives the visible footprint list and has access to Leaflet's map instance. It will find the selected footprint locally, call `map.flyTo`, call `onSelect(id)`, then close. No backend or global-state contract changes are needed.

## Error Handling

Invalid or missing coordinates do not produce a map command. Leaflet navigation remains protected from stale map errors in the cluster-expansion path.

## Tests

- The expansion command requests the non-clustered zoom ceiling rather than current zoom plus two.
- The marker cluster configuration disables clustering at the same zoom.
- A valid card exposes a location command; clicking it flies to that footprint, selects it, and closes the sheet in that order.
- Cards without valid coordinates omit the location command.
