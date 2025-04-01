varying vec2 vUv;

  void main(){

    vUv = uv;

    vec3 localPos = position;
    vec4 worldPos = modelMatrix * vec4(localPos,1.0);
    vec4 viewPos = viewMatrix * worldPos;
    vec4 clipPos = projectionMatrix * viewPos;

    gl_Position = clipPos;
}
