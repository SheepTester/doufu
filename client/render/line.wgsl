struct VertexOutput {
    @builtin(position) position: vec4<f32>,
    @location(0) color: vec3<f32>,
};

@group(0) @binding(0) var<uniform> perspective: mat4x4<f32>;
@group(0) @binding(1) var<uniform> camera: mat4x4<f32>;
// in CSS pixels (i.e. without DPR)
@group(0) @binding(2) var<uniform> canvas_size: vec2<f32>;

const square_vertices = array(
    vec2(-0.5, -0.5), vec2(-0.5, 0.5), vec2(0.5, 0.5),
    vec2(0.5, 0.5), vec2(0.5, -0.5), vec2(-0.5, -0.5),
);

@vertex
fn vertex_main(
    @builtin(vertex_index) vertex_index: u32,
    @location(0) start: vec3<f32>,
    @location(1) end: vec3<f32>,
    @location(2) color: u32,
) -> VertexOutput {
    let pv = perspective * camera;
    var start_projected = pv * vec4(start, 1.0);
    var end_projected = pv * vec4(end, 1.0);

    if (start_projected.w <= 0.0 && end_projected.w <= 0.0) {
        return VertexOutput(vec4(0.0), vec3(0.0));
    }

    let t = start_projected.w / (start_projected.w - end_projected.w);
    if (start_projected.w <= 0.0) {
        start_projected = mix(start_projected, end_projected, t + 0.0001);
    }
    if (end_projected.w <= 0.0) {
        end_projected = mix(start_projected, end_projected, t - 0.0001);
    }

    start_projected /= start_projected.w;
    end_projected /= end_projected.w;

    // in CSS pixels
    let delta = (end_projected.xy - start_projected.xy) * canvas_size;
    let forward = delta / length(delta);
    // back to screen space (thickness of 2 pixels)
    let up = vec2(forward.y, -forward.x) * 2.0 / canvas_size;

    let vertex = square_vertices[vertex_index];
    let base = select(start_projected, end_projected, vertex.x > 0.0);

    return VertexOutput(
        vec4(base.xy + up * vertex.y, base.zw),
        vec3(
            f32(color >> 16) / 255.0,
            f32((color >> 8) & 0xff) / 255.0,
            f32(color & 0xff) / 255.0,
        ),
    );
}

@fragment
fn fragment_main(vertex: VertexOutput) -> @location(0) vec4<f32> {
    return vec4(vertex.color, 1.0);
}
