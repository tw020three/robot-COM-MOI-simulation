# Physics model

This document derives every formula the tool uses. It flags each place where the tool departs from the spec, and each place where a result could not be verified. The code lives in `src/physics/`. The tests in `tests/` check each result below.

## 1. Frames and sign conventions

| Item | Convention |
|---|---|
| Body frame B | Origin O at the shell's geometric center; x forward, y left, z up. Right-handed. |
| Rotations | Positive angle = counter-clockwise looking down the positive axis. |
| Component orientation | Intrinsic XYZ Euler angles, R = Rx·Ry·Rz (same as three.js `'XYZ'`). |
| Pendulum pitch θp | θp > 0 swings the bob forward (+x). Rotation Ry(−θp). |
| Pendulum tilt β | β > 0 swings the bob left (+y). Rotation Rx(+β), applied inside the pitch: R_pend = Ry(−θp)·Rx(β). |
| Shell roll ψ | ψ > 0 is forward rolling, a rotation of Ry(+ψ). Forward rolling at speed v means ω = v/R about +y. |
| Static lean φ | φ = atan2(y_cm, −z_cm). φ > 0 means the ball has rolled toward +y. The body's pose in the world is Rx(−φ). |
| Inertia tensor | I = Σ m[(r·r)E − r rᵀ], so products of inertia carry the minus sign: I_xy = −Σ m·x·y. |
| Primitive axes | A box has its edges along local x, y, z. A cylinder, tube or rod has its axis along local z. The axle is rotated +90° about x so it lies along body y. |

### Mount poses

| Mount | Architecture A (default) | Architecture B |
|---|---|---|
| shell | Ry(ψ) | Ry(ψ) |
| frame | Ry(−θp) about O | identity (level) |
| pendulum (origin at the pivot) | frame ∘ T(pivot) ∘ Rx(β) | T(pivot) ∘ Ry(−θp) ∘ Rx(β) |

Both architectures give the pendulum the same orientation. In architecture A, the pivot itself swings about O with the frame.

## 2. Mass properties

Each component i has a mass mᵢ and a tensor Iᵢ about its own CoM in its local axes, taken from closed-form primitive formulas ([Wikipedia list](https://en.wikipedia.org/wiki/List_of_moments_of_inertia)). Its world pose is Tᵢ = mountPose ∘ localPose, which gives a rotation Rᵢ and a CoM rᵢ. Then:

```
M     = Σ mᵢ
r_cm  = (1/M) Σ mᵢ rᵢ
I_O   = Σ [ Rᵢ Iᵢ Rᵢᵀ + mᵢ(|rᵢ|²E − rᵢrᵢᵀ) ]
I_cm  = I_O − M(|r_cm|²E − r_cm r_cmᵀ)
```

The API follows Chrono's `CompositeInertia`, including "void" components with negative mass. Principal moments and axes come from a cyclic Jacobi eigen-solver.

**Thick shell.** I = (2/5)·m·(R⁵ − r⁵)/(R³ − r³). For numerical stability it is evaluated as (2/5)·m·R²·(1+k+k²+k³+k⁴)/(1+k+k²), with k = r/R. This gives 2/5·mR² at k = 0 and 2/3·mR² at k = 1.

**Sub-assemblies:**

- **Shell group:** the shell plus shell-mounted parts. I_spin = (I_O)_yy of this group. It doesn't change with ψ, because ψ is a rotation about y.
- **Inner assembly:** everything that does not spin with the shell (frame, frame-mounted parts and the pendulum group). In architecture B the frame is part of the inner assembly but does not pitch.
- **Pendulum group:** the bob, the arm and any pendulum-mounted payload. m_p is the mass of the whole group. r_p = |c|, where c is the group's CoM in the pendulum frame (origin at the pivot).
  - *Assumption:* the spec's "fixed m_p" is the bob mass. The optional arm adds its own mass on top, and every formula below uses the whole group.
- **I_yaw** = (I_O)_zz of the whole robot at θp = β = ψ = 0.

**Shell-roll wobble.** An off-axle, shell-mounted part moves the CoM as ψ changes. The tool samples ψ over [0, 2π) and reports the half-range of each CoM component. For a point mass m at radius r, the amplitude is m·r/M.

## 3. Trim (spec §5.1)

**Lateral trim β₀.** Ry and the shell roll leave y unchanged. So the pendulum group's y after a tilt depends only on β:

```
y_pend(β) = y_piv + c_y cosβ − c_z sinβ = y_piv + ρ sin(β + δ),
ρ = √(c_y² + c_z²),  δ = atan2(c_y, −c_z)
m_p · y_pend(β₀) + S_y = 0   ⇒   β₀ = asin( −(S_y + m_p y_piv) / (m_p ρ) ) − δ
```

For c = (0, 0, −r_p) this is exactly the spec's formula. |arg| > 1 is reported as "cannot trim".

**Fore/aft trim θ₀.** The tool solves x_cm(θ₀) = 0 by bisection on [−90°, 90°], taking the root nearest 0. Tests check it against closed forms:

- Architecture B: θ₀ = asin(−m_b·d/(m_p·r_p)).
- Architecture A: θ₀ = atan(−m_b·d/(m_p·r_p)), because the frame payload pitches too.

**Static lean.** φ = atan2(y_cm, −z_cm).

**Steering authority.** Measured from trim: β_max − β₀ toward +β and β_max + β₀ toward −β. The worst case is the smaller of the two.

**Tilt-servo holding torque.** This is the gravity moment of the pendulum group about the tilt axis a = Ry(−θp)·x̂. Gravity is expressed in the leaned body frame, g_B = Rx(φ)·(0, 0, −g):

```
τ_servo = | ((c_B − p_B) × m_p g_B) · a |
```

For θp = 0 and c = (0, 0, −r_p):

```
(d × F)_x = m g r_p [ −sinβ cosφ + cosβ sinφ ]  ⇒  τ_servo = m_p g r_p |sin(β − φ)|
```

> **Same physics as the paper.** Singhal et al. eq. 41 writes the gravity feed-forward as m_p g r_p sin(β + θ), where θ is their lean angle. Their θ has the opposite sign to this tool's φ: a left tilt β makes the ball lean left, which brings the pendulum back toward vertical. So their sin(β + θ) and this tool's sin(β − φ) describe the same torque. The spec's sin(β + φ) used the paper's sign for the lean.

The tool reports two values. The **upright** value (φ = 0) is the worst case, at the start of a manoeuvre. The **leaned** value uses the static lean. The upright value is the one compared with the servo rating and used to cap β_avail.

## 4. Drive (spec §5.2)

**Gravity torque.** The steady torque the drive can put into the shell is the gravity moment of the inner mass about the axle:

```
τ_g(θp) = g Σ_inner mᵢ xᵢ(θp)
```

Every inner part is either fixed or rotated by Ry(−θp) about a fixed point. So Σ m x and Σ m z are exactly of the form K + A cosθ + B sinθ. The code takes K, A and B from the poses θ = 0, π, ±π/2 (`innerMomentModel`). For a simple pendulum this gives τ_g = m_p g r_p sinθp.

**Torque cap.** τ_max = min(τ_g(θp,max), N·τ_stall, μ·M·g·R), and the tool reports which term binds.

**Slope and step:**

```
sin α_max = τ_max / (M g R)
e = τ_max / (M g),   h_max = R − √(R² − e²)
```

The spec writes τ_g,max here. The tool uses τ_max, which equals τ_g,max whenever gravity is the binding term, so a motor or traction limit also caps the slope.

**Derivation (quasi-static, no momentum).**

- *Slope.* On a slope α, the weight's moment about the contact point is M·g·R·sinα. The drive must supply at least that, so sin α_max = τ_max/(M g R).
- *Step.* Against a step of height h, the ball pivots about the step edge. The edge sits a horizontal distance d = √(R² − (R − h)²) from the centre, so the weight's moment about the edge is M·g·d. Rolling over needs τ_max ≥ M·g·d, i.e. d ≤ e = τ_max/(M g). That gives h ≤ R − √(R² − e²).
- *What it ignores.* Both limits are static. A ball arriving with speed can use its kinetic energy to climb more (Ylikorpi et al. 2014 study this "dynamic obstacle overcoming"). Their paper could not be opened from the build environment because core.ac.uk serves a bot check, so it is cited only as further reading.

### Planar acceleration with the inner assembly held at θ (verified)

Model: planar motion on flat ground with rolling without slip, x = Rψ. The inner assembly is held at a fixed world pitch θ, so it translates without rotating. Let T be the motor torque on the shell (forward, about +y), and F the ground friction on the shell (+x).

1. **Whole robot, horizontal:** F = M·a.
2. **Shell spin about O.** Friction acts at (0, 0, −R). Its moment about y is z·F_x − x·F_z = −R·F. So:
   ```
   I_spin·(a/R) = T − F·R
   ```
3. **Inner assembly, not rotating.** The moments about O of gravity and of the d'Alembert force −m·a·x̂ must balance the motor reaction:
   ```
   T = g·Σ m x + a·Σ m(−z)
   ```
   For a pendulum, T = m_p r_p (g sinθ + a cosθ).
4. **Combine:**
   ```
   a·[(M + I_spin/R²)·R − Σ m(−z)] = g·Σ m x
   ⇒ a = m_p g r_p sinθ / ( (M + I_spin/R²) R − m_p r_p cosθ )
   ```

Step 4 is exactly the spec's formula. The general form, with Σ m x and Σ m(−z) taken over the whole inner assembly, is what the code uses. It covers the spec's "architecture A: use the inner assembly's first moment about O".

*Check:* with a massless shell and M = m_p, it gives a = g r sinθ / (R − r cosθ).

## 5. Maximum speed (spec §5.3)

```
τ_req(v)   = R [ c_rr M g cosα + M g sinα + ½ ρ_air C_d A v² ]
τ_avail(v) = min( τ_g(θp,max),  N τ_stall (1 − (N v/R)/ω_noload),  μ M g R cosα )
```

v_max is the largest v with τ_avail ≥ τ_req, capped at ω_noload·R/N. Because τ_req rises and τ_avail falls with v, the tool finds it by bisection.

> **Added to the spec.** The traction term μMgR·cosα is not in the spec's τ_avail. It is added so that v_max is consistent with τ_max. Set μ high to remove it.

**Steady pitch.** θ_ss solves g(K + A cosθ + B sinθ) = τ_req exactly. For a simple pendulum this is asin(τ_req/(m_p g r_p)). It is NaN when gravity can't supply τ_req.

## 6. Turning (spec §5.4) — checked against the paper

**Primary model.** Singhal et al. 2023, eq. 29 ([arXiv:2301.06433](https://arxiv.org/abs/2301.06433)), with ψ̇ = v/R. The paper writes it as:

```
ρ = −r_h ( [I_h + (m_p + m_y + m_h) r_h² − m_p r_p r_h] I_h ψ̇² + [I_h + 2I_y] m_p r_p g ) / ( m_p r_p g I_h β )
```

In this tool's symbols:

```
ρ(v,β) = R [ (I_spin + M R² − m_p r_p R) I_spin ψ̇² + I_yaw m_p r_p g ] / ( m_p r_p g I_spin |β| )
```

The paper's minus sign only encodes the turn direction. The tool reports magnitudes.

### Symbol mapping (read from the paper, §2.1–2.2 and eq. 9)

| Paper | Meaning in the paper | This tool |
|---|---|---|
| I_h | Hull inertia, isotropic (2/3·m_h·r_h²), spinning with ψ | I_spin, the shell group about the axle |
| I_h + 2I_y | The yoke tensor is diag(I_y, 2I_y, I_y), and 2I_y is its moment about the vertical, so this is the yaw inertia of hull + yoke. The pendulum lies on the vertical axis at β = 0 and adds nothing. | I_yaw, the whole robot about the vertical through O |
| m_p + m_y + m_h | Total mass | M |
| r_h | Sphere radius | R |
| r_p | Distance from the pendulum CoM to the hull centre (the pivot is at the centre) | r_p, measured from the pivot |
| β | "Pendulum angle relative to the yoke" | Tilt relative to the body, measured from the trim β₀ |
| θ | Lean angle of the robot. The pendulum's angle from vertical is β + θ. | −φ: the paper's lean has the opposite sign to this tool's φ |

### Validity

- The paper's simplification (§3.1) assumes β is constant, β and θ are small, ψ̇ is constant and dominates φ̇ and θ̇, and the yoke CoM sits at O (r_y = 0).
- The tool flags β above 15°, the range the paper analyses.
- Frame-mounted mass offsets and a pivot offset from O are outside the paper's model. With a pivot offset, the tool uses r_p measured from the pivot.

### Limits

These are checked by the tests. The full expression is exactly the sum of the two.

- Low speed (eq. 32): ρ → R·I_yaw/(I_spin·β). This is nearly constant in v, as the paper's Fig. 9c shows.
- High speed (eq. 35): ρ → (I_spin + M R² − m_p r_p R)·v²/(m_p r_p g β R).

### Wobble (eqs. 24–27)

The lean oscillates as θ(t) = A(1 − cos ωt):

```
K   = I_spin (I_spin + M R² − m_p r_p R)/I_yaw · ψ̇² + m_p r_p g
|A| = m_p r_p g β / K                         (A → β at low speed, eq. 30)
ω   = √( K / (I_lean,O + M R² − 2 m_p r_p R) )
```

I_lean,O = (I_O)_xx of the whole robot. The paper writes this as I_p + I_h + I_y + m_p r_p². The denominator is therefore the lean inertia about the contact point.

The precession (eq. 23) is φ̇_mean = (I_spin/I_yaw)·ψ̇·A. A test confirms that ρ = R·ψ̇/φ̇_mean reproduces eq. 29.

**Cross-check model.** Kinematic lean (larics `spherical_robot_model`): ρ = R/tanφ, where φ is the static lean produced by the tilt β₀ + β_avail.

> The two models differ. With a pendulum-only inner mass, the static lean equals β, so the kinematic model gives ρ ≈ R/β. The paper's low-speed limit is R·I_yaw/(I_spin·β), larger by the ratio I_yaw/I_spin, and at higher speeds it adds the v² term. The paper's model is dynamic: it includes the gyroscopic coupling of eq. 20. The kinematic model is not, so treat it as a sanity bound rather than a prediction.

**Minimum radius:**

```
ρ_min(v) = max( ρ(v, β_avail), v²/(μ g) )
β_avail  = min( worst-side authority, servo-limited tilt )
```

## 7. Geometry checks

These are warnings only and never block anything.

- **Outside the shell:** the farthest point of each object from O is compared with the shell's inner radius. This is exact for boxes (8 corners) and uses 24 sampled rim points for cylinders.
- **Pendulum sweep:** a 5 × 5 grid over ±θp,max × ±β_max. At each point the pendulum parts are checked against the shell and against non-pendulum objects using bounding spheres. A slender arm is treated as a line segment.
- **Overlaps:** bounding spheres at the current pose. The axle is excluded, since everything hangs from it.
