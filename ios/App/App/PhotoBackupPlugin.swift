import Foundation
import Capacitor
import Photos

@objc(PhotoBackupPlugin)
public class PhotoBackupPlugin: CAPPlugin, CAPBridgedPlugin {

    public let identifier = "PhotoBackupPlugin"
    public let jsName = "PhotoBackup"

    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "getLibraryInfo", returnType: CAPPluginReturnPromise)
    ]

    @objc func getLibraryInfo(_ call: CAPPluginCall) {
        PHPhotoLibrary.requestAuthorization(for: .readWrite) { status in
            guard status == .authorized || status == .limited else {
                call.resolve([
                    "authorized": false,
                    "status": "\(status.rawValue)"
                ])
                return
            }

            let options = PHFetchOptions()
            let photos = PHAsset.fetchAssets(with: .image, options: options)
            let videos = PHAsset.fetchAssets(with: .video, options: options)

            call.resolve([
                "authorized": true,
                "limited": status == .limited,
                "photos": photos.count,
                "videos": videos.count,
                "total": photos.count + videos.count
            ])
        }
    }
}
