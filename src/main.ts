import './style.css'
import * as THREE from 'three';
import GUI from 'lil-gui';

import Stats from 'three/examples/jsm/libs/stats.module.js';
import { GLTFLoader, OrbitControls, RGBELoader } from 'three/examples/jsm/Addons.js';

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
    console.log(obj.name);
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


function updateRendererSize() {

  const currWidth = cnvs.clientWidth;
  const currHeight = cnvs.clientHeight;

  if (currWidth != w || currHeight != h) {
    re.setSize(currWidth, currHeight, false);
    camera.aspect = currWidth / currHeight;
    camera.updateProjectionMatrix();
  }


}

const waterPlaneGeo = new THREE.PlaneGeometry(20, 20);
const waterMaterial = new THREE.ShaderMaterial();
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


function animate() {
  orbCtrls.update();
  stats.update();

  updateRendererSize();

  const time = clock.getElapsedTime();


  re.render(scene, camera);
  requestAnimationFrame(animate);
};

animate();

window.addEventListener('orientationchange', () => {
  location.reload();
});


