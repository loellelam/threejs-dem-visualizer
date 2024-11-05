import {
  Scene,
  PerspectiveCamera,
  DirectionalLight,
  WebGLRenderer,
  Shape,
  BufferGeometry,
  BufferAttribute,
  PlaneGeometry,
  ExtrudeGeometry,
  GridHelper,
  AxesHelper,
  TextureLoader,
  MeshBasicMaterial,
  MeshLambertMaterial,
  DoubleSide,
  Mesh,
} from 'three'; // import min because three.js is not tree-shakable for now
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import * as Detector from '../js/vendor/Detector';
import * as BufferGeometryUtils from 'three/addons/utils/BufferGeometryUtils.js';
import { STLExporter } from 'three/addons/exporters/STLExporter.js';
// TODO: Major performance problems on reading big images
// import terrain from '../textures/agri-medium-dem.tif';
// import mountainImage from '../textures/agri-medium-autumn.jpg';

// import terrain from '../textures/maui.tif';
// import terrain from '../textures/hawaii.tif';
import terrain from '../textures/bi_dem_250m.tif';
import mountainImage from '../textures/agri-small-autumn.jpg';

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
    this.setupTerrainModel();
    this.setupHelpers();

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

  setupTerrainModel() {
    // Load and create the terrain model
    const readGeoTif = async () => {
      // Read in tif data
      const rawTiff = await GeoTIFF.fromUrl(terrain);
      const tifImage = await rawTiff.getImage();
      const image = {
        width: tifImage.getWidth(),
        height: tifImage.getHeight(),
      };
      const elevation = await tifImage.readRasters({ interleave: true }); // array of z-values (462000 items), the elevation at every pixel
      console.log('elevation', elevation);

      // Create a flat plane of the appropriate width/height
      const geometry = new PlaneGeometry(
        image.width,
        image.height,
        /* The third and fourth parameter are image segments and we are subtracting one from each,
        otherwise our 3D model goes crazy.
        https://github.com/mrdoob/three.js/blob/master/src/geometries/PlaneGeometry.js#L57
        */
        image.width - 1,
        image.height - 1
      );
      console.log('geometry', geometry);
      // Provide elevation values to the PlaneGeometry
      for (let vertex = 0; vertex < geometry.attributes.position.count; vertex++) {
        geometry.attributes.position.setZ(vertex, (elevation[vertex] / 48));
      }

      const formattedPosition = this.formatData(geometry.attributes.position.array, image.width);
      console.log("formatted position array", formattedPosition)

      // this.arrayToImage(image.width, image.height, elevation);

      // Load texture for the terrain
      const texture = new TextureLoader().load(mountainImage);
      const material = new MeshLambertMaterial({
        wireframe: false, // Set to false for solid material
        side: DoubleSide, // Render both sides of the geometry
        map: texture,
      });
      // Create the terrain mesh
      // const mountain = new Mesh(geometry, material);
      // mountain.position.y = 0;
      // mountain.rotation.y = Math.PI;
      // mountain.rotation.x = Math.PI / 2;
      // this.scene.add(mountain); // Add terrain mesh to the scene

      // Create the base shape
      const baseGeometry = this.createBase(formattedPosition, image.height);
      // this.createBaseUsingTriangles(geometry, image.width, image.height, elevation);
      
      const mat = new MeshBasicMaterial( { color: 0x0000ff } );
      const mesh = new Mesh(baseGeometry, mat);
      this.exportSTL(mesh);

      // Combine geometries
      const combinedGeometry = BufferGeometryUtils.mergeBufferGeometries([geometry, baseGeometry], false);
      const combinedMesh = new Mesh(combinedGeometry, material);
      combinedMesh.position.y = 0;
      combinedMesh.rotation.y = Math.PI;
      combinedMesh.rotation.x = Math.PI / 2;
      this.scene.add(combinedMesh);

      // this.exportSTL(combinedMesh);

      // Hide loader element after loading
      const loader = document.getElementById('loader');
      loader.style.opacity = '-1';
      // After a proper animation on opacity, hide element to make canvas clickable again
      setTimeout(() => {
        loader.style.display = 'none';
      }, 1500);
    };

    readGeoTif(); // Execute the async function to load terrain
  }

  // Formats a flat array of coordinates into a structured 2D array.
  formatData(array, width) {
    const formattedData = [];

    // Iterate through the flat array, stepping by the width times three (for x, y, z)
    for (let i = 0; i < array.length; i += width * 3) {
      const row = [];

      // Iterate through the current segment to extract x, y, z points
      for (let j = 0; j < width * 3; j += 3) {
        if (i + j + 2 < array.length) { // Check to avoid out-of-bounds access
          const point = {
            x: array[i + j],
            y: array[i + j + 1],
            z: array[i + j + 2],
          };
          row.push(point);
        }
      }

      formattedData.push(row);
    }

    return formattedData;
  }

  arrayToImage(width, height, arr) {
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    canvas.width = width;
    canvas.height = height;

    const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imgData.data;

    for (var i = 0; i < data.length; i += 4) {
      if (arr[i/4] > -1) {
        data[i] = 255; // set red pixel
        data[i + 3] = 255; // make this pixel opaque
      }      
    }
    ctx.putImageData(imgData, 0, 0);

    const img = new Image();
    img.src = canvas.toDataURL();
    document.body.appendChild(img);

    // turn into svg, then use svg to create base

    // const loader = new SVGLoader();
  }

  /**
   * Creates a 3D base shape by extracting valid z-coordinates from a given position grid.
   * 
   * This function identifies the first and last valid z-coordinates for each row in the 
   * `position` array, which represents a terrain or surface. It constructs a closed shape 
   * outline using these coordinates, forming the left and right halves of the shape. The 
   * outline is then extruded to create a 3D mesh, which is added to the scene.
   */
  createBase(position, height) {
    const lowestElevationCutoff = -1;
    // Find first valid z-coordinate in each row 
    const first = Array(height).fill(lowestElevationCutoff);
    for (let i = 0; i < position.length; i++) {
      for (let j = 0; j < position[i].length; j++) {
        if (position[i][j].z > lowestElevationCutoff) {
          first[i] = j; // Store the column index of the first valid z-coordinate
          break; // Exit inner loop after finding first valid index
        }
      }
    }
    // Find last valid z-coordinate in each row, by iterating in reverse
    const last = Array(height).fill(lowestElevationCutoff);
    for (let i = position.length - 1; i >= 0; i--) {
      for (let j = position[i].length - 1; j >= 0; j--) {
        if (position[i][j].z > lowestElevationCutoff) {
          last[i] = j; // Store the column index of the last valid z-coordinate
          break;
        }
      }
    }

    // Create a shape for the base
    const shape = new Shape();
    const startingPoint = {}; // Store (x,y) coordinate of starting point
    let isSet = false; // Flag to indicate if the starting point has been set

    // Iterate through first array to construct the left half of the shape's outline
    for (let i = 0; i < first.length; i++) {
      const j = first[i];
      if (j > lowestElevationCutoff) { // Ensure index is valid
        if (isSet) {
          // If the starting point is already set, draw a line to the current point
          shape.lineTo(position[i][j].x, position[i][j].y);
        }
        else {
          // Set the starting point for the shape
          startingPoint.x = position[i][j].x;
          startingPoint.y = position[i][j].y;
          shape.moveTo(startingPoint.x, startingPoint.y);
          isSet = true;
        }
      }
    }
    // Iterate through the last array to complete the right half of the shape's outline, starting from the bottom
    for (let i = last.length - 1; i >= 0; i--) {
      const j = last[i];
      if (j > lowestElevationCutoff) {
        shape.lineTo(position[i][j].x, position[i][j].y);
      }
    }

    // Close the shape by drawing a line back to the starting point
    shape.lineTo(startingPoint.x, startingPoint.y);

    // Define extrude settings for the shape
    const extrudeSettings = {
      depth: -16,
      bevelEnabled: false,
    };

    const geometry = new ExtrudeGeometry( shape, extrudeSettings );

    // Create an index for the geometry
    const indexArray = [];
    const positionAttribute = geometry.attributes.position.array;
    const vertexCount = positionAttribute.length / 3; // Each vertex has x, y, z
    for (let i = 0; i < vertexCount; i++) {
        indexArray.push(i);
    }
    geometry.setIndex(indexArray);

    console.log("base geometry", geometry);
    return geometry;
    // const material = new MeshBasicMaterial( { color: 0x0000ff } );
    // const mesh = new Mesh(geometry, material);
    // mesh.position.y = 0;
    // mesh.rotation.y = Math.PI;
    // mesh.rotation.x = Math.PI / 2;
    // this.scene.add(mesh);
  }

  // DISCARD THIS FUNCTION: this function does not work
  createBaseUsingTriangles(geometry, width, height, elevation) {
    // Extract vertex positions from the terrain geometry
    const positions = geometry.attributes.position.array;
    const baseVertices = [];
    const indices = [];
    let minElevation = Number.MAX_VALUE;

    // Find min elevation
    for (const z of elevation) {
      if (z > -1 && z < minElevation) {
        minElevation = z;
      }
    }

    // Loop through the vertices to get x, y coordinates and build base vertices
    for (let i = 0; i < positions.length; i += 3) {
      const x = positions[i];     // x-coordinate
      const y = positions[i + 1]; // y-coordinate
      
      // Create the base vertices at the minimum elevation
      baseVertices.push(x, y, minElevation);

      // Create indices for the triangles (two for each quad)
      if (i > 0 && (i / 3) % width !== 0) {
        const a = (i / 3); // Current vertex
        const b = a - width; // Vertex above
        const c = a - 1; // Vertex to the left
        const d = b - 1; // Vertex above left

        // Two triangles for each quad
        indices.push(a, b, d);
        indices.push(a, d, c);
      }
    }

    // Create geometry for the base using the extracted vertices
    const baseGeometry = new BufferGeometry();
    const basePositions = new Float32Array(baseVertices);
    const baseIndices = new Uint16Array(indices);
    
    // Add positions to the geometry
    baseGeometry.setAttribute('position', new BufferAttribute(basePositions, 3));
    baseGeometry.setIndex(new BufferAttribute(baseIndices, 1));

    // Create a material for the base
    // const baseMaterial = new MeshBasicMaterial( { color: 0xff0000 } );

    const baseMaterial = new MeshLambertMaterial({
      color: 0xff0000,
      side: DoubleSide, // Render both sides
      opacity: 1,
      transparent: false,
    });

    // Create the base mesh and add it to the scene
    const baseMesh = new Mesh(baseGeometry, baseMaterial);
    this.scene.add(baseMesh);
  }

  exportSTL(mesh) {
    const exporter = new STLExporter();
    const options = { binary: false }

    // Parse the input and generate the STL encoded output
    const str = exporter.parse( mesh, options );
    var blob = new Blob( [str], { type : 'text/plain' } ); // Generate Blob from the string
    
    // Save blob as a file
    var link = document.createElement('a');
    link.style.display = 'none';
    document.body.appendChild(link);
    link.href = URL.createObjectURL(blob);
    link.download = 'Scene.stl';
    link.click();
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
