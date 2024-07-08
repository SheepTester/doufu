struct VertexOutput {
    @builtin(position) position: vec4<f32>,
    @location(0) tex_coord: vec2<f32>,
};

@group(0) @binding(0) var<uniform> perspective: mat4x4<f32>;
@group(0) @binding(1) var<uniform> camera: mat4x4<f32>;

// For all entity models
@group(1) @binding(0) var<uniform> model_transform: mat4x4<f32>;
@group(1) @binding(1) var<uniform> texture_size: vec2<f32>;
@group(1) @binding(2) var texture_sampler: sampler;
@group(1) @binding(3) var texture: texture_2d<f32>;

// The back face (facing away from the camera)
const square_vertices = array(
    vec2(0.0, 0.0), vec2(0.0, 1.0), vec2(1.0, 1.0),
    vec2(1.0, 1.0), vec2(1.0, 0.0), vec2(0.0, 0.0),
);
fn get_cube_vertex(face_index: u32, face: u32) -> vec3<f32> {
    let square_vertex = square_vertices[face_index];
    let flipped = select(
        vec3(square_vertex.x, square_vertex.y, 0.0),
        // Rotate ("flip") around center of cube
        vec3(1.0 - square_vertex.x, square_vertex.y, 1.0),
        (face & 1) != 0,
    );
    let rotated = select(
        select(
            // 00x: back/front
            flipped,
            // 01x: left/right
            vec3(flipped.z, flipped.y, 1.0 - flipped.x),
            (face & 2) != 0
        ),
        // 10x: bottom/top
        vec3(flipped.x, flipped.z, 1.0 - flipped.y),
        (face & 4) != 0
    );
    return rotated;
}

@vertex
fn vertex_main(
    @builtin(vertex_index) index: u32,
    // Per cube
    @location(0) cube_transform_0: vec4<f32>,
    @location(1) cube_transform_1: vec4<f32>,
    @location(2) cube_transform_2: vec4<f32>,
    @location(3) cube_transform_3: vec4<f32>,
    @location(8) uv: vec2<f32>,
    @location(9) cube_size: vec3<f32>,
    // Per model
    @location(4) cube_transform_0: vec4<f32>,
    @location(5) cube_transform_1: vec4<f32>,
    @location(6) cube_transform_2: vec4<f32>,
    @location(7) cube_transform_3: vec4<f32>,
) -> VertexOutput {
    let cube_transform = mat4x4(
        cube_transform_0,
        cube_transform_1,
        cube_transform_2,
        cube_transform_3,
    );

    let face = index / 6;
    let vertex = get_cube_vertex(index % 6, face);

    const X = vec3(1.0, 0.0, 0.0);
    const Y = vec3(0.0, 1.0, 0.0);
    const Z = vec3(0.0, 0.0, 1.0);
    // mat2x3 is 3 rows by 2 columns
    const all_face_origins = array(
        transpose(mat2x3(Z + X + Z, Z)), // BACK
        transpose(mat2x3(Z, Z)), // FRONT
        transpose(mat2x3(Z + X, Z)), // LEFT
        transpose(mat2x3(vec3(), Z)), // RIGHT
        transpose(mat2x3(Z + X, vec3())), // BOTTOM
        transpose(mat2x3(Z, vec3())), // TOP
    );
    const all_face_dimensions = array(
        // back/front are x by y
        transpose(mat2x3(X, Y)),
        // left/right are z by y
        transpose(mat2x3(Z, Y)),
        // bottom/top are x by z
        transpose(mat2x3(X, Z)),
    );
    let face_origin = all_face_origins[face] * cube_size;
    let face_dimensions = all_face_dimensions[face / 2] * cube_size;

    var result: VertexOutput;
    result.position = perspective * camera * model_transform * cube_transform * vec4(vertex, 1.0);
    result.tex_coord = (uv + face_origin + face_dimensions * vec2(1 - square_vertices[index].x, square_vertices[index].y)) / texture_size;
    return result;
}

@fragment
fn fragment_main(vertex: VertexOutput) -> @location(0) vec4<f32> {
    let sample = textureSample(texture, texture_sampler, vertex.tex_coord);
    if (sample.a < 0.5) {
        discard;
    }
    return vec4(sample.rgb, sample.a);
}
