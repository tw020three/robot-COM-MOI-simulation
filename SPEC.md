# Claude Code Prompt — Spherical Robot Mass-Property Simulator

## How to use this prompt

Copy everything from **Prompt** down through **Reference sources** into Claude Code, or save this file as `SPEC.md` in an empty folder and tell Claude Code: "Read SPEC.md and build it, milestone by milestone."

- **Assumed stack:** a browser app (TypeScript + three.js + Plotly). If you would rather have Python, change the Tech stack section before pasting.
- **Assumed units:** SI throughout (m, kg, s, N·m, rad internally; degrees in the UI).
- The prompt asks Claude Code to plan first and confirm the physics model before writing UI code, so expect a short plan back before any build.

---

# Prompt

## 1. Goal and the robot

Build an interactive design tool for a **tilt-steer, pendulum-drive spherical robot**. Its job is to compute, display and graph the robot's combined **center of mass (CoM)** and **inertia tensor**, and the performance limits that follow from them: pendulum trim tilt, maximum drive torque, maximum speed, and minimum turning radius versus speed. The CoM and inertia numbers are the primary outputs; everything else is derived from them.

Before writing code, enter plan mode. Restate the physics model, list every assumption and sign convention, propose the file structure, and wait for my approval.

**The robot being modeled:**

- A rigid spherical shell of radius R that rolls without slipping on flat ground (optionally a slope of angle α).
- A main axle through the shell center along the body's lateral axis. A drive motor between the axle and the shell turns the shell; the reaction swings the pendulum fore/aft by a pitch angle θp. This is the forward drive.
- A second motor tilts the pendulum sideways about the forward axis by angle β. Shifting the CoM sideways makes the ball lean and roll in an arc. This is the steering.
- An internal frame (yoke) hangs on the axle and carries payload. It does not spin with the shell.
- **Body frame:** origin at the shell's geometric center; x forward, y left, z up. All internal geometry is expressed in this frame.

## 2. Tech stack and architecture

- **App:** Vite + React + TypeScript (strict mode). Runs locally with `npm run dev` and builds to static files.
- **3D view:** three.js through @react-three/fiber and @react-three/drei (OrbitControls, TransformControls or PivotControls for dragging objects, Grid, Html labels).
- **Charts:** Plotly.js (react-plotly.js) for log axes, hover readouts and PNG export.
- **State:** one zustand store holding a single `RobotConfig`. Every output is a pure function of that config, recomputed on change.
- **Physics core:** `src/physics/`, plain TypeScript with no React or three.js imports, so it is unit-testable and portable. Write small Vec3/Mat3 helpers and a Jacobi eigen-solver for symmetric 3×3 matrices; no heavy math library.
- **Tests:** Vitest on the physics core.
- **Persistence:** save/load the config as JSON; export results as CSV.

Suggested layout:

```text
src/
  physics/   vec.ts  mat3.ts  primitives.ts  massProps.ts
             trim.ts  drive.ts  turning.ts  sweep.ts
  state/     store.ts  presets.ts
  ui/        ComponentTree  PropertyPanel  Viewport3D  Readouts  charts/
tests/
docs/model.md
```

## 3. Components the user adds and edits

Every component has: name, **mount** (shell, frame or pendulum), shape, mass (kg), dimensions, position (m, in its mount's frame), rotation (deg, XYZ Euler), color, visibility, and an "include in calculations" toggle.

**Built-in components** (always present, editable, not deletable):

- **Shell:** outer radius R, wall thickness t, mass. Use the thick spherical shell inertia so it covers thin and solid limits.
- **Axle and frame (yoke):** a cylinder along y plus an optional box; mass and dimensions editable.
- **Pendulum:** a **fixed mass m_p** that the user sets once and that stays constant while everything else changes. Bob shape: point mass, sphere, box or cylinder, plus an optional arm modeled as a slender rod with its own mass. **Variable position:** pivot location on the axle (default at the center, offsettable in y and z), arm length l (pivot to bob CoM), fore/aft pitch θp, and lateral tilt β. Limits θp,max and βmax are user inputs.

**Payload objects** (add, duplicate, delete any number): point mass, solid sphere, hollow sphere, box, solid cylinder, tube. Each has a per-object **scale mode**:

- *Fixed mass:* scaling changes only the inertia.
- *Fixed density:* mass follows volume. Show mass and density side by side either way.
- Stretch goal: STL import with uniform density, using signed-tetrahedron (Mirtich-style) integration.

**Mount behavior and drive architecture:**

- *Frame-mounted* and *pendulum-mounted* objects pitch with θp. Pendulum-mounted objects also tilt with β.
- *Shell-mounted* objects spin with the shell's roll angle. Add a "shell roll angle" slider and report the CoM wobble over one full shell revolution.
- Add a config switch: **(A)** the whole internal assembly pitches with θp (default), or **(B)** only the pendulum pitches and the frame stays level.

**Geometry checks** (warnings, never blocking): any object outside the shell's inner radius; pendulum sweep (over ±θp,max and ±βmax) hitting the shell or a payload object; overlapping objects by bounding-sphere test.

## 4. Mass properties (the primary outputs)

For each component, take its inertia tensor about its own CoM from closed-form primitive formulas. Rotate it into the body frame with the component's full pose (own rotation, then mount pose: θp, β, or shell roll). Transform its CoM the same way. Then combine:

```latex
M = \sum_i m_i \qquad \mathbf{r}_{cm} = \frac{1}{M}\sum_i m_i \mathbf{r}_i
```

```latex
I_O = \sum_i \left[ R_i I_i R_i^{\mathsf T} + m_i\left(\lVert\mathbf{r}_i\rVert^2 E - \mathbf{r}_i\mathbf{r}_i^{\mathsf T}\right) \right]
```

```latex
I_{cm} = I_O - M\left(\lVert\mathbf{r}_{cm}\rVert^2 E - \mathbf{r}_{cm}\mathbf{r}_{cm}^{\mathsf T}\right)
```

Here O is the shell's geometric center and E is the 3×3 identity. Use the tensor convention where products of inertia carry the minus sign (I_xy = −Σ m·x·y), and state it in the README.

**Report:**

- Total mass M; CoM (x, y, z) in mm; |CoM offset| and offset ÷ R; vertical offset (negative means below center, which is required for the pendulum to work).
- Full 3×3 tensor about the CoM and about O.
- Principal moments and principal axes (Jacobi eigen-decomposition) and radii of gyration √(I/M).
- **Sub-assembly breakdown** needed by section 5: shell plus shell-mounted parts (spin inertia I_spin about the axle); the inner assembly; the pendulum alone (m_p and pivot-to-CoM distance r_p); and the yaw inertia I_yaw of the whole robot about the vertical axis through O.

The structure of Project Chrono's `CompositeInertia` class (add components with frame, mass and tensor; support "void" components with negative mass) is a good model for the API.

## 5. Derived performance: trim, torque, speed, turning

Everything here consumes the section 4 outputs. Show each formula in an info tooltip and in the README with its source. Where a formula below is a simplification, derive the general version in `docs/model.md` and flag anything you are unsure of rather than guessing.

### 5.1 Pendulum trim tilt for an off-center CoM

Let S_y = Σ m_i·y_i over everything except the pendulum. Find the tilt β₀ that puts the combined CoM back on the robot's mid-plane, so it rolls straight:

```latex
m_p\,(y_{piv} + r_p \sin\beta_0) + S_y = 0 \;\Rightarrow\; \beta_0 = \arcsin\!\left(\frac{-(S_y + m_p\,y_{piv})}{m_p\, r_p}\right)
```

- If the argument's magnitude exceeds 1, show "cannot trim: payload too far off-center".
- Solve the fore/aft trim pitch θ₀ the same way (numerically by bisection, so architecture A and B both work; keep the closed form as a test).
- **Static lean if untrimmed:** the ball rolls sideways until the CoM is under O, so φ_static = atan2(y_cm, −z_cm).
- **Remaining steering authority:** βmax − β₀ toward one side and βmax + β₀ toward the other. Use the smaller one for worst-case turning.
- **Tilt-servo holding torque:** m_p·g·r_p·sin(β + φ). Compare against a user-entered servo rating.

### 5.2 Maximum drive torque, slope and step

The steady torque the drive can push into the shell is capped by the gravity moment of the swung mass. Past that, the pendulum swings up and over instead of driving the ball.

```latex
\tau_g(\theta_p) = g \sum_{\text{inner}} m_i\, x_i^{world} \;\xrightarrow{\text{simple pendulum}}\; m_p g\, r_p \sin\theta_p
```

```latex
\tau_{max} = \min\big(\tau_g(\theta_{p,max}),\; N\,\tau_{stall},\; \mu M g R\big)
```

N is the gear ratio and μ the ground friction coefficient. Report which term binds.

- **Max slope:** sin α_max = τ_g,max ÷ (M·g·R).
- **Max step height:** with e = τ_g,max ÷ (M·g), h_max = R − √(R² − e²).
- **Max acceleration** on flat ground, pendulum held at θp (planar decoupled model):

```latex
a = \frac{m_p g\, r_p \sin\theta_p}{\left(M + I_{spin}/R^2\right) R \;-\; m_p r_p \cos\theta_p}
```

For architecture A, replace m_p·r_p with the inner assembly's first moment about O.

### 5.3 Maximum speed

```latex
\tau_{req}(v) = R\left[c_{rr} M g \cos\alpha + M g \sin\alpha + \tfrac12 \rho_{air} C_d A v^2\right]
```

```latex
\tau_{avail}(v) = \min\!\left(\tau_g(\theta_{p,max}),\; N\,\tau_{stall}\left(1 - \frac{N v / R}{\omega_{noload}}\right)\right)
```

v_max is the largest v where τ_avail ≥ τ_req, capped at ω_noload·R ÷ N. Inputs: c_rr, C_d, frontal area (default πR²), ρ_air, slope α, motor stall torque, no-load speed, gear ratio. Also report the steady forward pitch needed at each speed, θ_ss = asin(τ_req ÷ (m_p·g·r_p)).

### 5.4 Turning radius versus speed

**Primary model** (Singhal et al. 2023, eq. 29), with spin rate ψ̇ = v ÷ R:

```latex
\rho(v,\beta) = \frac{R\left[\left(I_{spin} + M R^2 - m_p r_p R\right) I_{spin}\,\dot\psi^2 + I_{yaw}\, m_p r_p\, g\right]}{m_p r_p\, g\, I_{spin}\, |\beta|}
```

The paper's symbols map as: I_h → I_spin (shell spin inertia); I_h + 2I_y → I_yaw (inertia about the vertical axis); total mass → M. Read the paper and confirm this mapping in your plan before coding. Check the two limits:

- Low speed: ρ → R·I_yaw ÷ (I_spin·β). Turning radius is set purely by the inertia ratio.
- High speed: ρ → (I_spin + M·R² − m_p·r_p·R)·v² ÷ (m_p·r_p·g·β·R). Radius grows with v².

**Cross-check model** (kinematic lean, as in the larics decoupled model): heading rate = (v ÷ R)·tan φ, so ρ = R ÷ tan φ. Plot it dashed alongside.

**Minimum turning radius:**

```latex
\rho_{min}(v) = \max\!\left(\rho\big(v,\, \beta_{avail}\big),\; \frac{v^2}{\mu g}\right)
```

β_avail is the smaller remaining tilt from 5.1, further capped where the tilt-servo torque runs out. Shade β above about 15° as outside the small-angle validity of the model.

**Optional:** wobble amplitude and frequency versus speed (same paper, eqs. 26–27). Both depend on the inertia terms, so they are useful design feedback.

## 6. UI, 3D view, readouts and graphs

**Layout:** component tree and property editor on the left; 3D viewport in the center; live readouts on the right; charts in a tabbed panel below.

**3D viewport:**

- Semi-transparent shell with a light wireframe, axle, frame, pendulum (arm and bob) and payload meshes.
- Click to select; drag with a translate/rotate/scale gizmo that writes back to the store, so numeric fields stay in sync.
- Pose sliders: pendulum pitch θp, tilt β, shell roll angle.
- Markers: shell center O, combined CoM (large sphere), sub-assembly CoMs (small spheres), principal-axis arrows, and a plumb line from the CoM to the ground. Optionally show the equivalent inertia ellipsoid.
- Render the robot leaned by the computed static lean, so an off-center payload visibly tips the ball.

**Readouts panel** (always visible; red when a limit is exceeded): M; CoM xyz; |offset| and offset ÷ R; inertia tensors about the CoM and O; principal moments; trim tilt β₀ and trim pitch θ₀; static lean; τ_max with its binding constraint; max slope; max step; v_max with its binding constraint; ρ_min at the current speed; required tilt-servo torque.

**Charts** (Plotly; each with CSV and PNG export):

1. **Turning radius vs speed** (the main chart): curves for β = 5°, 10°, 15° and β_avail; the ρ_min curve in bold; the traction floor v²/(μg); a vertical line at v_max; log-scale y axis.
2. **Torque vs speed:** available versus required torque, with the v_max intersection marked.
3. **Trim tilt β₀ vs a swept parameter**, with the ±βmax band shaded.
4. **CoM components** (x, y, z) and |offset| vs a swept parameter.
5. **Principal moments** (I₁, I₂, I₃) vs a swept parameter.
6. **Drive torque and max slope vs pendulum pitch θp.**

**Sweep tool:** pick any numeric input (for example `Battery.position.y`, `Pendulum.armLength`, `Pendulum.mass`), a range and a step count. Recompute every output across the range and feed charts 3–5.

**Presets:**

- *Small demo bot:* placeholder values you choose and label as placeholders.
- *RotunBot-like* (Zhang et al. 2025): shell radius 0.40 m, pendulum arm about 0.27 m, heavy pendulum 73.4 kg, shell 27.6 kg, total about 160 kg. Use it as a sanity check, not a speed benchmark, since the real robot adds a momentum wheel.

**Also:** SI internally with a display-units toggle (SI or mm/g); save/load JSON; undo/redo.

## 7. Validation, milestones and deliverables

**Unit tests** (Vitest) must pass before any UI work:

- Solid sphere gives 2/5·mR²; thin shell gives 2/3·mR²; the thick-shell formula reduces to both limits.
- Box and cylinder tensors match the Wikipedia list. A box rotated 45° about z gets the expected off-diagonal terms. Tensors stay symmetric and positive definite, and principal moments satisfy the triangle inequality.
- Parallel-axis check: a cube about its corner matches the LibreTexts worked example.
- Two equal masses placed symmetrically about O give a CoM at O. Moving one object by Δr shifts the CoM by exactly m·Δr ÷ M.
- Trim: a payload of mass m_b at y = d gives β₀ = asin(−m_b·d ÷ (m_p·r_p)); an unreachable case is flagged.
- Drive: τ_g at θp = 90° equals m_p·g·r_p; the slope limit equals asin(m_p·r_p ÷ (M·R)) for a pendulum-only inner mass.
- Turning: the eq. 29 implementation converges to the low- and high-speed limits from 5.4.

**Milestones** (stop and show me after each one):

1. Physics core and tests.
2. 3D editor and readouts.
3. Performance calculations and charts.
4. Sweeps, presets, save/load, export.
5. *Optional:* time-domain playback. Integrate the simplified equations from Singhal et al. (eqs. 20–22) with RK4 and animate the ball rolling a wobbly circle, overlaying the closed-form ρ.

**Deliverables:** the running app; a README with every equation, a symbol table, sign conventions, assumptions and validity ranges, and source links; `docs/model.md` with the planar drive derivation and the turning-model symbol mapping.

**Ground rules:** never invent physics silently; every displayed number carries units; no unexplained magic constants; keep all physics in the physics core.

## 8. Reference sources

Fetch these when you need detail. Cite them in the README next to each formula they support.

| Source | Use it for |
| --- | --- |
| [Singhal et al. 2023, Wobble control of a pendulum actuated spherical robot](https://arxiv.org/abs/2301.06433) | Turning radius (eqs. 29, 32, 35), wobble amplitude and frequency (26–27), simplified dynamics (20–22) for playback, frame and angle definitions |
| [Singhal et al., Pendulum actuated spherical robot: dynamic modeling and analysis](https://arxiv.org/pdf/2301.05859) | Full coupled Lagrange–d'Alembert model with Euler angles and non-holonomic constraints |
| [Zhang et al. 2025, A High-Speed Capable Spherical Robot (RotunBot)](https://arxiv.org/pdf/2511.01288) | Tilt-steer architecture; real component masses and dimensions for the preset; lean-angle feedforward idea |
| [larics/spherical_robot_model (GitHub, MIT)](https://github.com/larics/spherical_robot_model) | 2-DOF pendulum robot in Simulink: decoupled planar models plus a Simscape multibody model; the heading-kinematics cross-check for turning |
| [Ylikorpi et al. 2014, Dynamic obstacle overcoming of pendulum-driven ball robots](https://core.ac.uk/download/80712523.pdf) | Step-height limit from CoM offset; survey of slope-climbing limits |
| [Ylikorpi et al. 2014, Unified representation of decoupled dynamic models](https://core.ac.uk/download/80712522.pdf) | Forward-motion decoupled model to check the 5.2 acceleration formula |
| [Schroll 2010, Dynamic model of a spherical robot from first principles](https://core.ac.uk/download/354390219.pdf) | First-principles model, MATLAB simulation appendices, mobility limits vs maximum CoM displacement |
| [Politecnico di Torino thesis, spherical UGV with pendulum and CMGs](https://webthesis.biblio.polito.it/31455/1/tesi.pdf) | Why CoM offset caps drive torque; an example design-requirements table |
| [MPC framework for pendulum-driven spherical robots](https://arxiv.org/pdf/2302.08932) | Euler–Lagrange model of a shell, frame and 2-DOF pendulum, with a clear nomenclature table |
| [Norma: slider and pendulum spherical robot](https://arxiv.org/pdf/1908.02243) and its [MATLAB dynamics code](https://www.mathworks.com/matlabcentral/fileexchange/73810-spherical-robot-norma-dynemics) | An alternative lateral-mass-shift steering design with working simulation code |
| [Wikipedia, List of moments of inertia](https://en.wikipedia.org/wiki/List_of_moments_of_inertia) | Primitive inertia tensors (sphere, shell, cuboid, cylinder, rod) |
| [LibreTexts, Parallel-axis theorem](https://phys.libretexts.org/Bookshelves/Classical_Mechanics/Variational_Principles_in_Classical_Mechanics_(Cline)/13%3A_Rigid-body_Rotation/13.08%3A_Parallel-Axis_Theorem) | Tensor form of the parallel-axis theorem; cube-about-corner test case |
| [Project Chrono, CompositeInertia](https://api.projectchrono.org/classchrono_1_1utils_1_1_composite_inertia.html) | API pattern for composite mass properties, including void components |
| [three.js TransformControls](https://threejs.org/docs/pages/TransformControls.html) | Drag/rotate/scale gizmo for placing objects |
| [@react-three/drei](https://github.com/pmndrs/drei) | React wrappers: TransformControls, PivotControls, OrbitControls, Grid |

The first, third and fourth sources were opened and checked while writing this prompt; the rest come from search listings, so skim them before relying on specific numbers.
