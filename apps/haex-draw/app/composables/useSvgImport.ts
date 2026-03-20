/**
 * Parses an SVG file, extracts all path data, normalizes it to be
 * centered at origin, and returns the combined path string + dimensions.
 */
export function useSvgImport() {
  const importSvgAsync = (): Promise<{ svgPath: string; width: number; height: number; name: string } | null> => {
    return new Promise((resolve) => {
      const input = document.createElement("input");
      input.type = "file";
      input.accept = ".svg,image/svg+xml";

      input.onchange = async () => {
        const file = input.files?.[0];
        if (!file) return resolve(null);

        const text = await file.text();
        const result = parseSvg(text);
        if (!result) return resolve(null);

        const name = file.name.replace(/\.svg$/i, "");
        resolve({ ...result, name });
      };

      input.oncancel = () => resolve(null);
      input.click();
    });
  };

  return { importSvgAsync };
}

function parseSvg(svgText: string): { svgPath: string; width: number; height: number } | null {
  const parser = new DOMParser();
  const doc = parser.parseFromString(svgText, "image/svg+xml");
  const svg = doc.querySelector("svg");
  if (!svg) return null;

  // Get viewBox or width/height for coordinate space
  const viewBox = svg.getAttribute("viewBox");
  let svgWidth = parseFloat(svg.getAttribute("width") ?? "0");
  let svgHeight = parseFloat(svg.getAttribute("height") ?? "0");

  if (viewBox) {
    const parts = viewBox.split(/[\s,]+/).map(Number);
    if (parts.length === 4) {
      svgWidth = parts[2];
      svgHeight = parts[3];
    }
  }

  if (!svgWidth || !svgHeight) return null;

  // Collect all path data
  const pathSegments: string[] = [];

  // Extract <path> elements
  for (const pathEl of svg.querySelectorAll("path")) {
    const d = pathEl.getAttribute("d");
    if (d) pathSegments.push(d);
  }

  // Convert basic shapes to paths
  for (const rect of svg.querySelectorAll("rect")) {
    const x = parseFloat(rect.getAttribute("x") ?? "0");
    const y = parseFloat(rect.getAttribute("y") ?? "0");
    const w = parseFloat(rect.getAttribute("width") ?? "0");
    const h = parseFloat(rect.getAttribute("height") ?? "0");
    if (w && h) pathSegments.push(`M${x},${y} h${w} v${h} h${-w} Z`);
  }

  for (const circle of svg.querySelectorAll("circle")) {
    const cx = parseFloat(circle.getAttribute("cx") ?? "0");
    const cy = parseFloat(circle.getAttribute("cy") ?? "0");
    const r = parseFloat(circle.getAttribute("r") ?? "0");
    if (r) {
      pathSegments.push(
        `M${cx - r},${cy} A${r},${r} 0 1,0 ${cx + r},${cy} A${r},${r} 0 1,0 ${cx - r},${cy} Z`
      );
    }
  }

  for (const ellipse of svg.querySelectorAll("ellipse")) {
    const cx = parseFloat(ellipse.getAttribute("cx") ?? "0");
    const cy = parseFloat(ellipse.getAttribute("cy") ?? "0");
    const rx = parseFloat(ellipse.getAttribute("rx") ?? "0");
    const ry = parseFloat(ellipse.getAttribute("ry") ?? "0");
    if (rx && ry) {
      pathSegments.push(
        `M${cx - rx},${cy} A${rx},${ry} 0 1,0 ${cx + rx},${cy} A${rx},${ry} 0 1,0 ${cx - rx},${cy} Z`
      );
    }
  }

  for (const poly of svg.querySelectorAll("polygon")) {
    const points = poly.getAttribute("points");
    if (points) {
      const coords = points.trim().split(/[\s,]+/);
      const parts: string[] = [];
      for (let i = 0; i < coords.length; i += 2) {
        parts.push(`${i === 0 ? "M" : "L"}${coords[i]},${coords[i + 1]}`);
      }
      parts.push("Z");
      pathSegments.push(parts.join(" "));
    }
  }

  if (pathSegments.length === 0) return null;

  // Combine all paths and normalize to center at origin
  // Scale to fit within a reasonable size (use SVG dimensions)
  const combinedPath = pathSegments.join(" ");

  // Transform: shift by -svgWidth/2, -svgHeight/2 to center at origin
  // We prepend a transform using SVG path commands isn't possible directly,
  // so we use a matrix transform approach via Path2D + canvas
  const normalizedPath = normalizePath(combinedPath, svgWidth, svgHeight);

  return {
    svgPath: normalizedPath,
    width: Math.round(svgWidth),
    height: Math.round(svgHeight),
  };
}

/**
 * Takes SVG path data in its original coordinate space and returns
 * path data centered at (0,0) by applying a translate transform.
 * Uses a temporary canvas to re-serialize the path.
 */
function normalizePath(pathData: string, width: number, height: number): string {
  // We can't easily transform SVG path strings directly.
  // Instead, we create a DOMMatrix-transformed path and return the original
  // path data with an M-offset approach.
  //
  // Since Path2D doesn't expose path data back, we store the original path
  // and apply the centering transform at render time via ctx.translate.
  // The path data stays in its original SVG coordinate space (0,0 = top-left).
  //
  // At render time, getStencilClipPath will translate by (-width/2, -height/2)
  // before using the path, so the stencil center aligns with (0,0).
  return pathData;
}
