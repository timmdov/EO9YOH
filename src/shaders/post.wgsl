
struct PostUniforms {
  screen : vec4f,
  camera : vec4f,
  grade : vec4f,
  fx : vec4f,
  flash : vec4f,
  danger : vec4f,
};

struct FullOut {
  @builtin(position) clipPos : vec4f,
  @location(0) uv : vec2f,
};

@vertex
fn vsFull(@builtin(vertex_index) vi : u32) -> FullOut {
  var corners = array<vec2f, 3>(vec2f(-1.0, -1.0), vec2f(3.0, -1.0), vec2f(-1.0, 3.0));
  let p = corners[vi];
  var fout : FullOut;
  fout.clipPos = vec4f(p, 0.0, 1.0);
  fout.uv = vec2f(p.x * 0.5 + 0.5, 0.5 - p.y * 0.5);
  return fout;
}
