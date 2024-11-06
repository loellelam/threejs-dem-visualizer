import {
  PlaneGeometry,
  Shape,
  ExtrudeGeometry,
  TextureLoader,
  MeshBasicMaterial,
  MeshLambertMaterial,
  DoubleSide,
  Mesh,
} from 'three'; // import min because three.js is not tree-shakable for now
import * as BufferGeometryUtils from 'three/addons/utils/BufferGeometryUtils.js';
import { STLExporter } from 'three/addons/exporters/STLExporter.js';

import terrain from '../assets/bi_dem_250m.tif';
import mountainImage from '../assets/agri-small-autumn.jpg';

export default class DEM {
  constructor(scene) {
    this.scene = scene;  // Store the scene reference
    this.createDEM(); // Create the digital elevation model and export it
  }

  // Create the digital elevation model
  async createDEM() {
    // Load the GeoTIFF file
    const tifImage = await this.loadTiff();

    // Retrieve geotiff information
    const image = {
      width: tifImage.getWidth(),
      height: tifImage.getHeight(),
    };
    const elevation = await tifImage.readRasters({ interleave: true }); // array of z-values (462000 items), the elevation at every pixel
    console.log('Elevation', elevation);
    
    // Generate surface geometry 
    const surfaceGeometry = this.createSurface(image, elevation);

    // Format the position data for readability
    const formattedPosition = this.formatData(surfaceGeometry.attributes.position.array, image.width);
    console.log("Formatted position array", formattedPosition);
    
    // Create the base geometry
    const baseGeometry = this.createBase(formattedPosition, image.height);

    // Merge the surface and base geometries into a single mesh
    const mergedMesh = this.mergeGeometries(surfaceGeometry, baseGeometry);
    
    // Export the merged geometry as an STL file for 3D printing
    this.exportSTL(mergedMesh);
  
    // Hide loader element after loading
    const loader = document.getElementById('loader');
    loader.style.opacity = '-1';
    // After a proper animation on opacity, hide element to make canvas clickable again
    setTimeout(() => {
      loader.style.display = 'none';
    }, 1500);
  }

  // Load the GeoTiff file
  async loadTiff() {
    // Read in tif data
    const rawTiff = await GeoTIFF.fromUrl(terrain);
    const tifImage = await rawTiff.getImage();
    return tifImage;
  }

  // Generate surface geometry based on the image dimensions and elevation data
  createSurface(image, elevation) {
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
    console.log('Surface Geometry', geometry);
    // Provide elevation values to the PlaneGeometry
    for (let vertex = 0; vertex < geometry.attributes.position.count; vertex++) {
      geometry.attributes.position.setZ(vertex, (elevation[vertex] / 48));
    }

    // Load texture for the terrain
    const texture = new TextureLoader().load(mountainImage);
    const material = new MeshLambertMaterial({
      wireframe: false, // Set to false for solid material
      side: DoubleSide, // Render both sides of the geometry
      map: texture,
    });
    // Create the terrain mesh
    const mountain = new Mesh(geometry, material);
    mountain.position.y = 0;
    mountain.rotation.y = Math.PI;
    mountain.rotation.x = Math.PI / 2;
    this.scene.add(mountain); // Add terrain mesh to the scene

    return geometry;
  }

  // Helper: Formats a flat array of coordinates into a structured 2D array.
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

  // currently unused function
  //usage: this.arrayToImage(image.width, image.height, elevation);
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

    console.log("Base Geometry", geometry);

    // Add base geometry mesh to scene
    const material = new MeshBasicMaterial( { color: 0x0000ff } );
    const mesh = new Mesh(geometry, material);
    mesh.position.y = 0;
    mesh.rotation.y = Math.PI;
    mesh.rotation.x = Math.PI / 2;
    this.scene.add(mesh);

    return geometry;
  }

  // Merge the surface and base geometries into a single mesh
  mergeGeometries(surfaceGeometry, baseGeometry) {
    const combinedGeometry = BufferGeometryUtils.mergeBufferGeometries([surfaceGeometry, baseGeometry], false);
    // Define material
    const texture = new TextureLoader().load(mountainImage);
    const material = new MeshLambertMaterial({
      wireframe: false, // Set to false for solid material
      side: DoubleSide, // Render both sides of the geometry
      map: texture,
    });

    const combinedMesh = new Mesh(combinedGeometry, material);
    combinedMesh.position.y = 0;
    combinedMesh.rotation.y = Math.PI;
    combinedMesh.rotation.x = Math.PI / 2;
    this.scene.add(combinedMesh);

    return combinedMesh;
  }

  // Export the merged geometry as an STL file for 3D printing or external use
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
}
