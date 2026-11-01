import UIKit
import Capacitor

class NASViewController: CAPBridgeViewController {
    override open func capacitorDidLoad() {
        super.capacitorDidLoad()
        bridge?.registerPluginInstance(PhotoBackupPlugin())
    }
}
