struct VertexOutput {
    @builtin(position) position: vec4<f32>,
    @location(0) coord: vec3<f32>,
};

@group(0) @binding(0) var<uniform> perspective: mat4x4<f32>;
@group(0) @binding(1) var<uniform> camera: mat4x4<f32>;
@group(0) @binding(2) var<uniform> transform: mat4x4<f32>;
@group(0) @binding(3) var<uniform> resolution: vec2<f32>;

const LINE_WIDTH = 5.0;

fn move_closer(pt: vec4<f32>) -> vec4<f32> {
    return vec4(pt.xy, pt.z + 0.01, pt.w);
}

@vertex
fn vertex_main(
    @builtin(instance_index) edge_index: u32,
    @builtin(vertex_index) vertex_index: u32,
) -> VertexOutput {
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
    let start = perspective * move_closer(camera * transform * vec4(edge[0], 1.0));
    let end = perspective * move_closer(camera * transform * vec4(edge[1], 1.0));
    const square_vertices = array(
        vec2(0.0, 0.0), vec2(0.0, 1.0), vec2(1.0, 1.0),
        vec2(1.0, 1.0), vec2(1.0, 0.0), vec2(0.0, 0.0),
    );
    let square_vertex = square_vertices[vertex_index];

    let edge_length_px = length((end - start).xy * resolution);
    let edge_px = normalize((end - start).xy * resolution) * LINE_WIDTH;
    let para_px = vec4(edge_px / resolution, 0.0, 0.0);
    let perp_px = vec4(vec2(edge_px.y, -edge_px.x) / resolution, 0.0, 0.0);

    return VertexOutput(
        mix(start - para_px, end + para_px, square_vertex.x) + mix(-perp_px, perp_px, square_vertex.y),
        vec3(
            mix(-LINE_WIDTH, LINE_WIDTH, square_vertex.y),
            mix(-LINE_WIDTH, edge_length_px + LINE_WIDTH, square_vertex.x),
            mix(edge_length_px + LINE_WIDTH, -LINE_WIDTH, square_vertex.x)
        )
    );
}

@fragment
fn fragment_main(vertex: VertexOutput) -> @location(0) vec4<f32> {
    if (vertex.coord.y < 0.0 && length(vertex.coord.xy) > LINE_WIDTH) {
        discard;
    }
    if (vertex.coord.z < 0.0 && length(vertex.coord.xz) > LINE_WIDTH) {
        discard;
    }
    return vec4(0.0, 0.0, 0.0, 1.0);
}
