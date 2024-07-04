
@group(0) @binding(0) var<uniform> perspective: mat4x4<f32>;
@group(0) @binding(1) var<uniform> camera: mat4x4<f32>;
@group(0) @binding(2) var<uniform> transform: mat4x4<f32>;
@group(0) @binding(3) var<uniform> resolution: vec2<f32>;

@vertex
fn vertex_main(
    @builtin(instance_index) edge_index: u32,
    @builtin(vertex_index) vertex_index: u32,
) -> @builtin(position) vec4<f32> {
    const edges = array(
        array(vec3(0.0, 0.0, 0.0), vec3(1.0, 0.0, 0.0)),
        array(vec3(1.0, 0.0, 0.0), vec3(1.0, 1.0, 0.0)),
        array(vec3(1.0, 1.0, 0.0), vec3(0.0, 1.0, 0.0)),
        array(vec3(0.0, 1.0, 0.0), vec3(0.0, 0.0, 0.0)),
        array(vec3(0.0, 0.0, 1.0), vec3(1.0, 0.0, 1.0)),
        array(vec3(1.0, 0.0, 1.0), vec3(1.0, 1.0, 1.0)),
        array(vec3(1.0, 1.0, 1.0), vec3(0.0, 1.0, 1.0)),
        array(vec3(0.0, 1.0, 1.0), vec3(0.0, 0.0, 1.0)),
        array(vec3(0.0, 0.0, 0.0), vec3(0.0, 0.0, 1.0)),
        array(vec3(1.0, 0.0, 0.0), vec3(1.0, 0.0, 1.0)),
        array(vec3(1.0, 1.0, 0.0), vec3(1.0, 1.0, 1.0)),
        array(vec3(0.0, 1.0, 0.0), vec3(0.0, 1.0, 1.0)),
    );
    let edge = edges[edge_index];
    let start = perspective * camera * transform * vec4(edge[0], 1.0);
    let end = perspective * camera * transform * vec4(edge[1], 1.0);
    const square_vertices = array(
        vec2(0.0, 0.0), vec2(0.0, 1.0), vec2(1.0, 1.0),
        vec2(1.0, 1.0), vec2(1.0, 0.0), vec2(0.0, 0.0),
    );
    let square_vertex = square_vertices[vertex_index];

    let edge_px = (end - start).xy * resolution;
    let perp_px = vec4(vec2(edge_px.y, -edge_px.x) / resolution, 0.0, 0.0);

    return mix(start, end, square_vertex.x) + mix(vec4(), perp_px, square_vertex.y);
}

@fragment
fn fragment_main() -> @location(0) vec4<f32> {
    return vec4(0.0, 0.0, 0.0, 1.0);
}
