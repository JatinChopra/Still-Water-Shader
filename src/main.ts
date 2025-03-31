import './style.css'
import * as THREE from 'three';
import GUI from 'lil-gui';

import Stats from 'three/examples/jsm/libs/stats.module.js';
import { GLTFLoader, OrbitControls, RGBELoader } from 'three/examples/jsm/Addons.js';

import perlinNoise from '/src/shaders/perlinNoise.glsl?raw';

const clock = new THREE.Clock();

const cnvs = document.querySelector("#c") as HTMLCanvasElement;

const w = cnvs.clientWidth;
const h = cnvs.clientHeight;

const re = new THREE.WebGLRenderer({ canvas: cnvs, antialias: true });
re.setPixelRatio(window.devicePixelRatio);
re.setSize(w, h, false);


const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, w / h, 0.01, 1000);
camera.position.set(0, 4, 12);


new RGBELoader().load('/env_4k.hdr', (envMap) => {
  envMap.mapping = THREE.EquirectangularReflectionMapping;
  scene.background = envMap;
  scene.environment = envMap;

});


let poolBig = new THREE.Mesh();
let poolSmall = new THREE.Mesh();
//@ts-ignore
let suzanne = new THREE.Mesh();

new GLTFLoader().load('/pools.glb', (model) => {
  model.scene.traverse((obj) => {
    if (obj.name == "suzanne")
      suzanne = obj as THREE.Mesh;
    if (obj.name == "poolBig")
      poolBig = obj as THREE.Mesh;
    if (obj.name == "poolSmall")
      poolSmall = obj as THREE.Mesh;
    poolSmall.visible = false;

  });

  scene.add(model.scene);
});


const orbCtrls = new OrbitControls(camera, cnvs);
const stats = new Stats();
document.body.appendChild(stats.dom);

const renderTarget = new THREE.WebGLRenderTarget(w, h);
renderTarget.depthTexture = new THREE.DepthTexture(w, h);
renderTarget.depthTexture.type = THREE.FloatType;
renderTarget.depthTexture.format = THREE.DepthFormat;

const waterUniformData = {
  uTime: {
    value: clock.getElapsedTime(),
  },
  uWindowSize: {
    value: new THREE.Vector2(cnvs.clientWidth, cnvs.clientHeight)
  },
  uSceneTexture: {
    value: renderTarget.texture
  },
  uDistortFreq: {
    value: 28.0
  },
  uDistortAmp: {
    value: 0.007
  },
};

const waterPlaneGeo = new THREE.PlaneGeometry(20, 20);
const waterMaterial = new THREE.ShaderMaterial();
waterMaterial.uniforms = waterUniformData;
waterMaterial.vertexShader = `
  void main(){
    vec3 localPos = position;
    vec4 worldPos = modelMatrix * vec4(localPos,1.0);
    vec4 viewPos = viewMatrix * worldPos;
    vec4 clipPos = projectionMatrix * viewPos;

    gl_Position = clipPos;
  }
`;

waterMaterial.fragmentShader = `
uniform float uTime;
uniform vec2 uWindowSize;

uniform sampler2D uSceneTexture;
uniform float uDistortFreq;
uniform float uDistortAmp;

  ${perlinNoise}

  void main(){

    // scene below the water surface
    vec2 sceneCoord = gl_FragCoord.xy / uWindowSize;

    float offsetX = cnoise(vec2(sceneCoord.x)*uDistortFreq+uTime)*uDistortAmp;
    float offsetY = cnoise(vec2(sceneCoord.y)*uDistortFreq+uTime)*uDistortAmp;

    vec2 distortedCoord = vec2(sceneCoord.x+offsetX, sceneCoord.y+offsetY);

    vec4 sceneBeneath = texture2D(uSceneTexture,distortedCoord);

    vec3 color = vec3(1.0);
    color = sceneBeneath.rgb;
    gl_FragColor = vec4(color,1.0);
  }
`;

const water = new THREE.Mesh(waterPlaneGeo, waterMaterial);
water.rotateX(Math.PI * -0.5);
scene.add(water);


const gui = new GUI();

const visibilityFolder = gui.addFolder('Mesh Visibility');

visibilityFolder.add(poolBig, 'visible').onChange((val: boolean) => {
  poolBig.visible = val;
}).name("Pool Big");
visibilityFolder.add(poolSmall, 'visible').onChange((val: boolean) => {
  poolSmall.visible = val;
}).name("Pool Small").setValue(false);

const distortionFolder = gui.addFolder("Surface Distortion");
distortionFolder.add(waterUniformData.uDistortFreq, "value", 0, 50, 0.1).name('Frequency');
distortionFolder.add(waterUniformData.uDistortAmp, "value", 0.001, 0.01, 0.001).name('Amplitude');


function updateWaterUniforms(time: number) {
  waterUniformData.uTime.value = time;

  waterUniformData.uWindowSize.value.x = cnvs.clientWidth;
  waterUniformData.uWindowSize.value.y = cnvs.clientHeight;

  waterUniformData.uSceneTexture.value = renderTarget.texture;
}

function updateRendererSize() {

  const currWidth = cnvs.clientWidth;
  const currHeight = cnvs.clientHeight;

  if (currWidth != w || currHeight != h) {
    re.setSize(currWidth, currHeight, false);
    camera.aspect = currWidth / currHeight;
    camera.updateProjectionMatrix();


    // resize render target
    renderTarget.setSize(currWidth, currHeight);

  }


}

function animate() {
  orbCtrls.update();
  stats.update();

  updateRendererSize();

  const time = clock.getElapsedTime();

  updateWaterUniforms(time);

  water.visible = false;
  re.setRenderTarget(renderTarget);
  re.render(scene, camera);

  water.visible = true;
  re.setRenderTarget(null);
  re.render(scene, camera);
  requestAnimationFrame(animate);
};

animate();

window.addEventListener('orientationchange', () => {
  location.reload();
});


