Geographic data source: https://geo.datav.aliyun.com/areas_v3/bound/100000_full.json
Retrieved 2026-11-07 for the device-distribution reference map. Original feature coordinates and administrative boundaries are preserved; point positions come from device installation records. Missing positions are not fabricated. This is not a live GPS tracking layer.


Performance display derivative: china-display.json is built by scripts/build-iot-map.mjs from the retained original GeoJSON. It projects into the existing 850×590 viewBox, simplifies within 0.28 viewBox pixel before coordinate rounding, and retains all 35 region records and 339 polygon rings. Used only for the fixed national dashboard, not precision GIS or boundary measurements. Original coordinates remain in china-provinces.json. Browser downloads the 124KB derivative instead of the 583KB original.
