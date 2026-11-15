# Making custom 3D designs and textures for walk mode

*Agent draft, 2026-11-15. Applies to Role 1 (World). The model loader in
section 6 is not built yet.*

## 0. The rule that limits your sources

`docs/roles/world.md` (D9) says every model and texture must be procedural or
team-made, with no AI-generated assets. In practice:

- **Not allowed:** AI generators (text-to-3D, image-to-3D, AI texture tools),
  and AI features inside normal tools, such as generative fill or AI
  upscaling.
- **Probably not allowed:** downloaded libraries, even free CC0 ones like
  Poly Haven or Kenney, because they aren't team-made. Ask the team before
  using any.
- **Allowed:** shapes you model by hand, textures you paint, and procedural
  textures from node graphs or code.

## 1. The pipeline

Design (sketch, palette, budget) → model in Blender → colour or texture →
export `.glb` → load in `flora.ts` / `fauna.ts` → check (`P` readout, tests,
the toggle check).

## 2. Design first, on paper

- **Each class needs its own silhouette.** Walk mode shows the predicted cover
  class through the plant's shape. The seven slots are listed in
  `apps/web/src/lib/world/vegetation.ts` `SPECIES`:

  | Class | Slot |
  | --- | --- |
  | Spruce/Fir | spire |
  | Lodgepole Pine | pole |
  | Ponderosa Pine | broadPine |
  | Cottonwood/Willow | roundCrown |
  | Aspen | slender |
  | Douglas-fir | fullCone |
  | Krummholz | shrub |

  A good test: shrink each to a 32 px black shape. If you can't tell all
  seven apart, redesign.
- **Colours come from the code, not the model.** The crown colour comes from
  `apps/web/src/lib/world/palette.ts` `classTints` at runtime. Bark uses
  `trunk`, `trunkPale` and `trunkRuddy`. Design crowns in neutral light grey;
  the code tints them.
- **Triangle budget:** about 11,500 plants on medium and 19,000 on high.

  | Asset | Budget |
  | --- | --- |
  | Tree or shrub | 20–60 triangles (today's are about 30–50) |
  | Grass tuft | about 3–6 triangles |
  | Animal | up to about 200 triangles (there are only a few hundred) |

  A 300-triangle tree would mean about 5 million triangles on high, which a
  weak laptop can't draw at 30 fps.

## 3. Modelling in Blender

- **Units:** 1 Blender unit is one map cell (30 m). Trees are about 1–1.4
  units tall, shrubs about 0.3, animals about 0.5 long.
- **Origin:** at the base, on the ground (Z = 0 in Blender). The code puts
  that point on the terrain and sinks it 0.04 × scale.
- **Facing:** animals face +X in Blender. The glTF exporter turns Blender's
  Z-up into Y-up and keeps X, so +X stays +X.
- **Before export:** apply all transforms (Ctrl+A → All Transforms) and
  modifiers, and set the mesh to Shade Flat. The scene uses flat shading, so
  smooth normals are wasted.
- **Name materials by role**, because the loader will use the name to decide
  what takes the class tint:
  - `crown*`: tinted with the class colour; low-trust plants turn grey
    through this tint;
  - `trunk*`, `bark*`: keep their own colour.
- **Variety:** the code already gives each plant a random rotation and a scale
  within the class's min/max. One model per class is enough. If you want two
  or three variants, model them, but each extra variant adds draw calls (one
  instanced mesh per chunk, class and variant).

## 4. Colouring and texturing: three levels

### A. Vertex colours, no texture (recommended)

This is what the code does now, so it's the cheapest and the safest.

- In Blender, add a Color Attribute (Face Corner, Byte), then use Vertex
  Paint, or paint faces with a flat colour.
- It exports as glTF `COLOR_0`, and the existing `color` attribute takes it
  directly.
- **Shading tricks that need no texture:**
  - darker lower crowns (what `shadeBottom` does in code today);
  - a lighter tip;
  - a slightly different colour per tier.
- **Costs nothing:** no texture memory, no UVs, and the 5-toggle cleanup check
  stays at 3 textures.

### B. A palette atlas: one small shared texture

Use this when you want more colour detail per model than vertex colours give.

- Make a 64–256 px image with a grid of flat colour swatches and gradient
  strips. Paint it yourself in Krita or GIMP, or bake it from Blender nodes.
- UV-map each face onto a swatch. All plants share this one texture, so there
  is still one material and instancing still works.
- **In three.js:**
  - `texture.colorSpace = THREE.SRGBColorSpace`;
  - `magFilter = THREE.NearestFilter` for crisp swatches;
  - `generateMipmaps = false`, or pad each swatch so mipmaps don't bleed
    between them.
- **Keep the tint working:** author crown swatches in light neutral grey and
  keep `tintMask` as a vertex attribute, so the class tint and the low-trust
  greying still apply.

### C. Detailed textures (bark, leaf cards with transparency)

Possible, but expensive here. Not advised for plants.

- **What it needs:**
  - leaf cards need `alphaTest`;
  - the shadow pass then needs a matching `customDepthMaterial`, or the
    shadows stay solid;
  - overlapping cards cost overdraw, which is what hurts weak laptops.
- **Format:** each texture needs mipmaps and should be KTX2/Basis-compressed
  (`KTX2Loader`). Otherwise 20,000 plants of 1024 px bark eat GPU memory.
- **Look:** it moves away from the flat-shaded style the terrain, water and
  sky use.

If you want texture detail anywhere, the ground gets you more for less (next
section).

### Ground textures

The ground's look comes from the terrain shader in
`apps/web/src/lib/world/terrainMaterial.ts`. Today it blends rock, dirt, sand
and wet ground from slope and height, plus some noise. To add detail:

- Sample a small tiling detail texture (greyscale grass, rock or dirt grain)
  using world X/Z as UVs, or triplanar mapping on steep slopes so cliffs
  don't stretch.
- Multiply it into the natural colour **only when `uNatural` is 1**. Under the
  cover and confidence overlays, `uNatural` is 0 and the ground must keep its
  exact legend colours.
- Make the detail texture procedurally, either by baking noise from Blender's
  Noise or Voronoi nodes, or in code with a `DataTexture` like `water.ts`
  does.

### Rules for every texture

- **Don't paint lighting in.** The sun, moon and sky light come from
  `daynight.ts` and change through the day. Painted light or strong ambient
  occlusion fights the night lighting.
- **Keep base colours mid-range,** so the night palette (`time.night`) still
  reads.
- **Free every texture** in `Flora.dispose()` / `Fauna.dispose()`. The D12
  check expects the texture count to stay the same before and after 5
  walk/orbit toggles.

## 5. Export from Blender

File → Export → glTF 2.0:

- Format: glTF Binary (`.glb`).
- Include: selected objects only, with no cameras or lights.
- Transform: +Y Up (the default).
- Data: apply modifiers. Include vertex colours (A), or UVs and the image
  (B, C).
- Compression: leave it off at first. These meshes are tiny.

Save to `apps/web/public/models/`, one file per slot, named after it:
`spire.glb`, `pole.glb`, …, `herbivore.glb`, `predator.glb`. Vite serves that
folder as is.

## 6. Wiring it into the code (not built yet)

What the loader needs to do:

```ts
// world/models.ts (new)
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'

export async function loadSilhouette(url: string): Promise<THREE.BufferGeometry> {
  const gltf = await new GLTFLoader().loadAsync(url)
  const parts: THREE.BufferGeometry[] = []
  gltf.scene.updateMatrixWorld(true)
  gltf.scene.traverse((o) => {
    if (!(o instanceof THREE.Mesh)) return
    const g = o.geometry.clone().applyMatrix4(o.matrixWorld).toNonIndexed()
    const n = g.getAttribute('position').count
    const tint = /^crown/i.test(o.material.name) ? 1 : 0
    g.setAttribute('tintMask', new THREE.BufferAttribute(new Float32Array(n).fill(tint), 1))
    if (!g.getAttribute('color')) { /* fill from o.material.color */ }
    parts.push(g)
  })
  return mergeGeometries(parts)!   // every part must have the same attributes
}
```

The pieces around it:

- **Swap-in point:** `Flora` takes its geometries from `SILHOUETTES` today.
  Change that to a `Record<Silhouette, BufferGeometry>` that starts with the
  code-built shapes and switches to the loaded ones when they arrive. `Fauna`
  works the same way.
- **Loading:** it's async. Start it when the world view mounts, keep the
  current shapes until it finishes, and fall back to them if a file fails to
  load.
- **For texture levels B and C:** pass `map` to `tintedMaterial()`, keep the
  `uv` attribute (`build()` currently deletes it), and dispose the texture.

## 7. Checking your work

1. `pnpm web:dev`, press **Walk here**, and look at each class from up close
   and from far away.
2. Press **P** in walk mode. Compare draw calls, triangles and plant counts
   with the measurements in `docs/roles/world.md`, on all three quality
   presets.
3. Toggle walk and orbit 5 times. The geometry, texture and program counts
   must not grow.
4. Turn on **Show low trust**. Low-trust plants must still look sparse and
   grey. If they don't, the crown is missing `tintMask = 1`.
5. Check night (`]` a few times) and dusk. Nothing should glow or turn black.
6. `npm test`: the placement tests don't depend on the shapes, so they should
   still pass.
7. Update the D9 asset line in `docs/roles/world.md`, which currently says
   there are no texture or model files, and the file table in
   `apps/web/src/lib/world/README.md`.

Suggested start: level A. Model the seven silhouettes with vertex colours,
then add a ground detail texture if you want more texture.

---

## 8. Animation in three.js (r187, as used here)

Everything 3D in walk mode is plain three.js r187 on `WebGLRenderer`. Before
adding motion, know how this project's frame loop works, because it does not
draw every frame.

### 8.1 The frame loop you plug into

`apps/web/src/lib/world/scene.ts` owns the single `requestAnimationFrame`
loop (`#tick`). Each frame it:

1. measures `dt` in seconds and caps it at 0.1 s, so a background tab does not
   make things jump;
2. runs the orbit brush, the camera transition, the day/night cycle and the
   walk step;
3. decides whether to draw:
   - **walk mode, the camera transition and the day/night cycle** count as
     "animating": every frame is drawn, `#time` advances (unless reduced motion
     is on), and the frame-rate guard watches the fps;
   - **orbit view** draws only on demand, after `requestRender()` (a brush
     stroke, a camera move, new animal positions).

So:

- **Anything that moves needs a reason to draw.** In walk mode it already has
  one. In orbit view, a moving thing must either call `requestRender()` or be
  added to the `animating` condition, which costs battery and fps on weak
  laptops. Prefer "animates in walk mode, still in orbit view".
- **Drive motion from the shared clock** (`#time`, passed to shaders as
  `uTime`, as `water.ts` `setTime()` and `sky.ts` `update()` do), not from
  `performance.now()`. Then reduced motion stops it in one place.
- **Respect reduced motion.** `#time` stops when reduced motion is on, so
  shader animation stops by itself. Animation you drive another way must check
  `reducedMotion` itself.
- **Don't allocate per frame.** Reuse `Vector3`, `Matrix4` and `Quaternion`
  objects (see `Flora.setPlants`); garbage collection pauses show as stutter.
- **Shadows are not redrawn every frame** (`#shadowsDirty`). Something that
  moves will not move its shadow unless you mark shadows dirty, which redraws
  the whole shadow map. Small motion (leaves swaying) can keep a still shadow;
  nobody notices.

### 8.2 Which technique for which job

| Job | Technique | Cost | Example in this repo |
| --- | --- | --- | --- |
| Thousands of objects moving a little (wind in trees, grass) | Vertex shader displacement on the instanced material | Almost free | `water.ts` ripples, `sky.ts` clouds |
| Objects moving from place to place (animals walking) | Rewrite instance matrices each frame | Cheap for hundreds | `Fauna.place()` with sim poses |
| A body moving (legs, heads, tails) on hundreds of animals | Vertex shader with a per-instance phase | Cheap | not built |
| A few hero characters with authored motion | `SkinnedMesh` + `AnimationMixer` from a glTF | Expensive per character | not used |
| Camera moves, UI-like glides | Interpolate with an easing curve in the loop | Free | `#stepTransition` (smoothstep) |

### 8.3 Wind sway for trees and grass (shader)

Plants are `InstancedMesh`es with one material, `tintedMaterial()` in
`flora.ts`, so one shader edit moves all of them:

```ts
// in tintedMaterial(), inside onBeforeCompile:
shader.uniforms.uTime = timeUniform            // shared { value: 0 }, set each frame
shader.vertexShader = shader.vertexShader
  .replace('#include <common>', '#include <common>\nuniform float uTime;')
  .replace(
    '#include <begin_vertex>',
    /* glsl */ `#include <begin_vertex>
  // Sway grows with height, so the base stays planted.
  float h = max(position.y, 0.0);
  // Per-plant phase from the instance position, so neighbours don't sway in step.
  vec3 origin = vec3(instanceMatrix[3]);
  float phase = origin.x * 0.7 + origin.z * 1.3;
  transformed.x += sin(uTime * 1.6 + phase) * 0.025 * h * h;
  transformed.z += cos(uTime * 1.1 + phase) * 0.015 * h * h;`,
  )
```

Notes:

- `transformed` is in the model's own space, before `instanceMatrix`, so
  the sway scales and rotates with each plant.
- Keep amplitudes small; the scene is a diorama (one tree is 30 m tall).
- Update the uniform where the renderer already updates water and sky time
  (`#render()`), and keep `customProgramCacheKey` stable.
- The shadow pass uses its own depth material, so the shadows stay still.
  Acceptable for small sway.
- Grass tufts share the same material function, so they sway too. Give them
  a stronger amplitude through a second uniform if needed.

### 8.4 Animals

**Moving them (already done).** The herd sim ticks every 100 ms.
`SimPanel.svelte` interpolates between ticks in its own
`requestAnimationFrame` loop and hands `[x, y, heading]` poses to
`WorldView`, which calls `Fauna.place()` to rewrite the instance matrices.
To change how animals move across the map, change the sim (`packages/sim/herd`),
not the renderer.

**Animating their bodies (not built).** Animals are instanced, so use the
same shader approach as the trees:

- Model the animal with legs as separate parts, and give the leg vertices a
  vertex attribute (for example `legMask`: 0 body, 1 front legs, -1 back legs).
- In the vertex shader, swing them: rotate `transformed` around the hip
  height by `sin(uTime * stride + phase) * legMask * angle`. Take `phase` from
  the instance position, as in 8.3.
- To stop the legs when an animal stands still, the shader needs to know its
  speed. Add an `InstancedBufferAttribute` (one float per animal), fill it in
  `Fauna.place()` from the distance moved since the last frame, and multiply
  the swing by it.
- Add a small body bob (`transformed.y += abs(sin(...)) * 0.01`) for a walk
  feel.

**Authored animation (glTF clips).** If you animate a rig in Blender
(Action → exported as a glTF animation clip):

```ts
const gltf = await new GLTFLoader().loadAsync('/models/herbivore.glb')
const mixer = new THREE.AnimationMixer(gltf.scene)
mixer.clipAction(THREE.AnimationClip.findByName(gltf.animations, 'Walk')!).play()
// every frame, with the loop's dt:
mixer.update(dt)
```

Know what it costs here:

- A `SkinnedMesh` cannot be drawn with `InstancedMesh`. Every animal becomes
  its own mesh and its own draw call. That is fine for 5–10 animals and far
  too much for the 400 the sim runs. To show copies of a rig, clone it with
  `SkeletonUtils.clone()` (`three/addons/utils/SkeletonUtils.js`); a plain
  `.clone()` shares the skeleton.
- Morph-target animation (shape keys in Blender) can stay instanced:
  `InstancedMesh.setMorphAt()` sets morph weights per instance. That suits a
  simple two- or three-pose walk cycle.
- Each mixer must be stopped and its clips uncached (`mixer.stopAllAction()`,
  `mixer.uncacheRoot(root)`) when walk mode closes, or the D12 toggle check
  will show growth.

Recommendation: shader legs (8.4) for the herd; keep glTF clips for a
handful of special animals if you ever want them.

### 8.5 Camera and UI-like motion

For a glide (a camera move, a fade, an object popping in), interpolate in
the loop with an easing curve, as `#stepTransition` does:

```ts
t = Math.min(1, t + dt / durationS)
const k = t * t * (3 - 2 * t)             // smoothstep easing
camera.position.lerpVectors(from, to, k)
camera.quaternion.slerpQuaternions(qFrom, qTo, k)
```

With reduced motion, use a duration of 0 (jump to the end), as
`#startTransition` does.

### 8.6 Checking an animation

1. Walk mode, **P**: the fps must stay at the display cap on this machine,
   and draw calls must not jump. Shader animation adds no draw calls.
2. Turn on reduced motion in Settings: everything driven by `uTime` must
   stop.
3. Orbit view: decide on purpose whether it animates. If it does, the
   frame-rate guard now runs there too.
4. 5 walk/orbit toggles: the geometry, texture and program counts stay the
   same. A new `onBeforeCompile` variant shows up as an extra program; that is
   expected once, not on every toggle.
5. Headless browsers here cannot judge smoothness. Check motion by eye on a
   real machine, ideally the team's weakest laptop.
