/**
 * Composite mass properties, modelled on Project Chrono's utils::CompositeInertia
 * (https://api.projectchrono.org/classchrono_1_1utils_1_1_composite_inertia.html):
 * add components with a frame (rotation + CoM position), a mass and a local inertia tensor;
 * "void" components subtract their mass and inertia.
 *
 *   M      = Σ mᵢ
 *   r_cm   = (1/M) Σ mᵢ rᵢ
 *   I_O    = Σ [ Rᵢ Iᵢ Rᵢᵀ + mᵢ(|rᵢ|² E − rᵢ rᵢᵀ) ]
 *   I_cm   = I_O − M(|r_cm|² E − r_cm r_cmᵀ)
 */
import { addM, pointInertia, rotateTensor, subM, zeros, type Mat3 } from './mat3';
import { scale, type Vec3 } from './vec';

export class CompositeInertia {
  private m = 0;
  private firstMoment: Vec3 = [0, 0, 0];
  private iO: Mat3 = zeros();

  /**
   * @param R        rotation of the component's local axes into this composite's frame
   * @param com      component CoM in this composite's frame (m)
   * @param mass     kg (positive)
   * @param Ilocal   inertia about the component's own CoM in its local axes (kg·m²)
   * @param isVoid   subtract instead of add (a hole cut from a solid)
   */
  addComponent(R: Mat3, com: Vec3, mass: number, Ilocal: Mat3, isVoid = false): this {
    const s = isVoid ? -1 : 1;
    const m = s * mass;
    this.m += m;
    this.firstMoment = [this.firstMoment[0] + m * com[0], this.firstMoment[1] + m * com[1], this.firstMoment[2] + m * com[2]];
    const Irot = rotateTensor(R, Ilocal);
    const contrib = addM(Irot, pointInertia(mass, com));
    this.iO = isVoid ? subM(this.iO, contrib) : addM(this.iO, contrib);
    return this;
  }

  /** Merge another composite expressed in the same frame. */
  addComposite(other: CompositeInertia): this {
    this.m += other.m;
    this.firstMoment = [
      this.firstMoment[0] + other.firstMoment[0],
      this.firstMoment[1] + other.firstMoment[1],
      this.firstMoment[2] + other.firstMoment[2],
    ];
    this.iO = addM(this.iO, other.iO);
    return this;
  }

  get mass(): number {
    return this.m;
  }
  /** Σ mᵢ rᵢ (kg·m). */
  get moment(): Vec3 {
    return [...this.firstMoment] as Vec3;
  }
  /** Centre of mass (m). Origin if the composite is massless. */
  get com(): Vec3 {
    return this.m !== 0 ? scale(this.firstMoment, 1 / this.m) : [0, 0, 0];
  }
  /** Inertia tensor about the frame origin O (kg·m²). */
  get inertiaO(): Mat3 {
    return [...this.iO];
  }
  /** Inertia tensor about the composite CoM, axes parallel to the frame (kg·m²). */
  get inertiaCom(): Mat3 {
    return subM(this.iO, pointInertia(this.m, this.com));
  }
}
