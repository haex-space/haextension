/** Fetches a gzip-compressed WAD from the extension bundle and returns it uncompressed. */
export async function loadBundledWad(url: string): Promise<Uint8Array> {
  const response = await fetch(url);
  if (!response.ok || !response.body) {
    throw new Error(`Could not load ${url}: HTTP ${response.status}`);
  }
  try {
    const stream = response.body.pipeThrough(new DecompressionStream("gzip"));
    return new Uint8Array(await new Response(stream).arrayBuffer());
  } catch (cause) {
    throw new Error(`Could not decompress ${url}`, { cause });
  }
}
