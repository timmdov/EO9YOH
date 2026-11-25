var VERTEX_FLOATS = 10;
var VERTEX_STRIDE = VERTEX_FLOATS * 4;
var STATIC_VERTEX_LAYOUT: GPUVertexBufferLayout = {
  arrayStride: VERTEX_STRIDE,
  attributes: [
    { shaderLocation: 0, offset: 0, format: "float32x3" },
    { shaderLocation: 1, offset: 12, format: "float32x3" },
    { shaderLocation: 2, offset: 24, format: "float32x4" }
  ]
};
var nextMeshId = 1;
class Mesh {
  id = nextMeshId++;
  vertexBuffer;
  indexBuffer;
  indexCount;
  constructor(device: GPUDevice, vertices: Float32Array<ArrayBuffer>, indices: Uint32Array<ArrayBuffer>, label: string = "mesh") {
    this.indexCount = indices.length;
    this.vertexBuffer = createBufferWithData(device, vertices, GPUBufferUsage.VERTEX, `${label}-vb`);
    this.indexBuffer = createBufferWithData(device, indices, GPUBufferUsage.INDEX, `${label}-ib`);
  }
  destroy() {
    this.vertexBuffer.destroy();
    this.indexBuffer.destroy();
  }
};
function createBufferWithData(device: GPUDevice, data: Float32Array<ArrayBuffer> | Uint32Array<ArrayBuffer>, usage: number, label: string) {
  const buffer = device.createBuffer({ label, size: Math.max(4, data.byteLength), usage, mappedAtCreation: true });
  const Ctor = data instanceof Float32Array ? Float32Array : Uint32Array;
  new Ctor(buffer.getMappedRange()).set(data);
  buffer.unmap();
  return buffer;
}

export { createBufferWithData,Mesh,nextMeshId,STATIC_VERTEX_LAYOUT,VERTEX_FLOATS,VERTEX_STRIDE };
