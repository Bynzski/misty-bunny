/**
 * engine.js — renderer, camera, sky, the light rig, and the post chain.
 *
 * The look is a night interior: a cold shaft from an oculus, a warm glow off
 * the brass, and a hand lantern. That only works if the ambient term is kept
 * genuinely low. An ambient light bright enough to "see by" flattens every
 * surface in the level at once — it lifts the shadowed side of a block to the
 * same value as the lit side, and no amount of normal mapping will bring the
 * relief back. So: little ambient, one real key light per room, and a
 * ground-truth occlusion pass to seat everything in its corners.
 */
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/examples/jsm/postprocessing/GTAOPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';

/**
 * Final grade: contrast, chromatic aberration that only shows at the corners,
 * and a little film grain so that the large dark areas are not perfectly flat.
 */
const GradeShader = {
  uniforms: {
    tDiffuse: { value: null },
    uTime: { value: 0 },
    uAberration: { value: 0.0022 },
    uGrain: { value: 0.014 },
    uContrast: { value: 1.06 },
    uLift: { value: 0.006 },
  },
  vertexShader: /* glsl */`
    varying vec2 vUv;
    void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse;
    uniform float uTime, uAberration, uGrain, uContrast, uLift;
    varying vec2 vUv;

    float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }

    void main(){
      vec2 d = vUv - 0.5;
      float r2 = dot(d, d);

      // lens colour separation, scaled by distance from the optical centre
      vec2 off = d * r2 * uAberration;
      vec3 c;
      c.r = texture2D(tDiffuse, vUv + off).r;
      c.g = texture2D(tDiffuse, vUv).g;
      c.b = texture2D(tDiffuse, vUv - off).b;

      // contrast about mid grey, then a tiny lift so blacks are not dead
      c = (c - 0.5) * uContrast + 0.5 + uLift;

      // grain, weighted toward the shadows where banding would show
      float g = hash(vUv * 1024.0 + fract(uTime) * 91.7) - 0.5;
      c += g * uGrain * (1.0 - smoothstep(0.0, 0.55, dot(c, vec3(0.333))));

      gl_FragColor = vec4(c, 1.0);
    }`,
};

export function createEngine(canvas, { post = true } = {}) {
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    powerPreference: 'high-performance',
    stencil: false,
  });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setSize(innerWidth, innerHeight);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x080d13, 0.021);

  const camera = new THREE.PerspectiveCamera(66, innerWidth / innerHeight, 0.04, 400);
  camera.rotation.order = 'YXZ';
  scene.add(camera);

  /* ---------- environment (so brass has something to reflect) ---------- */
  const pmrem = new THREE.PMREMGenerator(renderer);
  pmrem.compileEquirectangularShader();
  const envCanvas = document.createElement('canvas');
  envCanvas.width = 128; envCanvas.height = 64;
  {
    const x = envCanvas.getContext('2d');
    const g = x.createLinearGradient(0, 0, 0, 64);
    g.addColorStop(0.00, '#2b4a68');   // sky above
    g.addColorStop(0.38, '#16222e');
    g.addColorStop(0.52, '#0b1016');
    g.addColorStop(0.72, '#080b0f');
    g.addColorStop(1.00, '#04070a');
    x.fillStyle = g; x.fillRect(0, 0, 128, 64);
    // a soft moon smear so metals get a highlight to catch
    const m = x.createRadialGradient(96, 14, 0, 96, 14, 26);
    m.addColorStop(0, 'rgba(200,222,245,.85)');
    m.addColorStop(1, 'rgba(200,222,245,0)');
    x.fillStyle = m; x.fillRect(70, 0, 52, 40);
  }
  const envTex = new THREE.CanvasTexture(envCanvas);
  envTex.mapping = THREE.EquirectangularReflectionMapping;
  envTex.colorSpace = THREE.SRGBColorSpace;
  const envRT = pmrem.fromEquirectangular(envTex);
  scene.environment = envRT.texture;
  // Reflections, not fill light. High values here put the flatness straight
  // back by lighting every up-facing surface in the level.
  scene.environmentIntensity = 0.38;
  envTex.dispose();
  pmrem.dispose();

  /* ---------- sky dome, stars, moon ---------- */
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      top: { value: new THREE.Color(0x0a1526) },
      mid: { value: new THREE.Color(0x0a1019) },
      bot: { value: new THREE.Color(0x04070b) },
    },
    vertexShader: `varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0);} `,
    fragmentShader: `
      varying vec3 vP; uniform vec3 top; uniform vec3 mid; uniform vec3 bot;
      void main(){
        float h = normalize(vP).y;
        vec3 c = mix(bot, mid, smoothstep(-0.55, 0.06, h));
        c = mix(c, top, smoothstep(0.05, 0.75, h));
        // a faint band of milky way
        float band = exp(-pow((normalize(vP).y*1.9 + normalize(vP).x*0.8 + 0.12), 2.0)*9.0);
        c += vec3(0.030,0.034,0.052) * band;
        gl_FragColor = vec4(c, 1.0);
      }`,
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(220, 24, 16), skyMat);
  sky.frustumCulled = false;
  scene.add(sky);

  const stars = buildStars();
  scene.add(stars);

  const moon = buildMoon();
  moon.position.set(-78, 96, -120);
  scene.add(moon);

  /* ---------- global light rig ---------- */
  const lights = {};
  // Just enough to keep unlit faces from being pure void — the GTAO and the
  // hemisphere below do the rest.
  lights.ambient = new THREE.AmbientLight(0x2b4257, 0.10);
  scene.add(lights.ambient);

  const bounce = new THREE.HemisphereLight(0x3d5c7e, 0x171310, 0.16);
  scene.add(bounce);

  // a cold shaft from the antechamber oculus
  lights.antechamber = new THREE.SpotLight(0xc3dcf2, 95, 26, 0.8, 0.9, 1.5);
  lights.antechamber.position.set(0.6, 7.4, -1.2);
  lights.antechamber.target.position.set(0.2, 0, -0.6);
  lights.antechamber.castShadow = true;
  lights.antechamber.shadow.mapSize.set(2048, 2048);
  lights.antechamber.shadow.bias = -0.0012;
  lights.antechamber.shadow.camera.near = 0.5;
  lights.antechamber.shadow.camera.far = 24;
  scene.add(lights.antechamber, lights.antechamber.target);

  // gallery: a warm brass glow from the orrery
  lights.gallery = new THREE.PointLight(0xffb257, 30, 24, 1.8);
  lights.gallery.position.set(0, 7.4, -38);
  scene.add(lights.gallery);

  // A vault 9 m overhead receives almost nothing from a lamp at floor level,
  // and an unlit vault reads as missing geometry rather than as a ceiling.
  // This is the orrery's own light bouncing up off the brass — it lights the
  // crown, gives the dome gradient its shape, and puts the lamp's warmth into
  // the ceiling instead of leaving it flat black.
  lights.galleryHigh = new THREE.PointLight(0xffa94a, 30, 17, 1.9);
  lights.galleryHigh.position.set(0, 12.2, -42.0);
  scene.add(lights.galleryHigh);

  // dome: the beam through the oculus
  lights.dome = new THREE.SpotLight(0xd6e7ff, 190, 44, 0.44, 0.7, 1.2);
  lights.dome.position.set(0, 17.5, -60.5);
  lights.dome.target.position.set(0, 6, -60.5);
  lights.dome.castShadow = true;
  lights.dome.shadow.mapSize.set(2048, 2048);
  lights.dome.shadow.bias = -0.0014;
  lights.dome.shadow.camera.near = 1;
  lights.dome.shadow.camera.far = 40;
  scene.add(lights.dome, lights.dome.target);

  // a low warm fill under the stair so the gallery is not a black hole
  lights.stairFill = new THREE.PointLight(0xffc487, 9, 16, 1.9);
  lights.stairFill.position.set(0, 2.2, -31);
  scene.add(lights.stairFill);

  // The dome is the largest volume in the level and the furthest from any
  // window; without these the oculus reads as a spotlight in an otherwise
  // empty void and you cannot see the room you are meant to be solving.
  // The dome is the biggest volume in the level and the furthest from any
  // window. It gets a ring of small fills near the floor rather than one
  // strong lamp: a single point source close to a wall throws a hard pool
  // with a black room behind it, which reads as a void rather than a room.
  // Low, weak and numerous is what makes a large dark space legible.
  lights.domeRim = [];
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2 + 0.4;
    const l = new THREE.PointLight(0x7d9bc4, 4.5, 16, 1.7);
    l.position.set(Math.cos(a) * 6.4, 7.2, -65.5 + Math.sin(a) * 6.4);
    scene.add(l);
    lights.domeRim.push(l);
  }

  // one warm lamp in the instrument well, so the dome has a warm centre
  // against all that moonlight
  lights.vaultFill = new THREE.PointLight(0xffb060, 11, 13, 1.9);
  lights.vaultFill.position.set(0, 7.6, -62.2);
  scene.add(lights.vaultFill);

  // the hand lantern rides on the camera
  lights.lantern = new THREE.PointLight(0xffbe74, 0, 17, 1.55);
  lights.lantern.castShadow = true;
  lights.lantern.shadow.mapSize.set(1024, 1024);
  lights.lantern.shadow.bias = -0.004;
  lights.lantern.shadow.camera.near = 0.15;
  lights.lantern.shadow.camera.far = 12;
  camera.add(lights.lantern);
  scene.add(camera);

  /* ---------- post chain ---------- */
  let composer = null;
  let grade = null;
  let gtao = null;

  if (post) {
    composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));

    // Ground-truth ambient occlusion. This is what puts a hard dark line in
    // every mortar joint and under every stair tread; without it the eye reads
    // the flat lighting as flat geometry.
    gtao = new GTAOPass(scene, camera, innerWidth, innerHeight);
    gtao.output = GTAOPass.OUTPUT.Default;
    gtao.blendIntensity = 0.85;
    gtao.updateGtaoMaterial({
      radius: 0.55,          // metres — how far a corner casts contact shade
      distanceExponent: 1.4,
      thickness: 0.6,
      scale: 1.0,
      samples: 16,
      screenSpaceRadius: false,
    });
    gtao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 4, rings: 2, samples: 16 });
    // GTAO renders its depth and normal buffers by overriding the scene
    // material, and that override defaults to FrontSide. Every surface in the
    // level built as a back face — both masonry vaults, and the sky — is then
    // missing from the buffer entirely, and GTAO treats "nothing here" as
    // "fully occluded" and paints it black. DoubleSide puts them back.
    gtao.normalMaterial.side = THREE.DoubleSide;
    composer.addPass(gtao);

    const bloom = new UnrealBloomPass(
      new THREE.Vector2(innerWidth, innerHeight), 0.26, 0.62, 0.95,
    );
    composer.addPass(bloom);

    // Tone map first, grade last. Everything in GradeShader is display
    // referred — a contrast curve pivoted on mid grey, film grain and lens
    // dispersion all assume 0..1 perceptual values. Running it on the linear
    // buffer instead subtracts a constant from every channel and clips every
    // shadow to pure black, which is what was happening to both masonry
    // vaults.
    composer.addPass(new OutputPass());

    grade = new ShaderPass(GradeShader);
    composer.addPass(grade);
  }

  /* ---------- vignette / flash ---------- */
  const vignette = document.createElement('div');
  vignette.id = 'vignette';
  vignette.style.cssText = `
    position:fixed; inset:0; z-index:15; pointer-events:none;
    background:
      radial-gradient(ellipse 78% 68% at 50% 50%, rgba(0,0,0,0) 42%, rgba(0,0,0,.34) 74%, rgba(0,0,0,.72) 100%);
    mix-blend-mode:multiply; opacity:0; transition:opacity 1.2s ease;`;
  document.body.appendChild(vignette);

  const flash = document.createElement('div');
  flash.id = 'flash';
  flash.style.cssText = `
    position:fixed; inset:0; z-index:30; pointer-events:none; opacity:0;
    background:radial-gradient(ellipse at 50% 45%, #fff 0%, #cfe2ff 40%, rgba(0,0,0,0) 78%);`;
  document.body.appendChild(flash);

  function resize() {
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight);
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    if (composer) {
      composer.setSize(innerWidth, innerHeight);
      composer.setPixelRatio(Math.min(devicePixelRatio, 2));
    }
  }
  addEventListener('resize', resize);

  let clock = 0;
  function render(dt) {
    if (!composer) { renderer.render(scene, camera); return; }
    clock += dt;
    grade.uniforms.uTime.value = clock;
    composer.render(dt);
  }

  /**
   * Total triangles in the graph. `renderer.info.render.triangles` is no use
   * for this once post-processing is on — it reports the last fullscreen quad,
   * not the level — and it is the number you actually want when asking "how
   * much level is there".
   */
  function countTriangles() {
    let tris = 0;
    scene.traverse((o) => {
      if (!o.geometry) return;
      const g = o.geometry;
      tris += (g.index ? g.index.count : (g.attributes.position ? g.attributes.position.count : 0)) / 3;
    });
    return Math.round(tris);
  }

  return {
    renderer, scene, camera, lights, sky, stars, moon, envRT,
    vignette, flash, resize, render, composer, countTriangles,
  };
}

function buildStars() {
  const N = 2600;
  const pos = new Float32Array(N * 3);
  const col = new Float32Array(N * 3);
  const siz = new Float32Array(N);
  const R = 190;
  for (let i = 0; i < N; i++) {
    // bias upward so stars are thickest overhead
    const u = Math.random(), v = Math.random() * 0.92 + 0.06;
    const theta = 2 * Math.PI * u;
    const phi = Math.acos(1 - 2 * v * 0.86);
    const x = Math.sin(phi) * Math.cos(theta);
    const y = Math.cos(phi);
    const z = Math.sin(phi) * Math.sin(theta);
    pos[i * 3] = x * R; pos[i * 3 + 1] = Math.max(y, -0.2) * R; pos[i * 3 + 2] = z * R;
    const warm = Math.random();
    const b = 0.35 + Math.pow(Math.random(), 2.6) * 0.85;
    col[i * 3] = b * (0.82 + warm * 0.18);
    col[i * 3 + 1] = b * 0.92;
    col[i * 3 + 2] = b * (1.0 - warm * 0.12);
    siz[i] = 0.7 + Math.pow(Math.random(), 3) * 3.4;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setAttribute('aSize', new THREE.BufferAttribute(siz, 1));

  const m = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, fog: false,
    blending: THREE.AdditiveBlending,
    uniforms: { uTime: { value: 0 } },
    vertexShader: `
      attribute float aSize; varying vec3 vC; varying float vTw; uniform float uTime;
      void main(){
        vC = color;
        vTw = 0.72 + 0.28*sin(uTime*1.6 + position.x*0.3 + position.z*0.21);
        vec4 mv = modelViewMatrix * vec4(position,1.0);
        gl_PointSize = aSize * (260.0 / -mv.z);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `
      varying vec3 vC; varying float vTw;
      void main(){
        vec2 d = gl_PointCoord - 0.5;
        float a = smoothstep(0.5, 0.03, length(d));
        gl_FragColor = vec4(vC * vTw, a);
      }`,
  });
  m.vertexColors = true;
  const p = new THREE.Points(g, m);
  p.frustumCulled = false;
  p.renderOrder = -1;
  return p;
}

function buildMoon() {
  const g = new THREE.Group();
  const disc = new THREE.Mesh(new THREE.CircleGeometry(5.4, 48), new THREE.MeshBasicMaterial({
    color: 0xe8f0fb, fog: false, transparent: true, opacity: 0.97,
  }));
  g.add(disc);
  const halo = new THREE.Mesh(new THREE.CircleGeometry(16, 48), new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, fog: false, blending: THREE.AdditiveBlending,
    vertexShader: 'varying vec2 vU; void main(){ vU = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
    fragmentShader: 'varying vec2 vU; void main(){ float d = length(vU-0.5)*2.0; float a = pow(max(0.0,1.0-d),3.2)*0.55; gl_FragColor = vec4(0.72,0.82,1.0,a);}',
  }));
  halo.position.z = -0.2;
  g.add(halo);
  g.lookAt(0, 6, -60);
  return g;
}