# Spherical robot mass-property simulator

An interactive design tool for a **tilt-steer, pendulum-drive spherical robot**. It computes the robot's combined **center of mass** and **inertia tensor**, then the performance limits that follow from them: pendulum trim, maximum drive torque, slope and step, maximum speed, and minimum turning radius versus speed.

**Status: all five milestones complete:** the physics core, 3D editor, live readouts, six charts with parameter sweeps, presets, save/load, CSV export, and time-domain playback.

## Getting started

**You need:** [Node.js](https://nodejs.org/) 22.12 or newer (it includes npm) and Git. It runs in any current desktop browser with WebGL (Chrome, Edge, Firefox, Safari).

```bash
git clone https://github.com/tw020three/robot-COM-MOI-simulation.git
cd robot-COM-MOI-simulation
npm install          # once, installs dependencies
npm run dev          # starts the app
```

Then open **http://localhost:5173** in your browser. The page reloads by itself when you edit the code. Stop the server with Ctrl+C.

| Command | What it does |
|---|---|
| `npm run dev` | Development server at http://localhost:5173 |
| `npm test` | Runs the physics test suite (Vitest) |
| `npm run build` | Strict type-check, then a static build into `dist/` |
| `npm run preview` | Serves the built `dist/` locally to check it |

**Online version.** Every push to `main` is tested, built and published by GitHub Actions (`.github/workflows/deploy-pages.yml`) to:

**https://tw020three.github.io/robot-COM-MOI-simulation/**

Nothing to install: open the link in a desktop browser. Your robot is autosaved in that browser; use **Save** for a file you can keep or share.

*One-time setup (repository owner):* Settings → Pages → Build and deployment → Source: **GitHub Actions**. Then push to `main`, or run the workflow by hand from the Actions tab (*Deploy to GitHub Pages* → *Run workflow*). If the repository is private, Pages may need a paid GitHub plan, and the site follows GitHub's Pages visibility rules.

**Hosting it elsewhere.** `dist/` is a plain static site with relative paths, so it can be served from any static host or sub-folder (GitHub Pages, Netlify, an internal web server). For example, `npx serve dist` serves it locally. Opening `dist/index.html` directly from disk (`file://`) will not work, because browsers block module scripts there; serve it over HTTP instead.

## Quick start: a first design in ten minutes

1. **Pick a starting point.** Use the **Preset** menu (top right): the *Small demo bot*, *GimBall* (a published robot) or *RotunBot-like*. Your last robot is also restored automatically when you reopen the page.
2. **Size the shell.** Select **Shell** in the left tree and type R, wall thickness and mass. Or drag the **orange handle** on top of the ball in the 3D view.
3. **Set the pendulum.** Select **Pendulum** and enter the bob mass (fixed), the shape and the limits θp,max and β_max. Drag the **red handle** to move its CoM radius r_p; the arm length follows.
4. **Add payloads.** Use **Add → + payload…** (battery, PCB, motors …). Choose the mount:
   - *frame* pitches with θp in architecture A;
   - *pendulum* pitches and tilts;
   - *shell* spins with the roll ψ.

   Place a payload by typing a position in mm, or click it in the 3D view and drag the gizmo (W move, E rotate, R scale).
5. **Read the result.** The right panel updates live:
   - mass, CoM, inertia tensors, principal moments;
   - trim angles β₀ and θ₀, static lean, servo torque;
   - drive limits (τ_max, slope, step, v_max);
   - turning radius and wobble.

   Red means a limit is exceeded. Hover any row for its formula, and fix any **Geometry** warnings at the bottom (parts outside the shell, collisions).
6. **Trim it.** Press **β₀** or **θ₀** beside the pose sliders to put the pendulum at trim, so the ball rolls straight. If the readout says *cannot trim*, a payload is too far off-centre for the pendulum.
7. **Enter the drive.** Select **Robot & drive settings** and fill in the gear ratio, motor stall torque, no-load speed, servo rating, friction and rolling resistance. v_max, τ_max and the binding limit update.
8. **Explore with charts.** In the bottom panel (drag the divider to resize):
   - chart 1 shows the turning radius vs speed;
   - chart 2 shows where torque runs out;
   - charts 3–5 sweep any input, e.g. `Battery.position.y` from −40 to 40 mm, and plot trim, CoM and inertia across it;
   - chart 7 animates a turn.
9. **Save your work.** **Save** downloads the robot as a JSON file and **Load…** opens one. **Results CSV** and **Components CSV** export the numbers for a spreadsheet. Each chart has its own **CSV** and **PNG** buttons.

Undo/redo works everywhere (Ctrl+Z / Ctrl+Shift+Z).

## Using the editor

- **Left panel:** the component tree and a property editor. Payloads can be added, duplicated and deleted.
- **Centre:** the 3D view.
  - Click an object to select it.
  - The selected payload or frame box gets a gizmo: move (W), rotate (E) or scale (R). It writes back to the numeric fields.
  - Drag the **orange handle** on top of the shell to change the outer radius R.
  - Drag the **red handle** to change the pendulum CoM radius r_p. The tool solves for the arm length.
  - Sliders set the pendulum pitch θp, the tilt β and the shell roll ψ. The β₀ and θ₀ buttons jump to trim.
  - The robot is drawn leaned by its static lean, with a plumb line from the CoM to the ground.
- **Right panel:** live readouts. A value turns red when a limit is exceeded. Hover a row to see its formula.
- **Charts** (bottom panel, drag the divider to resize):
  1. Turning radius vs speed: eq. 29 at β = 5°, 10°, 15° and β_avail; ρ_min in bold; the traction floor; the kinematic cross-check; v_max; log axis. Tilts beyond 15° are shaded as outside the small-angle model.
  2. Available vs required torque, with each limit and the v_max point.
  3. Trim tilt β₀ vs a swept parameter, with the ±β_max band.
  4. CoM x, y, z and |offset| vs a swept parameter.
  5. Principal moments vs a swept parameter.
  6. Drive torque and slope limit vs pendulum pitch (two stacked panels).
  7. **Playback:** an animated top view of a steady turn, integrated with RK4 from Singhal et al. eqs. 20–22.
     - The closed-form eq. 29 circle is overlaid, with the simulated and closed-form radii side by side.
     - A lean-vs-time trace is checked against the predicted wobble amplitude and frequency.
     - You set β and v. Play, pause and scrub, with a CSV of the time series.

  Charts 3–5 share a sweep: pick any numeric input (e.g. `Battery.position.y`, `Pendulum.armLength`, `Pendulum.mass`), a range and a step count. Every output is recomputed at each step. Each chart has **Table**, **CSV** and **PNG** buttons. CSV columns are SI with the unit in the header.
- **Undo/redo:** Ctrl+Z and Ctrl+Shift+Z. A whole drag counts as one step.
- **Files** (top bar):
  - **Save** downloads the robot as JSON in SI units. **Load…** reads one back. A file with bad values is rejected with a list of every problem, and missing fields are filled from defaults and reported.
  - **Results CSV** exports every readout as section, quantity, value, unit, note.
  - **Components CSV** exports each part's mass, CoM, inertia about its own CoM (body axes) and its share of I_O,yy.
  - The current robot is also autosaved in the browser and restored on reload. Files remain the real record.
- **Presets:**
  - *Small demo bot:* placeholder values.
  - *GimBall:* published masses and geometry from Ylikorpi et al. 2014; drive values are placeholders.
  - *RotunBot-like:* masses from Zhang et al. 2025; frame and drive estimated.
- **Display units:** geometric lengths (positions, sizes, R, r_p, CoM, step height, turning radius) in **mm**; angles in degrees; everything else SI: inertia **kg·m²**, mass kg, speed **m/s**, angular speed **rad/s**, acceleration **m/s²**, angular acceleration **rad/s²**, torque N·m.

## Layout

```
src/physics/   plain TypeScript, no React or three.js imports
  vec.ts mat3.ts        Vec3/Mat3 helpers, rotations, Jacobi eigen-solver
  primitives.ts         closed-form inertia of sphere, thick shell, box, cylinder, tube, rod
  composite.ts          CompositeInertia (Chrono-style, supports void components)
  pose.ts               mount poses for architectures A and B
  massProps.ts          combined CoM, tensors, principal axes, sub-assemblies
  trim.ts drive.ts speed.ts turning.ts   derived performance (spec §5)
  checks.ts             geometry warnings
  sweep.ts              parameter sweeps
  results.ts            computeAll(config) → Results
  curves.ts             chart data tables + CSV
  report.ts             results / components CSV export
  playback.ts           RK4 integration of Singhal eqs. 20–22 for the playback tab
src/state/             zustand store (config, selection, undo/redo, autosave), presets, io.ts (JSON save/load + validation)
src/ui/                React UI: ComponentTree, PropertyPanel, Viewport3D, PoseSliders, Readouts, FileMenu, charts/
tests/                  Vitest
docs/model.md           derivations, symbol mapping and open questions
```

## Conventions

- **Units:** SI internally (m, kg, s, N·m, rad). The UI shows lengths in mm and angles in degrees; inertia, speeds and accelerations stay SI.
- **Body frame:** origin O at the shell's center; x forward, y left, z up.
- **Inertia tensor:** I = Σ m[(r·r)E − r rᵀ], so **products of inertia carry the minus sign**: I_xy = −Σ m·x·y.
- **Pendulum pitch θp > 0:** the bob swings forward, Ry(−θp). **Tilt β > 0:** the bob swings left, Rx(β). **Shell roll ψ > 0:** forward rolling, Ry(ψ).
- **Static lean:** φ = atan2(y_cm, −z_cm), positive when the ball rolls toward +y.
- **Euler angles:** intrinsic XYZ (three.js order), R = Rx·Ry·Rz.
- **Architecture A** (default): the whole inner assembly pitches with θp. **Architecture B:** only the pendulum pitches and the frame stays level.

## Symbols

| Symbol | Meaning | Unit |
|---|---|---|
| R, t | shell outer radius, wall thickness | m |
| M | total mass | kg |
| r_cm | combined CoM in the body frame | m |
| I_O, I_cm | inertia tensor about O and about the CoM | kg·m² |
| I_spin | spin inertia of the shell group about the axle (y) | kg·m² |
| I_yaw | whole-robot inertia about the vertical axis through O | kg·m² |
| m_p, r_p | pendulum-group mass; pivot-to-CoM distance | kg, m |
| θp, β | pendulum pitch and tilt | rad |
| β₀, θ₀ | trim tilt and trim pitch | rad |
| φ | static lean | rad |
| N, τ_stall, ω_noload | gear ratio, motor stall torque, motor no-load speed | –, N·m, rad/s |
| μ, c_rr, C_d, A, ρ_air | friction, rolling resistance, drag coefficient, frontal area, air density | –, –, –, m², kg/m³ |
| ρ | turning radius | m |

## Equations and sources

Full derivations are in [`docs/model.md`](docs/model.md).

| Quantity | Formula | Source |
|---|---|---|
| Primitive tensors | sphere 2/5·mR²; thick shell 2/5·m(R⁵−r⁵)/(R³−r³); box m/12(b²+c²); cylinder ½mr², m/12(3r²+h²) | [Wikipedia: List of moments of inertia](https://en.wikipedia.org/wiki/List_of_moments_of_inertia) |
| Combination | I_O = Σ[RᵢIᵢRᵢᵀ + mᵢ(\|rᵢ\|²E − rᵢrᵢᵀ)]; I_cm = I_O − M(\|r_cm\|²E − r_cm r_cmᵀ) | [LibreTexts: parallel-axis theorem](https://phys.libretexts.org/Bookshelves/Classical_Mechanics/Variational_Principles_in_Classical_Mechanics_(Cline)/13%3A_Rigid-body_Rotation/13.08%3A_Parallel-Axis_Theorem); [Chrono CompositeInertia](https://api.projectchrono.org/classchrono_1_1utils_1_1_composite_inertia.html) |
| Trim tilt | β₀ = asin(−(S_y + m_p y_piv)/(m_p r_p)) | spec §5.1, generalised in model.md §3 |
| Servo torque | m_p g r_p \|sin(β − φ)\|, the same torque as the paper's sin(β + θ) with θ = −φ | [Singhal et al. 2023](https://arxiv.org/abs/2301.06433) eq. 41 |
| Drive torque | τ_g = g Σ_inner m x → m_p g r_p sinθp; τ_max = min(τ_g, Nτ_stall, μMgR) | derived in model.md §4; background: [PoliTo thesis](https://webthesis.biblio.polito.it/31455/1/tesi.pdf) (not opened) |
| Slope, step | sin α = τ_max/(MgR); h = R − √(R² − e²), e = τ_max/(Mg). The step limit is static and conservative: a moving robot clears much more. | [Ylikorpi, Forsman & Halme 2014](https://core.ac.uk/download/80712523.pdf) eq. 1; GimBall value 1.8936 mm reproduced to 0.05 % |
| Acceleration | a = m_p g r_p sinθ / ((M + I_spin/R²)R − m_p r_p cosθ) | re-derived in model.md §4; matches the Lagrangian of [Ylikorpi et al. 2014](https://core.ac.uk/download/80712522.pdf) eqs. 3–4 (test) |
| Max speed | τ_req = R[c_rr Mg cosα + Mg sinα + ½ρC_dAv²]; τ_avail = min(τ_g, Nτ_stall(1 − Nv/(Rω_nl)), μMgR cosα) | spec §5.3 (+ traction term) |
| Turning | Singhal et al. eq. 29 (mapping checked: I_h → I_spin, I_h + 2I_y → I_yaw); cross-check ρ = R/tanφ | [Singhal et al. 2023](https://arxiv.org/abs/2301.06433); [larics/spherical_robot_model](https://github.com/larics/spherical_robot_model) |
| Wobble | \|A\| = m_p r_p g β / K, ω = √(K / I_lean,contact) | Singhal et al. eqs. 26–27 |
| Playback | RK4 on φ̈ = (I_spin/I_yaw)ψ̇θ̇; I_lean,c θ̈ + (I_spin + MR² − m_p r_p R)φ̇ψ̇ + m_p r_p g(β+θ) = 0; ψ̈ = 0; rolling constraints | Singhal et al. eqs. 12–13, 20–22 (path radius within 2 % of eq. 29, test) |

## Assumptions and validity

- Rigid bodies. The shell rolls without slipping on a flat surface or uniform slope.
- Drive torque, slope and acceleration use a quasi-static, planar (decoupled) model. The inner assembly is held at a fixed pitch.
- Turning uses the small-angle model of Singhal et al. Tilts above about 15° are flagged as outside its validity range.
- Geometry checks are approximate (bounding spheres, sampled rims). They only warn.
- Preset numbers marked "placeholder" or "estimate" are not measurements.

## Where this differs from SPEC.md

- **Display units:** set by request instead of the spec's SI ↔ mm/g toggle. Lengths are in mm; inertia, speeds and accelerations are SI (see *Display units* above).
- **Servo torque:** written sin(β − φ) rather than sin(β + φ). It is the same physics as Singhal et al. eq. 41; only the sign of the lean differs (model.md §3).
- **Traction term:** μMgR·cosα is included in τ_avail for v_max, consistent with τ_max (model.md §5).
- **Slope and step limits:** computed from τ_max (all limits), not τ_g,max alone. They are equal whenever gravity binds.
- **Sweep tool:** shipped in milestone 3, because charts 3–5 need it.
- **Not built:** STL import (a stretch goal). Deferred; not needed for now.
- **Playback view:** shown as an animated top-view chart rather than inside the 3D viewport. This keeps the editor responsive. The same data exports as CSV.
