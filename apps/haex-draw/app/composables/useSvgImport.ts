import type { SvgViewBox } from "~/types/stencil";
import { parseSvgViewBox } from "~/utils/canvas/svgStencil";

interface ParsedSvg {
  svgPath: string;
  viewBox: SvgViewBox;
}

/**
 * Parses an SVG file and returns its combined path data together with the
 * coordinate space the path is expressed in.
 */
export function useSvgImport() {
  /**
   * Import SVG either from a file path (vault-sdk) or via file picker dialog.
   * @param filePath Optional: absolute path to SVG file (reads via vault-sdk)
   */
  const importSvgAsync = async (filePath?: string): Promise<(ParsedSvg & { name: string }) | null> => {
    if (filePath) {
      // Read SVG via vault-sdk filesystem
      const haexVault = useHaexVaultStore();
      const data = await haexVault.client.filesystem.readFile(filePath);
      const text = new TextDecoder().decode(data);
      const result = parseSvg(text);
      if (!result) return null;
      const name = filePath.split("/").pop()?.replace(/\.svg$/i, "") ?? "SVG";
      return { ...result, name };
    }

    // Fallback: HTML file picker
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

function parseSvg(svgText: string): ParsedSvg | null {
  const parser = new DOMParser();
  const doc = parser.parseFromString(svgText, "image/svg+xml");
  const svg = doc.querySelector("svg");
  if (!svg) return null;

  const viewBox = parseSvgViewBox(svg.getAttribute("viewBox"), svg.getAttribute("width"), svg.getAttribute("height"));
  if (!viewBox) return null;

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

  // The path stays in SVG coordinates; getStencilClipPath maps the view box onto the stencil.
  return { svgPath: pathSegments.join(" "), viewBox };
}
