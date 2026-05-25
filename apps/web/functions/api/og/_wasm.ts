import { Resvg, initWasm } from "@resvg/resvg-wasm";
import resvgWasm from "@resvg/resvg-wasm/index_bg.wasm";
import { fontBuffers, SERIF_FAMILY, MONO_FAMILY } from "./_fonts";

let initPromise: Promise<void> | null = null;

function ensureWasm(): Promise<void> {
  if (!initPromise) {
    initPromise = initWasm(resvgWasm as WebAssembly.Module);
  }
  return initPromise;
}

export async function svgToPng(svg: string): Promise<Uint8Array> {
  await ensureWasm();
  const resvg = new Resvg(svg, {
    font: {
      loadSystemFonts: false,
      fontBuffers: fontBuffers(),
      defaultFontFamily: SERIF_FAMILY,
      serifFamily: SERIF_FAMILY,
      sansSerifFamily: SERIF_FAMILY,
      monospaceFamily: MONO_FAMILY,
    },
  });
  return resvg.render().asPng();
}
