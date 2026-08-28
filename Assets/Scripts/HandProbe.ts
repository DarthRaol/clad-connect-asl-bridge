import { HandInputData } from 'SpectaclesInteractionKit.lspkg/Providers/HandInputData/HandInputData';

/**
 * Confirms whether real SIK hand joints arrive in the Lens Studio Editor preview,
 * or only on Spectacles hardware.
 *
 * The specs-interaction-recipes skill already states raw HandInputData events do NOT
 * fire in the Editor, so the expected result here is "not tracked". This runs as a
 * five-minute confirmation of that, and doubles as the first on-device sanity check
 * once a build reaches real hardware.
 *
 * Attach to any SceneObject, press play, hold your right hand up.
 *
 *   TRACKED + moving numbers -> joints available here; recording is solo-buildable.
 *   "not tracked" forever    -> perception is hardware-only, as documented.
 *
 * Reports every 30 frames to keep the log readable.
 */
@component
export class HandProbe extends BaseScriptComponent {
  // getInstance() and getHand() belong in onAwake; only .add() subscriptions
  // go inside OnStartEvent.
  private handProvider = HandInputData.getInstance();
  private hand = this.handProvider.getHand('right');

  private frames = 0;
  private tracked = 0;

  onAwake() {
    this.createEvent('UpdateEvent').bind(() => {
      this.frames++;

      const isTracked = this.hand && this.hand.isTracked();
      if (isTracked) {
        this.tracked++;
      }

      if (this.frames % 30 !== 0) {
        return;
      }

      const rate = Math.round((this.tracked / this.frames) * 100);

      if (isTracked) {
        // wrist is stable — good for normalization origin and motion deltas.
        // indexTip is jittery during pinch open/close — expect noise here.
        print(
          `TRACKED ${rate}% | wrist ${this.fmt(this.hand.wrist)} | index ${this.fmt(this.hand.indexTip)}`
        );
      } else {
        print(`not tracked | ${this.tracked}/${this.frames} frames`);
      }
    });
  }

  private fmt(joint): string {
    if (!joint || !joint.position) {
      return 'null';
    }
    const p = joint.position;
    return `(${p.x.toFixed(1)}, ${p.y.toFixed(1)}, ${p.z.toFixed(1)})`;
  }
}
