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
  }

};

const waterPlaneGeo = new THREE.PlaneGeometry(20, 20);
const waterMaterial = new THREE.ShaderMaterial();
waterMaterial.uniforms = waterUniformData;
waterMaterial.vertexShader = `
varying vec2 vUv;

  void main(){

    vUv = uv;

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
uniform sampler2D uDepthTexture;
uniform float uDistortFreq;
uniform float uDistortAmp;

uniform mat4 uInverseProjectionMatrix;
uniform mat4 uWorldMatrix;

uniform float uMaxDepth;
uniform vec3 uColor1;
uniform vec3 uColor2;

uniform sampler2D uReflectionTexture;
uniform bool uPlanarReflection;
uniform float uFresnelFactor;

uniform float uFoamDepth;
uniform sampler2D uFoamTexture;
uniform vec3 uFoamColor;
uniform bool uSolidFoamColor;

uniform sampler2D uNormalTexture;
uniform bool uSpecularReflection;

varying vec2 vUv;


  ${perlinNoise}

  void main(){

    // scene below the water surface
    vec2 sceneCoord = gl_FragCoord.xy / uWindowSize;
    vec2 reflectionCoord = vec2(1.0 - sceneCoord.x , sceneCoord.y);

    float offsetX = cnoise(sceneCoord*uDistortFreq+uTime)*uDistortAmp;
    float offsetY = cnoise(sceneCoord*uDistortFreq+uTime)*uDistortAmp;

    vec2 distortedCoord = vec2(sceneCoord.x+offsetX, sceneCoord.y+offsetY);
    vec2 distortedReflectionCoord = vec2(reflectionCoord.x+offsetX, reflectionCoord.y+offsetY);

    vec4 sceneBeneath = texture2D(uSceneTexture,distortedCoord);
    vec4 reflection = texture2D(uReflectionTexture,distortedReflectionCoord);

    float waterLevel = 0.0;
    float depth = texture2D(uDepthTexture,sceneCoord).r;
    
    vec4 normalizedCoords = vec4(sceneCoord*2.0-1.0,depth*2.0-1.0,1.0);
    vec4 viewPos = uInverseProjectionMatrix * normalizedCoords;
    vec4 worldPos = uWorldMatrix * viewPos;
    viewPos /= viewPos.w;
    worldPos /= worldPos.w; 
    
    float heightDiff = 1.0 - clamp((waterLevel - worldPos.y)/uMaxDepth,0.0,1.0);
    vec3 depthColor = mix(uColor1,uColor2,heightDiff);

    float foam = 1.0 - clamp ((waterLevel - worldPos.y)/uFoamDepth,0.0,1.0);
    float foamSpeed = 0.01;
    vec2 foamUV = vec2(vUv.x + uTime* foamSpeed , vUv.y + uTime*foamSpeed);
    float foamDensity = step(1.0 - foam,texture2D(uFoamTexture,foamUV * 5.0).r);

    vec3 normal = vec3(0.0,1.0,0.0);
    vec3 viewDir = normalize(cameraPosition - worldPos.xyz);
    float fresnel = pow(dot(viewDir,normal),uFresnelFactor);

    // for specular reflection
	vec2 normalUV1 = vec2(vUv.x*1.0+offsetX+0.5 , vUv.y*1.0+offsetY+0.2) * 2.0 -1.0;
	vec2 normalUV2 = vec2(vUv.x*1.0-offsetX+0.1 , vUv.y*1.0-offsetY+0.8) * 2.0 - 1.0;
    vec3 normalTxt1 = texture2D(uNormalTexture,normalUV1).rgb;
    vec3 normalTxt2 = texture2D(uNormalTexture,normalUV2).rgb;

    vec3 mixedNormals = mix(normalTxt1 , normalTxt2,0.8);

    vec3 lightPos = normalize(vec3(1.0,18.0,-1.0));
    vec3 reflected = normalize(reflect(lightPos,mixedNormals));
    vec3 specularColor = vec3(1.0);
    
    float specular = pow(dot(viewDir,reflected),78.0) * (1.0 - fresnel);


    vec3 color = vec3(1.0);

    //color = sceneBeneath.rgb; 
    //color = vec3(heightDiff);
    //color = depthColor;
    //color = mix(sceneBeneath.rgb + uColor1*(1.0 - heightDiff) , sceneBeneath.rgb*0.2 + uColor2,1.0 - heightDiff);
    //color = reflection.rgb;
    //color = vec3(fresnel);
    //color = vec3(foam);
    color = mix(sceneBeneath.rgb * 0.8 + uColor1 , sceneBeneath.rgb*0.2 + uColor2,1.0 - heightDiff);

    if(uSpecularReflection){
      color = color + (specular * specularColor);
    }

    if(uPlanarReflection){
      color = mix(color,reflection.rgb*1.2,1.0 - fresnel);
    }

    if(foamDensity > 0.0)
    if(uSolidFoamColor){
      color = uFoamColor  + color;
    }else{
      color = uFoamColor * (foam) + color;
    }

    gl_FragColor = vec4(color,1.0);
  }
`;

const water = new THREE.Mesh(waterPlaneGeo, waterMaterial);
water.rotateX(Math.PI * -0.5);
scene.add(water);


const gui = new GUI();

const visibilityFolder = gui.addFolder('Mesh');

visibilityFolder.addColor(meshMaterial, "color");
visibilityFolder.add(poolBig, 'visible').onChange((val: boolean) => {
  poolBig.visible = val;
}).name("Pool Big");

const distortionFolder = gui.addFolder("Surface Distortion");
distortionFolder.add(waterUniformData.uDistortFreq, "value", 0, 50, 0.1).name('Frequency');
distortionFolder.add(waterUniformData.uDistortAmp, "value", 0.001, 0.01, 0.001).name('Amplitude');

const depthFolder = gui.addFolder("Depth");
depthFolder.add(waterUniformData.uMaxDepth, "value", 0, 20, 0.01).name('Max Depth');
depthFolder.add(waterUniformData.uFoamDepth, "value", 0, 5, 0.001).name('Foam Depth');
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


