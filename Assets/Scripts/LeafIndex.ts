import {scenariosIndex} from "Leaf.lspkg/Scenarios/decorator/ScenarioIndexDecorator"
import {ScenarioMetadata} from "Leaf.lspkg/Scenarios/scenario/ScenarioMetadata"
import {SignBridgeCompletesWordScenario} from "./SignBridgeCompletesWordScenario"
import {SignBridgeInterruptedHoldScenario} from "./SignBridgeInterruptedHoldScenario"
import {SignBridgeLowConfidenceScenario} from "./SignBridgeLowConfidenceScenario"
import {SignBridgeNoSpuriousDoubleScenario} from "./SignBridgeNoSpuriousDoubleScenario"
import {SignBridgeWrongLetterScenario} from "./SignBridgeWrongLetterScenario"

@component
export class LeafIndex extends BaseScriptComponent {
  @scenariosIndex
  static scenariosIndex: ScenarioMetadata[] = [
    {
      id: "signbridge-completes-word",
      typename: SignBridgeCompletesWordScenario.getTypeName()
    },
    {
      id: "signbridge-low-confidence-never-commits",
      typename: SignBridgeLowConfidenceScenario.getTypeName()
    },
    {
      id: "signbridge-interrupted-hold",
      typename: SignBridgeInterruptedHoldScenario.getTypeName()
    },
    {
      id: "signbridge-wrong-letter-does-not-advance",
      typename: SignBridgeWrongLetterScenario.getTypeName()
    },
    {
      id: "signbridge-no-spurious-double",
      typename: SignBridgeNoSpuriousDoubleScenario.getTypeName()
    }
  ]
}
