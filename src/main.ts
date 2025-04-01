import './style.css'
import * as THREE from 'three';
import GUI from 'lil-gui';

import Stats from 'three/examples/jsm/libs/stats.module.js';
import { GLTFLoader, OrbitControls, RGBELoader } from 'three/examples/jsm/Addons.js';

import perlinNoise from "/src/shaders/perlinNoise.glsl?raw";
import vertexShader from '/src/shaders/water/vertex.glsl?raw';
import fragmentShader from '/src/shaders/water/fragment.glsl?raw';


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

const textureLoader = new THREE.TextureLoader();
const foamTexture = textureLoader.load('/foamNoise.png');
foamTexture.wrapS = THREE.RepeatWrapping;
foamTexture.wrapT = THREE.RepeatWrapping;

const normalTexture = textureLoader.load('/normal.jpeg');
normalTexture.wrapS = THREE.RepeatWrapping;
normalTexture.wrapT = THREE.RepeatWrapping;

let poolBig = new THREE.Mesh();
let poolSmall = new THREE.Mesh();
//@ts-ignore
let suzanne = new THREE.Mesh();
let meshMaterial = new THREE.MeshStandardMaterial({
  color: 0xffffff,
  metalness: 0.8,
  roughness: 0
});

new GLTFLoader().load('/pools.glb', (model) => {
  model.scene.rotateY(Math.PI);
  model.scene.traverse((obj) => {
    if (obj.name == "suzanne") {
      suzanne = obj as THREE.Mesh;
      suzanne.material = meshMaterial;
    }
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

const reflectionRenderTarget = new THREE.WebGLRenderTarget(w, h);
const reflectionCamera = new THREE.PerspectiveCamera(75, w / h, 0.01, 1000);

function calculateReflectionCameraPos() {
  reflectionCamera.position.copy(camera.position.clone());
  reflectionCamera.position.y *= -1;
  reflectionCamera.up.set(0, -1, 0);

  const cameraForward = new THREE.Vector3();
  camera.getWorldDirection(cameraForward);

  const target = camera.position.clone().add(cameraForward);
  target.y *= -1;

  reflectionCamera.lookAt(target);
}

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
  uReflectionTexture: {
    value: reflectionRenderTarget.texture,
  },
  uPlanarReflection: {
    value: true,
  },
  uFresnelFactor: {
    value: 0.5
  },
  uFoamDepth: {
    value: 1.0
  },
  uFoamTexture: {
    value: foamTexture,
  },
  uFoamColor: {
    value: new THREE.Color(0xffffff),
  },
  uSolidFoamColor: {
    value: true,
  },
  uNormalTexture: {
    value: normalTexture,
  },
  uSpecularReflection: {
    value: true
  },
  uFoamTiling: {
    value: 1.0
  }

};

const waterPlaneGeo = new THREE.PlaneGeometry(20, 20);
const waterMaterial = new THREE.ShaderMaterial();
waterMaterial.uniforms = waterUniformData;
waterMaterial.vertexShader = vertexShader;

waterMaterial.fragmentShader = perlinNoise + fragmentShader;

const water = new THREE.Mesh(waterPlaneGeo, waterMaterial);
water.rotateX(Math.PI * -0.5);
scene.add(water);


const gui = new GUI();

const meshFolder = gui.addFolder('Mesh');
meshFolder.addColor(meshMaterial, "color");
meshFolder.add(suzanne.position, 'y', -5, 5, 0.01).onChange((val: number) => {
  suzanne.position.y = val;
});


const distortionFolder = gui.addFolder("Surface Distortion");
distortionFolder.add(waterUniformData.uDistortFreq, "value", 0, 50, 0.1).name('Frequency');
distortionFolder.add(waterUniformData.uDistortAmp, "value", 0.001, 0.01, 0.001).name('Amplitude');

const depthFolder = gui.addFolder("Depth");
depthFolder.add(waterUniformData.uMaxDepth, "value", 0, 20, 0.01).name('Max Depth');
depthFolder.add(waterUniformData.uFoamDepth, "value", 0, 5, 0.001).name('Foam Depth');
depthFolder.add(waterUniformData.uFoamTiling, "value", 0, 10, 0.001).name('Foam Tiling');
depthFolder.add(waterUniformData.uSolidFoamColor, "value").name('Solid Foam Color');
depthFolder.addColor(waterUniformData.uColor1, "value").name("Color 1");
depthFolder.addColor(waterUniformData.uColor2, "value").name("Color 2");

const reflectionFolder = gui.addFolder("Reflection");
reflectionFolder.add(waterUniformData.uPlanarReflection, "value").name("Planar Reflection");
reflectionFolder.add(waterUniformData.uSpecularReflection, "value").name("Specular Reflection");
reflectionFolder.add(waterUniformData.uFresnelFactor, "value", 0, 5, 0.001).name("Fresnel strength");

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
    reflectionCamera.aspect = camera.aspect;

    camera.updateProjectionMatrix();
    reflectionCamera.updateProjectionMatrix();


    // resize render target
    renderTarget.setSize(currWidth, currHeight);
    reflectionRenderTarget.setSize(currWidth, currHeight);


  }
}

const clipPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
function animate() {
  orbCtrls.update();
  stats.update();

  const time = clock.getElapsedTime();

  updateRendererSize();
  updateWaterUniforms(time);
  calculateReflectionCameraPos();

  water.visible = false;
  re.setRenderTarget(renderTarget);
  re.render(scene, camera);

  re.clippingPlanes = [clipPlane];
  poolBig.visible = false;

  re.setRenderTarget(null);
  re.setRenderTarget(reflectionRenderTarget);
  re.render(scene, reflectionCamera);

  re.clippingPlanes = [];
  poolBig.visible = true;
  water.visible = true;
  re.setRenderTarget(null);
  re.render(scene, camera);
  requestAnimationFrame(animate);
};

animate();

window.addEventListener('orientationchange', () => {
  location.reload();
});


