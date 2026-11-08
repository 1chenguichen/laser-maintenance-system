// A subpixel display derivative; retain the original GeoJSON and every region/ring.
import fs from "node:fs/promises";
const source = new URL(
  "../packages/iot-web/assets/china-provinces.json",
  import.meta.url,
);
const data = JSON.parse(await fs.readFile(source, "utf8"));
const tolerance = 0.28;
let before = 0,
  after = 0,
  rings = 0;
const project = (p) => [
  ((p[0] - 73) / 63) * 790 + 25,
  ((55 - p[1]) / 52) * 545 + 20,
];
function simplify(points) {
  if (points.length <= 4) return points;
  const keep = new Set([0, points.length - 1]),
    stack = [[0, points.length - 1]];
  while (stack.length) {
    const [first, last] = stack.pop(),
      a = points[first],
      b = points[last],
      dx = b[0] - a[0],
      dy = b[1] - a[1],
      length = dx * dx + dy * dy;
    let distance = tolerance * tolerance,
      index = -1;
    for (let i = first + 1; i < last; i++) {
      const p = points[i],
        t = length
          ? Math.max(
              0,
              Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / length),
            )
          : 0,
        d = (p[0] - a[0] - t * dx) ** 2 + (p[1] - a[1] - t * dy) ** 2;
      if (d > distance) {
        distance = d;
        index = i;
      }
    }
    if (index >= 0) {
      keep.add(index);
      stack.push([first, index], [index, last]);
    }
  }
  const result = [...keep].sort((a, b) => a - b).map((i) => points[i]);
  return result.length >= 4 ? result : points;
}
const regions = data.features
  .filter((f) => f.geometry)
  .map((f) => {
    const polygons =
      f.geometry.type === "Polygon"
        ? [f.geometry.coordinates]
        : f.geometry.coordinates;
    const path = polygons
      .map((poly) =>
        poly
          .map((ring) => {
            rings++;
            before += ring.length;
            const reduced = simplify(ring.map(project));
            after += reduced.length;
            return (
              reduced
                .map(
                  (p, i) =>
                    (i ? "L" : "M") +
                    p.map((v) => Number(v.toFixed(1))).join(","),
                )
                .join("") + "Z"
            );
          })
          .join(""),
      )
      .join("");
    return { name: f.properties.name, path };
  });
const result = { viewBox: "0 0 850 590", tolerancePixels: tolerance, regions };
await fs.writeFile(
  new URL("../packages/iot-web/assets/china-display.json", import.meta.url),
  JSON.stringify(result),
);
console.log(
  `Map display derivative: ${regions.length} regions, ${rings} rings, ${before} → ${after} vertices; ${tolerance}px simplification tolerance.`,
);
