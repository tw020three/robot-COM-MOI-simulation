# Spherical robot mass-property simulator

An interactive design tool for a **tilt-steer, pendulum-drive spherical robot**. It computes the robot's combined **center of mass** and **inertia tensor**, then the performance limits that follow from them: pendulum trim, maximum drive torque, slope and step, maximum speed, and minimum turning radius versus speed.

**Status: milestones 1–4 of 5 complete.** The physics core, 3D editor, live readouts, six charts with parameter sweeps, presets, save/load and CSV export are done. Milestone 5 (optional) is time-domain playback.

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

```bash
npm install
npm test         # Vitest, physics core
npm run dev      # dev server
npm run build    # strict type-check + static build into dist/
```

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
- **Not built:** STL import (a stretch goal) and time-domain playback (milestone 5, optional).
