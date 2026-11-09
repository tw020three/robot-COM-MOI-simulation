# Spherical robot mass-property simulator

An interactive design tool for a **tilt-steer, pendulum-drive spherical robot**. It computes the robot's combined **center of mass** and **inertia tensor**, then the performance limits that follow from them: pendulum trim, maximum drive torque, slope and step, maximum speed, and minimum turning radius versus speed.

**Status: milestone 1 of 5.** The physics core and its tests are complete. The interactive editor (3D view, panels, charts) comes in milestones 2–4. For now `npm run dev` shows a table of results for the two presets.

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
src/state/presets.ts    demo bot (placeholders) and RotunBot-like preset
tests/                  Vitest
docs/model.md           derivations, symbol mapping and open questions
```

## Conventions

- **Units:** SI internally (m, kg, s, N·m, rad). The UI will show degrees.
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
| Servo torque | m_p g r_p \|sin(β − φ)\| (**sign differs from the spec**, see model.md §3) | derived |
| Drive torque | τ_g = g Σ_inner m x → m_p g r_p sinθp; τ_max = min(τ_g, Nτ_stall, μMgR) | [PoliTo thesis](https://webthesis.biblio.polito.it/31455/1/tesi.pdf) (not re-read) |
| Slope, step | sin α = τ_max/(MgR); h = R − √(R² − e²), e = τ_max/(Mg) | [Ylikorpi et al. 2014](https://core.ac.uk/download/80712523.pdf) (not re-read) |
| Acceleration | a = m_p g r_p sinθ / ((M + I_spin/R²)R − m_p r_p cosθ) | re-derived in model.md §4; [Ylikorpi et al.](https://core.ac.uk/download/80712522.pdf) |
| Max speed | τ_req = R[c_rr Mg cosα + Mg sinα + ½ρC_dAv²]; τ_avail = min(τ_g, Nτ_stall(1 − Nv/(Rω_nl)), μMgR cosα) | spec §5.3 (+ traction term) |
| Turning | Singhal et al. eq. 29 (**symbol mapping unverified**); cross-check ρ = R/tanφ | [Singhal et al. 2023](https://arxiv.org/abs/2301.06433); [larics/spherical_robot_model](https://github.com/larics/spherical_robot_model) |

## Assumptions and validity

- Rigid bodies. The shell rolls without slipping on a flat surface or uniform slope.
- Drive torque, slope and acceleration use a quasi-static, planar (decoupled) model. The inner assembly is held at a fixed pitch.
- Turning uses the small-angle model of Singhal et al. Tilts above about 15° are flagged as outside its validity range.
- Geometry checks are approximate (bounding spheres, sampled rims). They only warn.
- Preset numbers marked "placeholder" or "estimate" are not measurements.
