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
camera.position.set(0, 4, -10);


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
  model.scene.rotateY(Math.PI);
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
  uDepthTexture: {
    value: renderTarget.depthTexture
  },
  uDistortFreq: {
    value: 28.0
  },
  uDistortAmp: {
    value: 0.005
  },

  uInverseProjectionMatrix: {
    value: camera.projectionMatrixInverse
  },
  uWorldMatrix: {
    value: camera.matrixWorld
  },
  uMaxDepth: {
    value: 8,
  },
  uColor1: {
    value: new THREE.Color(0x00d5ff),
  },
  uColor2: {
    value: new THREE.Color(0x0000ff),
  },
};

const waterPlaneGeo = new THREE.PlaneGeometry(20, 20);
const waterMaterial = new THREE.ShaderMaterial();
waterMaterial.uniforms = waterUniformData;
waterMaterial.vertexShader = `
varying vec4 vClipPos;
  void main(){
    vec3 localPos = position;
    vec4 worldPos = modelMatrix * vec4(localPos,1.0);
    vec4 viewPos = viewMatrix * worldPos;
    vec4 clipPos = projectionMatrix * viewPos;

    vClipPos = clipPos;
    gl_Position = clipPos;
  }
`;

waterMaterial.fragmentShader = `
uniform float uTime;
uniform vec2 uWindowSize;

uniform sampler2D uSceneTexture;
uniform sampler2D uDepthTexture;
uniform float uDistortFreq;
uniform float uDistortAmp;

uniform mat4 uInverseProjectionMatrix;
uniform mat4 uWorldMatrix;

uniform float uMaxDepth;
uniform vec3 uColor1;
uniform vec3 uColor2;

varying vec4 vClipPos;

  ${perlinNoise}

  void main(){

    // scene below the water surface
    vec2 sceneCoord = gl_FragCoord.xy / uWindowSize;

    float offsetX = cnoise(vec2(sceneCoord.x)*uDistortFreq+uTime)*uDistortAmp;
    float offsetY = cnoise(vec2(sceneCoord.y)*uDistortFreq+uTime)*uDistortAmp;

    vec2 distortedCoord = vec2(sceneCoord.x+offsetX, sceneCoord.y+offsetY);

    vec4 sceneBeneath = texture2D(uSceneTexture,distortedCoord);

    float waterLevel = 0.0;
    float depth = texture2D(uDepthTexture,sceneCoord).r;
    
    vec4 normalizedCoords = vec4(sceneCoord*2.0-1.0,depth*2.0-1.0,1.0);
    vec4 viewPos = uInverseProjectionMatrix * normalizedCoords;
    vec4 worldPos = uWorldMatrix * viewPos;
    viewPos /= viewPos.w;
    worldPos /= worldPos.w;
    
    float heightDiff = 1.0 - clamp((waterLevel - worldPos.y)/uMaxDepth,0.0,1.0);
    vec3 depthColor = mix(uColor1,uColor2,heightDiff);
     

    vec3 color = vec3(1.0);

    //color = sceneBeneath.rgb; 
    //color = vec3(heightDiff);
    //color = depthColor;
    //color = mix(sceneBeneath.rgb + uColor1*(1.0 - heightDiff) , sceneBeneath.rgb*0.2 + uColor2,1.0 - heightDiff);
    color = mix(sceneBeneath.rgb * 0.8 + uColor1 , sceneBeneath.rgb*0.2 + uColor2,1.0 - heightDiff);


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

const depthFolder = gui.addFolder("Depth");
depthFolder.add(waterUniformData.uMaxDepth, "value", 0, 20, 0.01).name('Max Depth');
depthFolder.addColor(waterUniformData.uColor1, "value").name("Color 1");
depthFolder.addColor(waterUniformData.uColor2, "value").name("Color 2");

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


