import type { BodyGlyphGeometryWorkerRequest, BodyGlyphGeometryWorkerResponse } from "./bodyGlyphGeometryWorkerProtocol";
import { BODY_IDS, createBodyGlyphGeometryData } from "./scene";
type GeometryWorkerScope = {
  addEventListener: (type: "message", listener: (event: MessageEvent<BodyGlyphGeometryWorkerRequest>) => void) => void;
  postMessage: (response: BodyGlyphGeometryWorkerResponse, transfer: ArrayBuffer[]) => void;
};
const workerScope = globalThis as unknown as GeometryWorkerScope;
workerScope.addEventListener("message", ({
  data
}) => {
  const geometry = {
    luna: createBodyGlyphGeometryData("luna", data.counts.luna),
    sol: createBodyGlyphGeometryData("sol", data.counts.sol),
    terra: createBodyGlyphGeometryData("terra", data.counts.terra)
  };
  const transfer = BODY_IDS.flatMap(bodyId => {
    const body = geometry[bodyId];
    return [body.elevations.buffer, body.glyphIndices.buffer, body.revealDelays.buffer, body.surfaceNormals.buffer] as ArrayBuffer[];
  });
  workerScope.postMessage({
    geometry
  }, transfer);
});