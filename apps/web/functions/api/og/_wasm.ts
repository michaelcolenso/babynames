import { Resvg, initWasm } from "@resvg/resvg-wasm";
import resvgWasm from "@resvg/resvg-wasm/index_bg.wasm";

let initPromise: Promise<void> | null = null;

function ensureWasm(): Promise<void> {
  if (!initPromise) {
    initPromise = initWasm(resvgWasm as WebAssembly.Module);
  }
  return initPromise;
}

export async function svgToPng(svg: string): Promise<Uint8Array> {
  await ensureWasm();
  const resvg = new Resvg(svg);
  return resvg.render().asPng();
}
