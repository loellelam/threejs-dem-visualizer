import {
  Scene,
  PerspectiveCamera,
  DirectionalLight,
  WebGLRenderer,
  GridHelper,
  AxesHelper,
} from 'three'; // import min because three.js is not tree-shakable for now
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import * as Detector from '../js/vendor/Detector';

import DEM from './DEM.js';

require('../sass/home.sass');

class Application {
  constructor(opts = {}) {
    this.width = window.innerWidth;
    this.height = window.innerHeight;

    // Create or use a provided container for the canvas
    if (opts.container) {
      this.container = opts.container;
    } else {
      const div = Application.createContainer();
      document.body.appendChild(div);
      this.container = div;
    }

    // Check for WebGL support
    if (Detector.webgl) {
      this.init(); // Initialize the application
      this.render(); // Start the rendering loop
    } else {
      // TODO: style warning message
      console.log('WebGL NOT supported in your browser!');
      const warning = Detector.getWebGLErrorMessage();
      this.container.appendChild(warning);
    }
  }

  init() {
    this.scene = new Scene();
    this.setupRenderer();
    this.setupCamera();
    this.setupControls();
    this.setupLight();
    this.setupHelpers();

    new DEM(this.scene);

    // Handle window resize
    window.addEventListener('resize', () => {
      const w = window.innerWidth;
      const h = window.innerHeight;
      this.renderer.setSize(w, h);
      this.camera.aspect = w / h;
      this.camera.updateProjectionMatrix();
    });
  }

  render() {
    this.controls.update();
    this.renderer.render(this.scene, this.camera); // Render the scene from the camera's perspective

    // when render is invoked via requestAnimationFrame(this.render) there is
    // no 'this', so either we bind it explicitly or use an es6 arrow function.
    // requestAnimationFrame(this.render.bind(this));
    requestAnimationFrame(() => this.render());
  }

  static createContainer() {
    // Create a container for the canvas
    const div = document.createElement('div');
    div.setAttribute('id', 'canvas-container');
    div.setAttribute('class', 'container');
    return div;
  }

  setupRenderer() {
    // Initialize the WebGL renderer
    this.renderer = new WebGLRenderer({ antialias: true });
    this.renderer.setClearColor(0xd3d3d3); // it's a dark gray
    this.renderer.setPixelRatio(window.devicePixelRatio || 1);
    this.renderer.setSize(this.width, this.height);
    this.renderer.shadowMap.enabled = true;
    this.container.appendChild(this.renderer.domElement);
  }

  setupCamera() {
    // Configure the perspective camera
    const fov = 75;
    const aspect = this.width / this.height;
    const near = 0.1;
    const far = 10000;
    this.camera = new PerspectiveCamera(fov, aspect, near, far);
    this.camera.position.set(1000, 1000, 1000);
    this.camera.lookAt(this.scene.position); // Look at the scene's origin
  }

  setupControls() {
    // Set up camera controls for user interaction
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enabled = true;
    this.controls.maxDistance = 1500; // Max zoom distance
    this.controls.minDistance = 0; // Min zoom distance
    this.controls.autoRotate = false;
  }

  setupLight() {
    // Set up directional lighting
    this.light = new DirectionalLight(0xffffff);
    this.light.position.set(500, 1000, 250);
    this.scene.add(this.light);
    // this.scene.add(new AmbientLight(0xeeeeee));
  }

  setupHelpers() {
    // Create and add grid and axis helpers to the scene
    const gridHelper = new GridHelper(1000, 40);
    this.scene.add(gridHelper);
    console.log('The X axis is red. The Y axis is green. The Z axis is blue.');
    const axesHelper = new AxesHelper(500);
    this.scene.add(axesHelper);
  }
}

// Immediately invoke the application
(() => {
  const app = new Application({
    container: document.getElementById('canvas-container'),
  });
  // console.log(app);
})();
