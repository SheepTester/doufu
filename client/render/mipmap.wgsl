// https://webgpufundamentals.org/webgpu/lessons/webgpu-importing-textures.html

struct VertexOutput {
    @builtin(position) position: vec4f,
    @location(0) tex_coord: vec2f,
};

const square_vertices = array(
    vec2(0.0, 0.0), vec2(0.0, 1.0), vec2(1.0, 1.0),
    vec2(1.0, 1.0), vec2(1.0, 0.0), vec2(0.0, 0.0),
);

@group(0) @binding(0) var texture_sampler: sampler;
@group(0) @binding(1) var texture: texture_2d<f32>;
@group(0) @binding(2) var<uniform> output_size: vec2<f32>;

@vertex
fn vertex_main(
  @builtin(vertex_index) index: u32
) -> VertexOutput {
    let xy = square_vertices[index];
    var result: VertexOutput;
    result.position = vec4(xy * 2.0 - 1.0, 0.0, 1.0);
    result.tex_coord = vec2(xy.x, 1.0 - xy.y) * output_size;
    return result;
}

@fragment
fn fragment_main(vertex: VertexOutput) -> @location(0) vec4<f32> {
    var sum = vec3(0.0);
    var total = 0.0;
    var sum_alpha = 0.0;
    // Average 2x2 texels into one pixel
    for (var x = 0.0; x < 2.0; x += 1.0) {
        for (var y = 0.0; y < 2.0; y += 1.0) {
            let texel = textureSample(texture, texture_sampler, (floor(vertex.tex_coord) * 2.0 + vec2(x, y) + vec2(0.5)) / (2.0 * output_size));
            // If the texel is transparent, it'd probably be black, so I'd like
            // to exclude it from the average
            if (texel.a > 0) {
                sum += texel.rgb;
                total += 1.0;
            }
            sum_alpha += texel.a;
        }
    }
    if (total > 0.0) {
        return vec4(sum / total, sum_alpha / 4.0);
    } else {
        // If every texel was transparent, then return a transparent texel
        return vec4(0.0);
    }
}
